"""
Tests des comptes : inscription, compte connecté, mot de passe, rôles et
gestion des comptes par l'administrateur.

Auteur : Ibrahima Khalilou Diallo
"""

from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken

from security.roles import Role, get_user_roles
from users import services
from users.models import UserProfile
from users.views import RegistrationThrottle

from .factories import PASSWORD, api_client, make_facility, make_user

User = get_user_model()

REGISTER_URL = '/api/users/register/'
ME_URL = '/api/users/me/'
PASSWORD_URL = '/api/users/me/password/'
USERS_URL = '/api/users/'


def registration(**overrides):
    payload = {
        'username': 'awa',
        'password': 'Dund0u-Secure!',
        'first_name': 'Awa',
        'last_name': 'Ndiaye',
        'phone_number': "77 123 45 67",
        'region': 'thies',
        'email': 'awa@example.sn',
    }
    payload.update(overrides)
    return payload


class RegistrationTests(TestCase):
    def setUp(self):
        self.client = api_client()

    def test_registration_creates_donor_and_returns_tokens(self):
        response = self.client.post(REGISTER_URL, registration(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(username='awa')
        self.assertEqual(get_user_roles(user), {Role.DONOR})
        self.assertEqual(user.profile.phone_number, '+221771234567')
        self.assertEqual(user.profile.region, 'thies')
        self.assertTrue(user.check_password('Dund0u-Secure!'))
        self.assertEqual(response.data['user']['role'], 'donor')
        self.assertEqual(response.data['user']['phone_number'], '+221771234567')
        self.assertNotIn('password', response.data['user'])
        self.assertEqual(AccessToken(response.data['access'])['role'], 'donor')

    def test_tokens_are_usable_and_refresh_is_revocable(self):
        tokens = self.client.post(REGISTER_URL, registration(), format='json').data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        self.assertEqual(self.client.get(ME_URL).status_code, 200)
        logout = self.client.post(
            '/api/auth/logout/', {'refresh': tokens['refresh']}, format='json'
        )
        self.assertEqual(logout.status_code, 200)

    def test_invalid_token_does_not_block_registration(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalide")
        response = self.client.post(REGISTER_URL, registration(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_duplicates_are_rejected_case_insensitively(self):
        self.client.post(REGISTER_URL, registration(), format='json')
        cases = {
            'username': registration(username='AWA', phone_number='770000001', email=''),
            'phone_number': registration(username='awa2', phone_number='+221771234567', email=''),
            'email': registration(
                username='awa3', phone_number='770000002', email='AWA@example.sn'
            ),
        }
        for field, payload in cases.items():
            with self.subTest(field=field):
                response = self.client.post(REGISTER_URL, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_validation_errors(self):
        cases = {
            'password': registration(password='123'),
            'phone_number': registration(phone_number='0612345678'),
            'region': registration(region='paris'),
            'first_name': registration(first_name=''),
            'username': registration(username="awa ndiaye!"),
        }
        for field, payload in cases.items():
            with self.subTest(field=field):
                response = self.client.post(REGISTER_URL, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertFalse(User.objects.exists())

    def test_password_similar_to_username_is_rejected(self):
        response = self.client.post(
            REGISTER_URL, registration(username='mamadou', password='mamadou1'), format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_registration_is_rate_limited(self):
        with mock.patch.object(RegistrationThrottle, 'rate', '2/hour'):
            for index in range(2):
                response = self.client.post(
                    REGISTER_URL,
                    registration(
                        username=f'user{index}', phone_number=f'77000000{index}', email=''
                    ),
                    format='json',
                )
                self.assertEqual(response.status_code, 201)
            response = self.client.post(
                REGISTER_URL,
                registration(username='user9', phone_number='770000009', email=''),
                format='json',
            )
        self.assertEqual(response.status_code, 429)


class AccountTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.facility = make_facility()
        cls.staff = make_user(
            'fatou', Role.HOSPITAL_STAFF, facility=cls.facility, phone='+221770000010'
        )
        cls.other = make_user('moussa', Role.DONOR, phone='+221770000011')

    def test_requires_authentication(self):
        self.assertEqual(api_client().get(ME_URL).status_code, 401)

    def test_get_account(self):
        data = api_client(self.staff).get(ME_URL).data
        self.assertEqual(data['username'], 'fatou')
        self.assertEqual(data['role'], 'hospital_staff')
        self.assertEqual(data['roles'], ['hospital_staff'])
        self.assertEqual(data['facility']['id'], self.facility.pk)
        self.assertEqual(data['region_display'], 'Dakar')

    def test_account_without_profile_is_readable_without_writing(self):
        admin = User.objects.create_superuser('root', 'root@example.sn', PASSWORD)
        response = api_client(admin).get(ME_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'admin')
        self.assertIsNone(response.data['phone_number'])
        self.assertIsNone(response.data['facility'])
        self.assertFalse(UserProfile.objects.filter(user=admin).exists())

    def test_patch_account(self):
        response = api_client(self.staff).patch(
            ME_URL,
            {'first_name': 'Fatou', 'phone_number': "76 555 44 33", 'region': 'thies'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.first_name, 'Fatou')
        self.assertEqual(self.staff.profile.phone_number, '+221765554433')
        self.assertEqual(self.staff.profile.region, 'thies')

    def test_patch_creates_missing_profile(self):
        user = User.objects.create_user('sans_profil', password=PASSWORD)
        response = api_client(user).patch(ME_URL, {'region': 'kolda'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(UserProfile.objects.get(user=user).region, 'kolda')

    def test_role_and_facility_are_read_only(self):
        api_client(self.other).patch(ME_URL, {'role': 'admin', 'facility': 1}, format='json')
        self.assertEqual(get_user_roles(self.other), {Role.DONOR})

    def test_duplicate_phone_is_rejected(self):
        response = api_client(self.staff).patch(
            ME_URL, {'phone_number': '770000011'}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone_number', response.data)

    def test_put_is_not_allowed(self):
        self.assertEqual(api_client(self.staff).put(ME_URL, {}, format='json').status_code, 405)


class PasswordChangeTests(TestCase):
    def setUp(self):
        self.user = make_user('ibra', Role.DONOR, password=PASSWORD)
        self.client = api_client()
        login = self.client.post(
            '/api/auth/token/', {'username': 'ibra', 'password': PASSWORD}, format='json'
        )
        self.refresh = login.data['refresh']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

    def change(self, current=PASSWORD, new='N0uveau-Secret!'):
        return self.client.post(
            PASSWORD_URL, {'current_password': current, 'new_password': new}, format='json'
        )

    def test_success_revokes_other_sessions(self):
        response = self.change()
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('N0uveau-Secret!'))
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.user).count(), 1)
        old_refresh = self.client.post(
            '/api/auth/token/refresh/', {'refresh': self.refresh}, format='json'
        )
        self.assertEqual(old_refresh.status_code, 401)
        new_refresh = self.client.post(
            '/api/auth/token/refresh/', {'refresh': response.data['refresh']}, format='json'
        )
        self.assertEqual(new_refresh.status_code, 200)

    def test_wrong_current_password(self):
        response = self.change(current='mauvais')
        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)

    def test_same_or_weak_password(self):
        self.assertIn('new_password', self.change(new=PASSWORD).data)
        self.assertIn('new_password', self.change(new='1234').data)


class RoleServiceTests(TestCase):
    def test_set_role_replaces_previous_role(self):
        user = make_user('awa', Role.DONOR)
        services.set_role(user, Role.HOSPITAL_STAFF)
        self.assertEqual(get_user_roles(user), {Role.HOSPITAL_STAFF})
        services.set_role(user, Role.ADMIN)
        user.refresh_from_db()
        self.assertTrue(user.is_staff)
        self.assertEqual(get_user_roles(user), {Role.ADMIN})
        services.set_role(user, Role.AMBULANCE_DRIVER)
        user.refresh_from_db()
        self.assertFalse(user.is_staff)
        self.assertEqual(get_user_roles(user), {Role.AMBULANCE_DRIVER})

    def test_add_role_keeps_existing_roles(self):
        user = make_user('fatou', Role.HOSPITAL_STAFF, facility=make_facility())
        services.add_role(user, Role.DONOR)
        self.assertEqual(get_user_roles(user), {Role.HOSPITAL_STAFF, Role.DONOR})
        with self.assertRaises(ValueError):
            services.add_role(user, Role.ADMIN)

    def test_groups_are_created_when_setup_roles_was_not_run(self):
        user = make_user('awa', Role.DONOR)
        self.assertTrue(user.groups.filter(name='donor').exists())
        call_command('setup_roles', stdout=StringIO())
        self.assertEqual(get_user_roles(user), {Role.DONOR})

    def test_roles_of_matches_security_rules(self):
        facility = make_facility()
        users = [
            make_user('a', Role.ADMIN),
            make_user('b', Role.HOSPITAL_STAFF, facility=facility),
            make_user('c', Role.AMBULANCE_DRIVER),
            make_user('d', Role.DONOR),
            make_user('e'),
        ]
        for user in User.objects.filter(pk__in=[u.pk for u in users]).prefetch_related('groups'):
            with self.subTest(user=user.username), self.assertNumQueries(1):
                self.assertEqual(services.roles_of(user), get_user_roles(user))


class UserAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.facility = make_facility()
        cls.admin = make_user('admin', Role.ADMIN)
        cls.staff = make_user('fatou', Role.HOSPITAL_STAFF, facility=cls.facility)
        cls.donor = make_user('awa', Role.DONOR, password=PASSWORD, phone='+221770000020')

    def setUp(self):
        self.client = api_client(self.admin)

    def create(self, **overrides):
        payload = {
            'username': 'nouveau',
            'password': 'Dund0u-Secure!',
            'first_name': 'Aliou',
            'last_name': 'Sow',
            'role': 'hospital_staff',
            'facility_id': self.facility.pk,
        }
        payload.update(overrides)
        return self.client.post(USERS_URL, payload, format='json')

    def test_only_admins(self):
        for user in (self.staff, self.donor):
            self.assertEqual(api_client(user).get(USERS_URL).status_code, 403)
        self.assertEqual(api_client().get(USERS_URL).status_code, 401)

    def test_create_staff_account(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['role'], 'hospital_staff')
        self.assertEqual(response.data['facility']['id'], self.facility.pk)
        user = User.objects.get(username='nouveau')
        self.assertEqual(get_user_roles(user), {Role.HOSPITAL_STAFF})
        self.assertTrue(user.check_password('Dund0u-Secure!'))

    def test_create_validation(self):
        cases = [
            ({'facility_id': None}, 'facility_id'),
            ({'role': 'donor'}, 'facility_id'),
            ({'role': 'superhero'}, 'role'),
            ({'password': 'abc'}, 'password'),
            ({'username': 'FATOU'}, 'username'),
        ]
        for overrides, field in cases:
            with self.subTest(overrides=overrides):
                response = self.create(**overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        missing = self.client.post(USERS_URL, {'username': 'x'}, format='json')
        self.assertEqual(missing.status_code, 400)

    def test_inactive_facility_is_rejected(self):
        closed = make_facility("Fermé", is_active=False)
        response = self.create(facility_id=closed.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('facility_id', response.data)

    def test_list_filters_without_n_plus_one(self):
        for index in range(5):
            make_user(f'donneur{index}', Role.DONOR)
        with self.assertNumQueries(3):
            # comptage + page (profil et établissement joints) + groupes préchargés ;
            # la permission admin (is_staff) ne coûte aucune requête.
            response = self.client.get(USERS_URL, {'role': 'donor'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 6)
        self.assertTrue(all(row['role'] == 'donor' for row in response.data['results']))

    def test_filters(self):
        self.assertEqual(self.client.get(USERS_URL, {'role': 'admin'}).data['count'], 1)
        self.assertEqual(
            self.client.get(USERS_URL, {'facility': self.facility.pk}).data['count'], 1
        )
        self.assertEqual(self.client.get(USERS_URL, {'search': '770000020'}).data['count'], 1)
        self.assertEqual(self.client.get(USERS_URL, {'role': 'x'}).status_code, 400)

    def test_change_role_clears_facility(self):
        response = self.client.patch(
            f'{USERS_URL}{self.staff.pk}/', {'role': 'donor'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], 'donor')
        self.assertIsNone(response.data['facility'])
        self.assertEqual(get_user_roles(self.staff), {Role.DONOR})

    def test_deactivation_revokes_sessions(self):
        login = api_client().post(
            '/api/auth/token/', {'username': 'awa', 'password': PASSWORD}, format='json'
        )
        response = self.client.patch(
            f'{USERS_URL}{self.donor.pk}/', {'is_active': False}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        refresh = api_client().post(
            '/api/auth/token/refresh/', {'refresh': login.data['refresh']}, format='json'
        )
        self.assertEqual(refresh.status_code, 401)

    def test_admin_cannot_lock_themselves_out(self):
        url = f'{USERS_URL}{self.admin.pk}/'
        self.assertEqual(self.client.patch(url, {'role': 'donor'}, format='json').status_code, 400)
        self.assertEqual(
            self.client.patch(url, {'is_active': False}, format='json').status_code, 400
        )

    def test_superuser_role_is_immutable(self):
        root = User.objects.create_superuser('root', 'root@example.sn', PASSWORD)
        response = self.client.patch(f'{USERS_URL}{root.pk}/', {'role': 'donor'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_no_delete(self):
        self.assertEqual(self.client.delete(f'{USERS_URL}{self.donor.pk}/').status_code, 405)
