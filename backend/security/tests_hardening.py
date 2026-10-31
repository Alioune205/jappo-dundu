"""
Tests du durcissement : double authentification (TOTP), accès d'urgence
tracé, journal d'audit consultable, migration du rôle historique.
"""

from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from lits.models import BedCapacity
from sang.tests.helpers import make_donor
from security.models import AuditEvent, EmergencyAccess
from security.otp import code_at, current_step, new_secret, verify
from security.roles import Role, get_user_roles
from users.models import UserProfile
from users.tests.factories import PASSWORD, api_client, make_facility, make_user


class TotpTests(TestCase):
    def test_rfc6238_reference_vector(self):
        # RFC 6238, annexe B : secret « 12345678901234567890 », T = 59 s.
        secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
        self.assertEqual(code_at(secret, current_step(59)), '287082')

    def test_window_and_replay(self):
        secret = new_secret()
        step = current_step()
        self.assertEqual(verify(secret, code_at(secret, step - 1)), step - 1)
        self.assertIsNone(verify(secret, code_at(secret, step), last_used_step=step))
        self.assertIsNone(verify(secret, 'abcdef'))


class TwoFactorLoginTests(TestCase):
    def setUp(self):
        self.user = make_user('regulateur', Role.ADMIN, password=PASSWORD)

    def login(self, **extra):
        return api_client().post('/api/auth/token/', {'username': 'regulateur', 'password': PASSWORD, **extra}, format='json')

    def test_enable_then_login_requires_the_code(self):
        client = api_client(self.user)
        secret = client.post('/api/auth/2fa/setup/').data['secret']
        self.assertEqual(client.post('/api/auth/2fa/confirm/', {'code': '000000'}).status_code, 400)
        step = current_step()
        self.assertEqual(client.post('/api/auth/2fa/confirm/', {'code': code_at(secret, step)}).data['enabled'], True)

        missing = self.login()
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(missing.data['code'], 'otp_required')
        ok = self.login(otp=code_at(secret, step + 1))
        self.assertEqual(ok.status_code, 200)
        self.assertIn('access', ok.data)
        self.assertEqual(AuditEvent.objects.filter(action='two_factor.enabled').count(), 1)

    def test_login_unchanged_without_2fa(self):
        self.assertEqual(self.login().status_code, 200)


class EmergencyAccessTests(TestCase):
    def setUp(self):
        self.home = make_facility("Hôpital A")
        self.other = make_facility("Hôpital B", north_km=5)
        self.manager = make_user('lits_a', Role.BED_MANAGER, facility=self.home)
        self.capacity = BedCapacity.objects.create(facility=self.other, category='emergency', total_beds=4)

    def test_grant_opens_the_other_facility_for_an_hour_and_is_audited(self):
        client = api_client(self.manager)
        url = f'/api/lits/capacities/{self.capacity.pk}/admit/'
        self.assertEqual(client.post(url).status_code, 403)
        short = client.post('/api/security/emergency-access/', {'facility_id': self.other.pk, 'domain': 'beds', 'reason': 'x'})
        self.assertEqual(short.status_code, 400)  # motif trop court
        granted = client.post(
            '/api/security/emergency-access/',
            {'facility_id': self.other.pk, 'domain': 'beds', 'reason': "Hôpital B injoignable, polytraumatisé en route"},
        )
        self.assertEqual(granted.status_code, 201)
        self.assertEqual(client.post(url).status_code, 200)
        self.assertTrue(AuditEvent.objects.filter(action='emergency_access.open', facility=self.other).exists())
        # Expiré : l'accès se referme.
        EmergencyAccess.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(client.post(url).status_code, 403)

    def test_domain_must_be_managed(self):
        response = api_client(self.manager).post(
            '/api/security/emergency-access/',
            {'facility_id': self.other.pk, 'domain': 'blood', 'reason': "Besoin urgent de poches O-"},
        )
        self.assertEqual(response.status_code, 403)


class AuditLogTests(TestCase):
    def test_admin_reads_donor_lookups(self):
        admin = make_user('admin', Role.ADMIN)
        hospital = make_facility("Hôpital A")
        manager = make_user('sang_a', Role.BLOOD_MANAGER, facility=hospital)
        donor = make_donor('awa')
        api_client(manager).get('/api/sang/donors/lookup/', {'card_code': donor.card_code})
        rows = api_client(admin).get('/api/security/audit/', {'action': 'donor.'}).data
        self.assertEqual(rows[0]['action'], 'donor.lookup')
        self.assertEqual(rows[0]['facility']['name'], "Hôpital A")
        self.assertEqual(api_client(manager).get('/api/security/audit/').status_code, 403)


class HospitalStaffMigrationTests(TestCase):
    def test_roles_follow_the_facility_type(self):
        hospital = make_facility("Hôpital A")
        user = make_user('ancien', Role.HOSPITAL_STAFF, facility=hospital)
        out = StringIO()
        call_command('migrate_hospital_staff', stdout=out)
        self.assertEqual(get_user_roles(user), {Role.HOSPITAL_STAFF})  # aperçu : rien ne change
        call_command('migrate_hospital_staff', '--apply', stdout=out)
        user.refresh_from_db()
        self.assertEqual(get_user_roles(user), {Role.BED_MANAGER, Role.BLOOD_MANAGER})


class ConsentTests(TestCase):
    def test_registration_records_terms_acceptance(self):
        body = {
            'username': '771112233',
            'password': PASSWORD,
            'first_name': 'Awa',
            'last_name': 'Ndiaye',
            'phone_number': '77 111 22 33',
            'region': 'dakar',
            'accept_terms': True,
        }
        self.assertEqual(api_client().post('/api/users/register/', body, format='json').status_code, 201)
        profile = UserProfile.objects.get(user__username='771112233')
        self.assertIsNotNone(profile.terms_accepted_at)
        self.assertEqual(profile.terms_version, '2026-10')
