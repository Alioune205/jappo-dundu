"""Tests du mode « plusieurs victimes » (incident) et de la demande par heure."""

from datetime import datetime

from django.test import TestCase, override_settings
from django.utils import timezone

from users.tests.factories import ORIGIN, api_client

from .models import Incident, Mission
from .tests import MISSIONS, AmbulanceFixturesMixin, make_mission


@override_settings(OSRM_URL='')
class IncidentTests(AmbulanceFixturesMixin, TestCase):
    def body(self, **fields):
        return {
            'victims': 5,
            'ambulances': 3,
            'description': 'Collision bus et camion',
            'pickup_address': 'Autoroute à péage, sortie Rufisque',
            'pickup_latitude': ORIGIN[0],
            'pickup_longitude': ORIGIN[1],
            'region': 'dakar',
            **fields,
        }

    def test_one_mission_per_ambulance_assigned_while_available(self):
        response = api_client(self.admin).post(f'{MISSIONS}incident/', self.body(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data), 3)
        # 2 ambulances disponibles à moins de 50 km (une 3e est à 120 km, une 4e hors service).
        self.assertEqual([m['status'] for m in response.data], ['assigned', 'assigned', 'pending'])
        summary = response.data[0]['incident_summary']
        self.assertEqual((summary['victims'], summary['missions'], summary['assigned']), (5, 3, 2))

    def test_missing_ambulances_leave_missions_pending(self):
        response = api_client(self.admin).post(
            f'{MISSIONS}incident/', self.body(victims=8, ambulances=6), format='json'
        )
        statuses = [m['status'] for m in response.data]
        self.assertEqual(statuses.count('pending'), 4)
        self.assertEqual(Incident.objects.count(), 1)
        self.assertEqual(Mission.objects.filter(incident__isnull=False).count(), 6)

    def test_validation_and_access(self):
        self.assertEqual(api_client(self.admin).post(f'{MISSIONS}incident/', self.body(victims=1), format='json').status_code, 400)
        self.assertEqual(api_client(self.driver).post(f'{MISSIONS}incident/', self.body(), format='json').status_code, 403)


class DemandTests(AmbulanceFixturesMixin, TestCase):
    def test_profile_by_hour_and_zone(self):
        for hour in (8, 8, 18):
            mission = make_mission(priority='urgent')
            Mission.objects.filter(pk=mission.pk).update(
                created_at=timezone.make_aware(datetime(2026, 10, 29, hour, 15))
            )
        with self.settings(TIME_ZONE='Africa/Dakar'):
            data = api_client(self.admin).get(f'{MISSIONS}demand/', {'days': 365}).data
        self.assertEqual(data['by_hour'][8], 2)
        self.assertEqual(data['by_hour'][18], 1)
        self.assertEqual(data['zones'][0]['count'], 3)
        self.assertEqual(data['zones'][0]['peak_hour'], 8)
        self.assertEqual(api_client(self.driver).get(f'{MISSIONS}demand/').status_code, 403)
