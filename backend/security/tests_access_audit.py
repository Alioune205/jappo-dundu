"""
Tests de non-régression de l'audit des rôles et profils (octobre 2026).

Un test (ou un groupe) par faille corrigée :
1. clés API SIH : création réservée, domaines délégués, clé hachée ;
2. stocks de sang : périmètre établissement / région (ABAC) ;
3. avancement d'une mission : conducteur affecté ou régulation seulement ;
4. rôle historique ``hospital_staff`` : régulation limitée à sa région ;
5. ambulancier : son véhicule, pas l'annuaire de la flotte ;
6. téléphone / e-mail : mot de passe actuel exigé pour les remplacer ;
7. connexion sociale : refusée à un compte devenu professionnel ;
8. throttling SIH : un compteur par clé ;
9. changement de rôle : sessions révoquées.
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from ambulances.models import Ambulance, Mission
from identity.models import SocialAccount
from identity.social import SocialIdentity
from ml.models import BloodStockRecord
from security.roles import Role
from sih.authentication import SIHBurstThrottle
from sih.models import HospitalApiKey, hash_api_key
from users.services import set_role
from users.tests.factories import ORIGIN, PASSWORD, api_client, make_facility, make_user

KEYS = '/api/sih/keys/'
STOCKS = '/api/ml/stocks/'
VEHICLES = '/api/ambulances/vehicles/'
MISSIONS = '/api/ambulances/missions/'
ME = '/api/users/me/'


def sih_client(raw_key):
    client = APIClient()
    client.credentials(HTTP_X_HOSPITAL_API_KEY=raw_key)
    return client


class Network:
    @classmethod
    def build(cls, target):
        target.hosp_a = make_facility("Hôpital A")
        target.hosp_b = make_facility("Hôpital B", east_km=5)
        target.hosp_thies = make_facility("Hôpital Thiès", region='thies', city='Thiès', north_km=60)
        target.cnts = make_facility("CNTS Dakar", facility_type='blood_bank', east_km=2)
        target.samu = make_facility("SAMU Dakar", facility_type='ambulance_service', north_km=1)
        target.admin = make_user('admin', Role.ADMIN)
        target.bed_a = make_user('lits_a', Role.BED_MANAGER, facility=target.hosp_a)
        target.blood_a = make_user('sang_a', Role.BLOOD_MANAGER, facility=target.hosp_a)
        target.cnts_user = make_user('sang_cnts', Role.BLOOD_MANAGER, facility=target.cnts)
        target.samu_user = make_user('regulation', Role.AMBULANCE_MANAGER, facility=target.samu)
        target.legacy = make_user('historique', Role.HOSPITAL_STAFF, facility=target.hosp_a)
        target.driver = make_user('chauffeur', Role.AMBULANCE_DRIVER, facility=target.hosp_a)


# --- 1. Clés API SIH --------------------------------------------------------


class SIHKeyAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Network.build(cls)

    def test_roles_outside_beds_and_blood_cannot_manage_keys(self):
        for user in (self.driver, self.samu_user):
            client = api_client(user)
            self.assertEqual(client.post(KEYS, {'name': 'x'}, format='json').status_code, 403)
            self.assertEqual(client.get(KEYS).status_code, 403)
        self.assertFalse(HospitalApiKey.objects.exists())

    def test_key_only_receives_the_creator_domains(self):
        response = api_client(self.bed_a).post(KEYS, {'name': 'OpenMRS'}, format='json')
        self.assertEqual(response.status_code, 201)
        key = HospitalApiKey.objects.get()
        self.assertTrue(key.allow_beds)
        self.assertFalse(key.allow_blood)

        stocks = {'stocks': [{'blood_group': 'O+', 'units_available': 3}]}
        self.assertEqual(sih_client(response.data['key']).post('/api/sih/stocks/sync/', stocks, format='json').status_code, 403)
        self.assertFalse(BloodStockRecord.objects.exists())

    def test_cannot_delegate_a_domain_not_managed(self):
        response = api_client(self.bed_a).post(KEYS, {'name': 'x', 'allow_blood': True}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_key_is_returned_once_and_stored_hashed(self):
        raw = api_client(self.blood_a).post(KEYS, {'name': 'LIS'}, format='json').data['key']
        key = HospitalApiKey.objects.get()
        self.assertEqual(key.key_hash, hash_api_key(raw))
        self.assertNotIn(raw, (key.key_hash, key.key_prefix))
        listing = api_client(self.blood_a).get(KEYS).data
        self.assertNotIn('key', listing[0])
        self.assertEqual(sih_client(raw).get('/api/sih/ping/').status_code, 200)

    def test_manager_does_not_see_keys_of_other_domains(self):
        HospitalApiKey.objects.create(facility=self.hosp_a, allow_beds=False, allow_blood=True)
        self.assertEqual(api_client(self.bed_a).get(KEYS).data, [])
        self.assertEqual(len(api_client(self.blood_a).get(KEYS).data), 1)

    def test_admin_must_name_the_facility(self):
        self.assertEqual(api_client(self.admin).post(KEYS, {'name': 'x'}, format='json').status_code, 400)
        response = api_client(self.admin).post(KEYS, {'name': 'x', 'facility_id': self.hosp_b.pk}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_jwt_user_cannot_call_sync_endpoints(self):
        # Les flux SIH n'acceptent que la clé : un utilisateur connecté n'y a pas accès.
        self.assertIn(api_client(self.bed_a).get('/api/sih/ping/').status_code, (401, 403))


# --- 8. Throttling SIH --------------------------------------------------------


class SIHThrottleTests(TestCase):
    def test_each_key_has_its_own_counter(self):
        facility = make_facility()
        first = HospitalApiKey.objects.create(facility=facility)
        second = HospitalApiKey.objects.create(facility=facility)
        throttle = SIHBurstThrottle()
        keys = {
            throttle.get_cache_key(mock.Mock(sih_api_key=api_key), None) for api_key in (first, second)
        }
        self.assertEqual(len(keys), 2)


# --- 2. Stocks de sang --------------------------------------------------------


class BloodStockScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Network.build(cls)

    def post_stock(self, user, **payload):
        return api_client(user).post(STOCKS, {'blood_group': 'O+', 'units_available': 1, **payload}, format='json')

    def test_hospital_blood_manager_cannot_write_another_center(self):
        response = self.post_stock(self.blood_a, center_name=self.cnts.name)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(BloodStockRecord.objects.exists())

    def test_client_cannot_relabel_the_region(self):
        self.assertEqual(self.post_stock(self.blood_a, region='thies').status_code, 403)

    def test_own_facility_is_used_by_default(self):
        response = self.post_stock(self.blood_a)
        self.assertEqual(response.status_code, 201)
        record = BloodStockRecord.objects.get()
        self.assertEqual((record.center_name, record.region), (self.hosp_a.name, 'dakar'))

    def test_cnts_writes_for_its_region_only(self):
        self.assertEqual(self.post_stock(self.cnts_user, center_name=self.hosp_b.name).status_code, 201)
        self.assertEqual(self.post_stock(self.cnts_user, center_name=self.hosp_thies.name).status_code, 403)

    def test_reads_are_scoped(self):
        for center, region in ((self.hosp_a.name, 'dakar'), (self.hosp_b.name, 'dakar'), (self.hosp_thies.name, 'thies')):
            BloodStockRecord.objects.create(
                center_name=center, region=region, blood_group='O+', date='2026-10-01', units_available=5
            )

        def centers(user):
            response = api_client(user).get(STOCKS, {'days': 365})
            rows = response.data['results'] if isinstance(response.data, dict) else response.data
            return {row['center_name'] for row in rows}

        self.assertEqual(centers(self.blood_a), {self.hosp_a.name})
        self.assertEqual(centers(self.cnts_user), {self.hosp_a.name, self.hosp_b.name})
        self.assertEqual(len(centers(self.admin)), 3)


# --- 3, 4, 5. Ambulances ------------------------------------------------------


class AmbulanceScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Network.build(cls)
        lat, lon = ORIGIN
        cls.own_amb = Ambulance.objects.create(plate_number='DK-1000-AA', facility=cls.samu, driver=cls.driver)
        cls.other_amb = Ambulance.objects.create(plate_number='DK-2000-BB', facility=cls.samu)
        cls.mission = Mission.objects.create(
            region='dakar', pickup_latitude=lat, pickup_longitude=lon, destination=cls.hosp_a,
            ambulance=cls.own_amb, status='assigned',
        )
        cls.mission_thies = Mission.objects.create(region='thies', pickup_latitude=lat, pickup_longitude=lon)

    def advance(self, user, new_status='on_site'):
        return api_client(user).post(f'{MISSIONS}{self.mission.pk}/status/', {'status': new_status}, format='json')

    def test_destination_bed_manager_cannot_advance_a_mission(self):
        self.assertEqual(self.advance(self.bed_a, 'completed').status_code, 403)
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, 'assigned')

    def test_assigned_driver_advances_the_mission(self):
        self.assertEqual(self.advance(self.driver).status_code, 200)

    def test_driver_only_lists_own_vehicle(self):
        rows = api_client(self.driver).get(VEHICLES).data['results']
        self.assertEqual([row['id'] for row in rows], [self.own_amb.pk])

    def test_legacy_role_regulates_its_region_only(self):
        client = api_client(self.legacy)
        visible = {row['id'] for row in client.get(MISSIONS).data['results']}
        self.assertIn(self.mission.pk, visible)
        self.assertNotIn(self.mission_thies.pk, visible)
        lat, lon = ORIGIN
        payload = {
            'priority': 'urgent', 'description': 'Malaise', 'pickup_address': 'Thiès',
            'pickup_latitude': lat, 'pickup_longitude': lon, 'region': 'thies', 'caller_phone': '77 000 11 22',
        }
        self.assertEqual(client.post(MISSIONS, payload, format='json').status_code, 403)


# --- 6. Téléphone et e-mail ---------------------------------------------------


class RecoveryChannelChangeTests(TestCase):
    def setUp(self):
        self.user = make_user(
            'awa', Role.DONOR, password=PASSWORD, phone='+221771234567', email='awa@example.sn'
        )

    def test_replacing_phone_requires_current_password(self):
        client = api_client(self.user)
        self.assertEqual(client.patch(ME, {'phone_number': '770000099'}, format='json').status_code, 400)
        response = client.patch(ME, {'phone_number': '770000099', 'current_password': 'faux'}, format='json')
        self.assertEqual(response.status_code, 400)
        response = client.patch(ME, {'phone_number': '770000099', 'current_password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['phone_number'], '+221770000099')

    def test_replacing_email_requires_current_password(self):
        response = api_client(self.user).patch(ME, {'email': 'pirate@example.sn'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)

    def test_first_phone_and_other_fields_stay_free(self):
        social = make_user('google-1', Role.DONOR)
        response = api_client(social).patch(ME, {'phone_number': '770000098', 'region': 'thies'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(api_client(self.user).patch(ME, {'first_name': 'Awa'}, format='json').status_code, 200)


# --- 7. Connexion sociale -----------------------------------------------------


class PromotedSocialAccountTests(TestCase):
    def test_linked_account_promoted_to_staff_is_refused(self):
        user = make_user('donneur', Role.DONOR)
        SocialAccount.objects.create(user=user, provider='google', uid='g-1')
        set_role(user, Role.BED_MANAGER)
        identity = SocialIdentity(provider='google', uid='g-1')
        with mock.patch('identity.views.verify', return_value=identity):
            response = APIClient().post('/api/auth/social/google/', {}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('access', response.data)


# --- 9. Changement de rôle ----------------------------------------------------


class RoleChangeRevocationTests(TestCase):
    def test_role_change_revokes_refresh_tokens_and_closes_websockets(self):
        admin = make_user('chef', Role.ADMIN)
        user = make_user('agent', Role.BED_MANAGER, facility=make_facility())
        RefreshToken.for_user(user)
        with mock.patch('realtime.broadcast.close_user_sessions') as close:
            response = api_client(admin).patch(f'/api/users/{user.pk}/', {'role': 'donor'}, format='json')
        self.assertEqual(response.status_code, 200)
        token = OutstandingToken.objects.get(user=user)
        self.assertTrue(hasattr(token, 'blacklistedtoken'))
        close.assert_called_once_with(user.pk)
