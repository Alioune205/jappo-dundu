"""
Tests du plateau technique, de la pré-alerte (acceptation ou refus par
l'hôpital de destination), du bilan de l'équipage et du tri de l'appel.
"""

from unittest import mock

from django.test import TestCase

from lits.models import BedCapacity, BedReservation
from lits.services import reserve
from security.roles import Role
from users.tests.factories import api_client, make_facility, make_user

from . import triage
from .models import Mission
from .tests import MISSIONS, AmbulanceFixturesMixin, make_mission


class PrealertFixturesMixin(AmbulanceFixturesMixin):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.hospital.capabilities = ['ct_scan', 'trauma']
        cls.hospital.save()
        cls.small = make_facility("Centre B", north_km=3, facility_type='health_center')
        cls.bed_manager = make_user('lits_a', Role.BED_MANAGER, facility=cls.hospital)
        cls.other_bed_manager = make_user('lits_b', Role.BED_MANAGER, facility=cls.small)
        cls.er = BedCapacity.objects.create(facility=cls.hospital, category='emergency', total_beds=5)
        BedCapacity.objects.create(facility=cls.small, category='emergency', total_beds=5)


class CapabilitiesTests(PrealertFixturesMixin, TestCase):
    def url(self, facility):
        return f'/api/facilities/{facility.pk}/technical/'

    def test_staff_declares_own_facility(self):
        response = api_client(self.bed_manager).patch(
            self.url(self.hospital),
            {'capabilities': ['trauma', 'dialysis', 'trauma'], 'on_call_phone': '77 000 11 22'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['capabilities'], ['dialysis', 'trauma'])  # ordre du référentiel
        self.assertEqual(response.data['on_call_phone'], '+221770001122')
        self.assertEqual(api_client(self.other_bed_manager).patch(self.url(self.hospital), {}).status_code, 403)
        bad = api_client(self.admin).patch(self.url(self.hospital), {'capabilities': ['spa']}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_destinations_filtered_by_capability(self):
        mission = make_mission(priority='critical')
        url = f'{MISSIONS}{mission.pk}/destinations/'

        def names(params):
            return [row['name'] for row in api_client(self.admin).get(url, params).data['results']]

        self.assertEqual(names({}), ["Centre B", "Hôpital A"])
        self.assertEqual(names({'capability': 'ct_scan'}), ["Hôpital A"])
        self.assertEqual(names({'capability': 'ct_scan,dialysis'}), [])
        self.assertEqual(api_client(self.admin).get(url, {'capability': 'spa'}).status_code, 400)


class PrealertTests(PrealertFixturesMixin, TestCase):
    def setUp(self):
        self.mission = make_mission(priority='critical', ambulance=self.near, status='transporting')
        self.reservation = reserve(self.er, created_by=self.admin, mission=self.mission)
        self.mission.refresh_from_db()
        self.url = f'{MISSIONS}{self.mission.pk}/destination-response/'

    def test_new_destination_waits_for_an_answer(self):
        self.assertEqual(self.mission.destination_id, self.hospital.pk)
        self.assertEqual(self.mission.destination_status, 'pending')

    def test_hospital_accepts(self):
        response = api_client(self.bed_manager).post(self.url, {'accepted': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['destination_status'], 'accepted')
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, BedReservation.Status.ACTIVE)

    def test_refusal_is_motivated_and_frees_the_bed(self):
        client = api_client(self.bed_manager)
        self.assertEqual(client.post(self.url, {'accepted': False}, format='json').status_code, 400)
        with mock.patch('ambulances.services.notify_destination_refused') as notify:
            with self.captureOnCommitCallbacks(execute=True):
                response = client.post(self.url, {'accepted': False, 'note': "Scanner en panne"}, format='json')
        self.assertEqual(response.data['destination_status'], 'refused')
        self.assertEqual(response.data['destination_note'], "Scanner en panne")
        notify.assert_called_once()
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, BedReservation.Status.CANCELLED)

    def test_only_the_destination_answers(self):
        self.assertEqual(
            api_client(self.other_bed_manager).post(self.url, {'accepted': True}, format='json').status_code, 404
        )
        self.assertEqual(api_client(self.driver).post(self.url, {'accepted': True}, format='json').status_code, 403)

    def test_reorientation_resets_the_answer(self):
        api_client(self.bed_manager).post(self.url, {'accepted': False, 'note': "Plein"}, format='json')
        mission = Mission.objects.get(pk=self.mission.pk)
        mission.destination = self.small
        mission.save()
        mission.refresh_from_db()
        self.assertEqual((mission.destination_status, mission.destination_note), ('pending', ''))


class BilanTests(PrealertFixturesMixin, TestCase):
    def test_crew_sends_vitals(self):
        mission = make_mission(priority='urgent', ambulance=self.near, status='on_site')
        url = f'{MISSIONS}{mission.pk}/bilan/'
        response = api_client(self.driver).post(
            url, {'vitals': {'pulse': 120, 'spo2': 91}, 'notes': "Conscient, douleur thoracique"}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['vitals'], {'pulse': 120, 'spo2': 91})
        self.assertIsNotNone(response.data['bilan_updated_at'])
        # Les constantes se complètent au fil du transport.
        response = api_client(self.driver).post(url, {'vitals': {'spo2': 95}}, format='json')
        self.assertEqual(response.data['vitals'], {'pulse': 120, 'spo2': 95})
        self.assertEqual(api_client(self.driver).post(url, {'vitals': {'spo2': 140}}, format='json').status_code, 400)
        self.assertEqual(api_client(self.other_driver).post(url, {'notes': 'x'}, format='json').status_code, 404)


class TriageTests(PrealertFixturesMixin, TestCase):
    def test_assessment_rules(self):
        self.assertEqual(triage.assess({'breathing': 'absent'})['priority'], 'critical')
        self.assertEqual(triage.assess({'breathing': 'absent'})['instructions'][0], 'cpr')
        result = triage.assess({'conscious': 'yes', 'breathing': 'difficult', 'situation': 'illness'})
        self.assertEqual(result['priority'], 'urgent')
        self.assertEqual(result['instructions'], ['breathing', 'stay_safe'])
        self.assertEqual(triage.assess({'situation': 'road_accident', 'victims': '5+'})['priority'], 'critical')
        self.assertEqual(triage.assess({'conscious': 'yes', 'breathing': 'normal'})['priority'], 'normal')
        self.assertEqual(triage.assess({'breathing': 'unknown-code'})['priority'], 'normal')

    def test_endpoints_and_mission_storage(self):
        client = api_client(self.dispatcher)
        protocol = client.get('/api/ambulances/triage/').data
        self.assertEqual(protocol['questions'][0]['code'], 'conscious')
        self.assertIn('cpr', protocol['instructions'])
        assessed = client.post('/api/ambulances/triage/', {'answers': {'bleeding': 'yes'}}, format='json')
        self.assertEqual(assessed.data['priority'], 'critical')
        response = client.post(
            MISSIONS,
            {
                'priority': 'critical',
                'description': 'Accident',
                'pickup_address': 'VDN',
                'pickup_latitude': 14.7,
                'pickup_longitude': -17.45,
                'region': 'dakar',
                'triage': {'situation': 'road_accident', 'bleeding': 'yes', 'bogus': 'x'},
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['triage'], {'situation': 'road_accident', 'bleeding': 'yes'})
        self.assertEqual(response.data['triage_assessment']['priority'], 'critical')
