"""Tests de la vérification de garde et de son effet sur l'affectation."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from geo import routing
from users.tests.factories import api_client, offset

from .models import ShiftCheck
from .tests import MISSIONS, VEHICLES, AmbulanceFixturesMixin, make_mission

READY = {'oxygen_ok': True, 'equipment_ok': True, 'fuel': 'full', 'crew_count': 2}


@override_settings(OSRM_URL='')
class ShiftCheckTests(AmbulanceFixturesMixin, TestCase):
    def test_driver_checks_own_ambulance(self):
        response = api_client(self.driver).post(f'{VEHICLES}{self.near.pk}/check/', READY, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['ready'], True)
        faulty = api_client(self.driver).post(
            f'{VEHICLES}{self.near.pk}/check/', {**READY, 'oxygen_ok': False, 'fuel': 'low'}, format='json'
        )
        self.assertEqual(faulty.data['issues'], ["Oxygène insuffisant", "Carburant en réserve"])
        # Un autre conducteur ne voit pas ce véhicule.
        other = api_client(self.other_driver).post(f'{VEHICLES}{self.near.pk}/check/', READY, format='json')
        self.assertEqual(other.status_code, 404)

    def test_old_check_is_not_ready(self):
        check = ShiftCheck.objects.create(ambulance=self.near, **READY)
        ShiftCheck.objects.filter(pk=check.pk).update(checked_at=timezone.now() - timedelta(hours=13))
        data = api_client(self.admin).get(f'{VEHICLES}{self.near.pk}/check/').data
        self.assertEqual((data['ready'], data['issues']), (False, ["Vérification de plus de 12 h"]))

    def test_ready_ambulance_is_preferred(self):
        # « near » est la plus rapide, mais seule « medical » est vérifiée.
        ShiftCheck.objects.create(ambulance=self.medical, **READY)

        def fake(destination, sources):
            minutes = {offset(2, 0): 5, offset(5, 0): 9}
            return [routing.TravelTime(minutes.get(s, 60), 1, 'osrm') for s in sources]

        mission = make_mission(priority='urgent')
        with mock.patch('ambulances.services.travel_times_to', side_effect=fake):
            response = api_client(self.admin).post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json')
        self.assertEqual(response.data['ambulance']['id'], self.medical.pk)
