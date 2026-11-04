"""
Tests des administrateurs spécialisés (lits, sang, ambulances) et de
l'administrateur général : une ligne de la matrice des droits par test.

Établissements : deux hôpitaux à Dakar (A, B), un à Thiès (C), le CNTS de
Dakar et un SAMU à Dakar.
"""

from io import StringIO

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase, override_settings

from ambulances.models import Ambulance, Mission
from core.asgi import application
from lits.models import BedCapacity
from realtime.broadcast import broadcast_alert
from realtime.tickets import issue_ticket
from sang.models import BloodRequest
from security.roles import Role
from users.tests.factories import ORIGIN, api_client, make_facility, make_user

BEDS = '/api/lits/capacities/'
REQUESTS = '/api/sang/requests/'
VEHICLES = '/api/ambulances/vehicles/'
MISSIONS = '/api/ambulances/missions/'
USERS = '/api/users/'


def ids(response):
    return {row['id'] for row in response.data['results']}


class Network:
    """Établissements et comptes partagés par les tests."""

    @classmethod
    def build(cls, target):
        target.hosp_a = make_facility("Hôpital A")
        target.hosp_b = make_facility("Hôpital B", east_km=5)
        target.hosp_c = make_facility("Hôpital C", region='thies', city='Thiès', north_km=60)
        target.cnts = make_facility("CNTS Dakar", facility_type='blood_bank', east_km=2)
        target.samu = make_facility("SAMU Dakar", facility_type='ambulance_service', north_km=1)
        target.samu_thies = make_facility(
            "SAMU Thiès", facility_type='ambulance_service', region='thies', city='Thiès', north_km=61
        )

        target.admin = make_user('admin', Role.ADMIN)
        target.bed_a = make_user('lits_a', Role.BED_MANAGER, facility=target.hosp_a)
        target.blood_a = make_user('sang_a', Role.BLOOD_MANAGER, facility=target.hosp_a)
        target.cnts_user = make_user('sang_cnts', Role.BLOOD_MANAGER, facility=target.cnts)
        target.samu_user = make_user('regulation', Role.AMBULANCE_MANAGER, facility=target.samu)
        target.legacy = make_user('historique', Role.HOSPITAL_STAFF, facility=target.hosp_a)


class DomainRolesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Network.build(cls)
        cls.cap_a = BedCapacity.objects.create(
            facility=cls.hosp_a, category='emergency', total_beds=10, occupied_beds=2
        )
        cls.cap_b = BedCapacity.objects.create(
            facility=cls.hosp_b, category='emergency', total_beds=10, occupied_beds=2
        )
        cls.req_a = BloodRequest.objects.create(facility=cls.hosp_a, blood_group='O+', units_needed=2)
        cls.req_b = BloodRequest.objects.create(facility=cls.hosp_b, blood_group='A+', units_needed=2)
        cls.req_c = BloodRequest.objects.create(facility=cls.hosp_c, blood_group='B+', units_needed=2)
        lat, lon = ORIGIN
        cls.amb_samu = Ambulance.objects.create(
            plate_number='DK-1000-AA', facility=cls.samu, latitude=lat, longitude=lon
        )
        cls.amb_thies = Ambulance.objects.create(plate_number='TH-2000-BB', facility=cls.samu_thies)
        cls.mission_dakar_a = Mission.objects.create(
            region='dakar', pickup_latitude=lat, pickup_longitude=lon, destination=cls.hosp_a
        )
        cls.mission_dakar_b = Mission.objects.create(
            region='dakar', pickup_latitude=lat, pickup_longitude=lon, destination=cls.hosp_b
        )
        cls.mission_thies = Mission.objects.create(region='thies', pickup_latitude=lat, pickup_longitude=lon)

    def mission_payload(self, region='dakar'):
        lat, lon = ORIGIN
        return {
            'priority': 'urgent',
            'description': "Malaise",
            'pickup_address': "Plateau",
            'pickup_latitude': lat,
            'pickup_longitude': lon,
            'region': region,
            'caller_phone': "77 000 11 22",
        }

    # --- Lits -----------------------------------------------------------

    def test_bed_manager_manages_only_own_hospital(self):
        client = api_client(self.bed_a)
        self.assertEqual(client.post(f'{BEDS}{self.cap_a.pk}/admit/').status_code, 200)
        self.assertEqual(client.post(f'{BEDS}{self.cap_b.pk}/admit/').status_code, 403)

    def test_ambulance_manager_reads_beds_without_editing(self):
        client = api_client(self.samu_user)
        self.assertEqual(client.get(BEDS).status_code, 200)
        self.assertEqual(client.post(f'{BEDS}{self.cap_a.pk}/admit/').status_code, 403)

    def test_blood_manager_has_no_access_to_beds(self):
        self.assertEqual(api_client(self.blood_a).get(BEDS).status_code, 403)

    # --- Sang -----------------------------------------------------------

    def test_hospital_blood_manager_sees_only_own_requests(self):
        client = api_client(self.blood_a)
        self.assertEqual(ids(client.get(REQUESTS)), {self.req_a.pk})
        self.assertEqual(client.patch(f'{REQUESTS}{self.req_b.pk}/', {'units_needed': 3}, format='json').status_code, 404)
        created = client.post(REQUESTS, {'blood_group': 'O-', 'units_needed': 1, 'urgency': 'urgent'}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['facility']['id'], self.hosp_a.pk)

    def test_cnts_blood_manager_covers_its_region(self):
        client = api_client(self.cnts_user)
        self.assertEqual(ids(client.get(REQUESTS)), {self.req_a.pk, self.req_b.pk})
        response = client.patch(f'{REQUESTS}{self.req_b.pk}/', {'units_needed': 3}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(client.get(f'{REQUESTS}{self.req_c.pk}/').status_code, 404)

    def test_other_domains_cannot_reach_blood_or_forecasts(self):
        for user in (self.bed_a, self.samu_user):
            with self.subTest(user=user.username):
                client = api_client(user)
                self.assertEqual(client.get(REQUESTS).status_code, 403)
                self.assertEqual(client.get('/api/ml/predictions/').status_code, 403)
        self.assertEqual(api_client(self.blood_a).get('/api/ml/predictions/').status_code, 200)

    # --- Ambulances -----------------------------------------------------

    def test_ambulance_manager_manages_own_fleet(self):
        client = api_client(self.samu_user)
        self.assertEqual(ids(client.get(VEHICLES)), {self.amb_samu.pk})
        own = client.post(VEHICLES, {'plate_number': 'DK-3000-CC', 'facility_id': self.samu.pk}, format='json')
        self.assertEqual(own.status_code, 201, own.data)
        other = client.post(
            VEHICLES, {'plate_number': 'TH-3001-CC', 'facility_id': self.samu_thies.pk}, format='json'
        )
        self.assertEqual(other.status_code, 403)

    def test_ambulance_manager_dispatches_its_region(self):
        client = api_client(self.samu_user)
        self.assertEqual(ids(client.get(MISSIONS)), {self.mission_dakar_a.pk, self.mission_dakar_b.pk})
        self.assertEqual(client.post(MISSIONS, self.mission_payload('dakar'), format='json').status_code, 201)
        self.assertEqual(client.post(MISSIONS, self.mission_payload('thies'), format='json').status_code, 403)
        self.assertEqual(client.post(f'{MISSIONS}{self.mission_thies.pk}/assign/', {}, format='json').status_code, 404)
        foreign = client.post(
            f'{MISSIONS}{self.mission_dakar_a.pk}/assign/', {'ambulance_id': self.amb_thies.pk}, format='json'
        )
        self.assertEqual(foreign.status_code, 403)
        assigned = client.post(f'{MISSIONS}{self.mission_dakar_a.pk}/assign/', {}, format='json')
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertEqual(assigned.data['ambulance']['id'], self.amb_samu.pk)

    def test_bed_manager_follows_missions_to_its_hospital_only(self):
        client = api_client(self.bed_a)
        self.assertEqual(ids(client.get(MISSIONS)), {self.mission_dakar_a.pk})
        self.assertEqual(client.post(MISSIONS, self.mission_payload(), format='json').status_code, 403)
        self.assertEqual(client.get(VEHICLES).status_code, 403)

    def test_blood_manager_has_no_access_to_ambulances(self):
        client = api_client(self.blood_a)
        self.assertEqual(client.get(MISSIONS).status_code, 403)
        self.assertEqual(client.get(VEHICLES).status_code, 403)

    # --- Rôle historique et administrateur général ----------------------

    def test_legacy_hospital_staff_keeps_its_rights_within_its_region(self):
        client = api_client(self.legacy)
        self.assertEqual(client.post(f'{BEDS}{self.cap_a.pk}/admit/').status_code, 200)
        self.assertEqual(ids(client.get(REQUESTS)), {self.req_a.pk})
        # Régulation conservée, mais limitée à sa région (plus de périmètre national).
        self.assertEqual(ids(client.get(MISSIONS)), {self.mission_dakar_a.pk, self.mission_dakar_b.pk})
        self.assertEqual(client.post(MISSIONS, self.mission_payload('dakar'), format='json').status_code, 201)
        self.assertEqual(client.post(MISSIONS, self.mission_payload('thies'), format='json').status_code, 403)

    def test_general_admin_sees_everything(self):
        client = api_client(self.admin)
        self.assertEqual(ids(client.get(REQUESTS)), {self.req_a.pk, self.req_b.pk, self.req_c.pk})
        self.assertEqual(ids(client.get(VEHICLES)), {self.amb_samu.pk, self.amb_thies.pk})
        # Supervision : il voit tout mais n'opère pas (détail : SupervisionTests).
        self.assertEqual(client.post(f'{BEDS}{self.cap_b.pk}/admit/').status_code, 403)

    # --- Création des comptes -------------------------------------------

    def create_account(self, **overrides):
        payload = {
            'username': 'nouveau',
            'password': 'Dund0u-Secure!',
            'first_name': 'Aliou',
            'last_name': 'Sow',
            'role': 'bed_manager',
            'facility_id': self.hosp_a.pk,
        }
        payload.update(overrides)
        return api_client(self.admin).post(USERS, payload, format='json')

    def test_specialized_roles_need_a_compatible_facility(self):
        self.assertEqual(self.create_account().status_code, 201)
        cases = [
            {'facility_id': None},
            {'role': 'bed_manager', 'facility_id': self.cnts.pk},
            {'role': 'ambulance_manager', 'facility_id': self.cnts.pk},
        ]
        for overrides in cases:
            with self.subTest(overrides=overrides):
                response = self.create_account(username='autre', **overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn('facility_id', response.data)
        cnts_account = self.create_account(username='sang2', role='blood_manager', facility_id=self.cnts.pk)
        self.assertEqual(cnts_account.status_code, 201, cnts_account.data)
        self.assertEqual(cnts_account.data['role'], 'blood_manager')


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class SupervisionTests(TestCase):
    """L'administrateur général supervise : 200 en lecture, 403 sur toute opération métier."""

    @classmethod
    def setUpTestData(cls):
        Network.build(cls)
        cls.cap_a = BedCapacity.objects.create(
            facility=cls.hosp_a, category='emergency', total_beds=10, occupied_beds=2
        )
        cls.req_a = BloodRequest.objects.create(facility=cls.hosp_a, blood_group='O+', units_needed=2)
        lat, lon = ORIGIN
        cls.amb = Ambulance.objects.create(
            plate_number='DK-1000-AA', facility=cls.samu, latitude=lat, longitude=lon
        )
        cls.mission = Mission.objects.create(region='dakar', pickup_latitude=lat, pickup_longitude=lon)

    def setUp(self):
        self.client = api_client(self.admin)

    def assert_read_only(self, response, label):
        self.assertEqual(response.status_code, 403, label)
        self.assertIn('Lecture seule', str(response.data['detail']), label)

    def test_admin_reads_every_domain(self):
        for url in (
            REQUESTS,
            f'{REQUESTS}{self.req_a.pk}/',
            '/api/sang/stocks/',
            '/api/sang/orders/',
            '/api/sang/donations/',
            BEDS,
            f'{BEDS}summary/',
            f'{BEDS}tension/',
            '/api/lits/reservations/',
            VEHICLES,
            f'{VEHICLES}nearest/?latitude={ORIGIN[0]}&longitude={ORIGIN[1]}',
            MISSIONS,
            f'{MISSIONS}{self.mission.pk}/',
            f'{MISSIONS}stats/',
            f'{MISSIONS}demand/',
        ):
            self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_admin_cannot_operate_blood(self):
        req = f'{REQUESTS}{self.req_a.pk}/'
        cases = [
            ('post', REQUESTS, {'blood_group': 'O-', 'units_needed': 1, 'facility_id': self.hosp_a.pk}),
            ('patch', req, {'units_needed': 5}),
            ('post', f'{req}cancel/', {}),
            ('post', f'{req}alert-next-wave/', {}),
            ('post', '/api/sang/stocks/', {'blood_group': 'O-', 'component': 'red_cells', 'units_available': 3,
                                           'facility_id': self.cnts.pk}),
            ('post', '/api/sang/orders/', {'supplier_id': self.cnts.pk, 'blood_group': 'O-', 'units': 1,
                                           'requester_id': self.hosp_a.pk}),
            ('post', '/api/sang/campaigns/', {'region': 'dakar', 'blood_group': 'O-'}),
            ('post', '/api/sang/drives/', {'title': 'Collecte'}),
        ]
        for method, url, payload in cases:
            self.assert_read_only(getattr(self.client, method)(url, payload, format='json'), f'{method} {url}')
        self.req_a.refresh_from_db()
        self.assertEqual((self.req_a.status, self.req_a.units_needed), ('open', 2))
        self.assertEqual(BloodRequest.objects.count(), 1)

    def test_admin_cannot_look_up_a_donor(self):
        # Minimisation des données personnelles : réservé à qui enregistre le don.
        self.assert_read_only(self.client.get('/api/sang/donors/lookup/?phone_number=771234567'), 'lookup')

    def test_admin_cannot_operate_beds(self):
        cap = f'{BEDS}{self.cap_a.pk}/'
        cases = [
            ('post', BEDS, {'category': 'pediatrics', 'total_beds': 4, 'facility_id': self.hosp_a.pk}),
            ('patch', cap, {'occupied_beds': 9}),
            ('post', f'{cap}admit/', {}),
            ('post', f'{cap}discharge/', {}),
            ('post', f'{cap}confirm/', {}),
            ('post', '/api/lits/reservations/', {'capacity_id': self.cap_a.pk}),
        ]
        for method, url, payload in cases:
            self.assert_read_only(getattr(self.client, method)(url, payload, format='json'), f'{method} {url}')
        self.cap_a.refresh_from_db()
        self.assertEqual((self.cap_a.occupied_beds, self.cap_a.reserved_beds), (2, 0))

    def test_admin_cannot_dispatch_nor_edit_the_fleet(self):
        mission = f'{MISSIONS}{self.mission.pk}/'
        vehicle = f'{VEHICLES}{self.amb.pk}/'
        payload = {
            'priority': 'urgent', 'description': 'Malaise', 'pickup_address': 'Plateau',
            'pickup_latitude': ORIGIN[0], 'pickup_longitude': ORIGIN[1], 'region': 'dakar',
        }
        cases = [
            ('post', MISSIONS, payload),
            ('patch', mission, {'priority': 'critical'}),
            ('post', f'{mission}assign/', {}),
            ('post', f'{mission}status/', {'status': 'cancelled', 'cancellation_reason': 'test'}),
            ('post', f'{MISSIONS}incident/', {**payload, 'victims': 2, 'ambulances': 1}),
            ('post', f'{MISSIONS}transfer/', {'destination_id': self.hosp_b.pk, 'category': 'emergency'}),
            ('post', f'{mission}location-link/', {'phone_number': '771234567'}),
            ('post', f'{mission}bilan/', {'notes': 'stable'}),
            ('post', VEHICLES, {'plate_number': 'DK-9999-ZZ', 'facility': self.samu.pk}),
            ('patch', vehicle, {'plate_number': 'DK-0000-ZZ'}),
            ('post', f'{vehicle}availability/', {'status': 'out_of_service'}),
            ('post', f'{vehicle}position/', {'latitude': ORIGIN[0], 'longitude': ORIGIN[1]}),
            ('post', f'{vehicle}check/', {'oxygen_ok': True}),
        ]
        for method, url, payload in cases:
            self.assert_read_only(getattr(self.client, method)(url, payload, format='json'), f'{method} {url}')
        # Liste des ambulanciers affectables : gestion de la flotte, pas de la supervision.
        self.assert_read_only(self.client.get(f'{VEHICLES}drivers/'), 'drivers')
        self.mission.refresh_from_db()
        self.amb.refresh_from_db()
        self.assertEqual((self.mission.status, self.mission.ambulance_id), ('pending', None))
        self.assertEqual((self.amb.plate_number, self.amb.status), ('DK-1000-AA', 'available'))
        self.assertEqual(Mission.objects.count(), 1)

    def test_admin_keeps_platform_administration(self):
        # Comptes, établissements (plateau technique) : droits inchangés.
        self.assertEqual(self.client.get(USERS).status_code, 200)
        response = self.client.patch(
            f'/api/facilities/{self.hosp_a.pk}/technical/', {'on_call_phone': '+221338000001'}, format='json'
        )
        self.assertEqual(response.status_code, 200)

    def test_operators_keep_their_actions(self):
        self.assertEqual(api_client(self.bed_a).post(f'{BEDS}{self.cap_a.pk}/admit/').status_code, 200)
        self.assertEqual(api_client(self.blood_a).post(f'{REQUESTS}{self.req_a.pk}/cancel/').status_code, 200)
        response = api_client(self.samu_user).post(f'{MISSIONS}{self.mission.pk}/assign/', {}, format='json')
        self.assertEqual(response.status_code, 200)


class DomainAlertsTests(TransactionTestCase):
    """Chaque administrateur ne reçoit que les alertes de son domaine."""

    def setUp(self):
        call_command('setup_roles', stdout=StringIO())
        Network.build(self)

    async def open(self, user):
        ticket = await sync_to_async(lambda: issue_ticket(user)[0])()
        communicator = WebsocketCommunicator(application, f'/ws/alerts/?ticket={ticket}')
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        self.assertEqual((await communicator.receive_json_from())['type'], 'connection_established')
        return communicator

    async def received(self, communicator):
        types = []
        while not await communicator.receive_nothing(timeout=0.2):
            types.append((await communicator.receive_json_from())['type'])
        return types

    async def test_alerts_are_filtered_by_domain(self):
        bed = await self.open(self.bed_a)
        blood = await self.open(self.blood_a)
        samu = await self.open(self.samu_user)
        for kind in ('bed', 'blood', 'ambulance'):
            await sync_to_async(broadcast_alert)(kind, {'event': kind}, region='dakar')

        self.assertEqual(await self.received(bed), ['bed_alert'])
        self.assertEqual(await self.received(blood), ['blood_alert'])
        self.assertEqual(await self.received(samu), ['bed_alert', 'ambulance_alert'])
        for communicator in (bed, blood, samu):
            await communicator.disconnect()

    async def test_supervisor_still_receives_every_alert(self):
        # Lecture seule ne veut pas dire sourd : l'administrateur général reçoit tout.
        admin = await self.open(self.admin)
        for kind in ('bed', 'blood', 'ambulance'):
            await sync_to_async(broadcast_alert)(kind, {'event': kind}, region='thies')
        self.assertEqual(sorted(await self.received(admin)), ['ambulance_alert', 'bed_alert', 'blood_alert'])
        await admin.disconnect()
