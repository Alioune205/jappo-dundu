"""
Tests du temps de trajet par la route : estimation, OSRM simulé, repli en
cas de panne, affectation de l'ambulance la plus rapide, heure d'arrivée
estimée au fil de la mission.
"""

import io
import json
from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from geo import routing
from geo.distance import GeoPoint
from users.tests.factories import ORIGIN, api_client, offset

from . import services
from .models import Mission
from .tests import MISSIONS, VEHICLES, AmbulanceFixturesMixin, make_mission

POINT = GeoPoint(*ORIGIN)


def osrm_reply(durations, distances):
    return io.StringIO(json.dumps({'code': 'Ok', 'durations': durations, 'distances': distances}))


class RoutingTests(SimpleTestCase):
    @override_settings(OSRM_URL='', ROUTING_DETOUR_FACTOR=1.5, ROUTING_SPEED_KMH=30)
    def test_estimate_without_osrm(self):
        latitude, longitude = offset(10, 0)
        travel = routing.travel_time(POINT, latitude, longitude)
        self.assertEqual(travel.source, 'estimate')
        self.assertAlmostEqual(travel.distance_km, 15, delta=0.1)  # 10 km × 1,5
        self.assertAlmostEqual(travel.minutes, 30, delta=0.2)  # 15 km à 30 km/h

    @override_settings(OSRM_URL='http://osrm.test')
    def test_osrm_table(self):
        targets = [offset(1, 0), offset(2, 0)]
        with mock.patch('urllib.request.urlopen', return_value=osrm_reply([[600, 300]], [[4000, 2500]])) as call:
            times = routing.travel_times_from(POINT, targets)
        self.assertIn('/table/v1/driving/', call.call_args.args[0])
        self.assertEqual([(t.minutes, t.distance_km, t.source) for t in times], [(10, 4, 'osrm'), (5, 2.5, 'osrm')])

    @override_settings(OSRM_URL='http://osrm.test')
    def test_sources_to_destination(self):
        with mock.patch('urllib.request.urlopen', return_value=osrm_reply([[120], [None]], [[900], [None]])):
            times = routing.travel_times_to(POINT, [offset(1, 0), offset(3, 0)])
        self.assertEqual((times[0].minutes, times[0].source), (2, 'osrm'))
        self.assertEqual(times[1].source, 'estimate')  # point non routable : repli

    @override_settings(OSRM_URL='http://osrm.test')
    def test_fallback_when_osrm_is_down(self):
        with mock.patch('urllib.request.urlopen', side_effect=TimeoutError):
            travel = routing.travel_time(POINT, *offset(5, 0))
        self.assertEqual(travel.source, 'estimate')


class FastestAmbulanceTests(AmbulanceFixturesMixin, TestCase):
    def test_assignment_prefers_the_fastest_by_road(self):
        # « near » est à 2 km à vol d'oiseau, « medical » à 5 km, mais la route
        # de « near » fait un long détour.
        def fake(destination, sources):
            minutes = {offset(2, 0): 25, offset(5, 0): 8}
            return [routing.TravelTime(minutes.get(s, 60), 1, 'osrm') for s in sources]

        mission = make_mission(priority='critical')
        with mock.patch('ambulances.services.travel_times_to', side_effect=fake):
            response = api_client(self.dispatcher).post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ambulance']['id'], self.medical.pk)

    def test_nearest_list_is_sorted_by_travel_time(self):
        latitude, longitude = ORIGIN
        response = api_client(self.admin).get(f'{VEHICLES}nearest/', {'latitude': latitude, 'longitude': longitude})
        rows = response.data
        self.assertTrue(all(row['travel_minutes'] is not None for row in rows))
        self.assertEqual([row['travel_minutes'] for row in rows], sorted(row['travel_minutes'] for row in rows))


@override_settings(OSRM_URL='')
class EtaTests(AmbulanceFixturesMixin, TestCase):
    def test_eta_follows_the_mission(self):
        mission = make_mission(priority='urgent')
        response = api_client(self.dispatcher).post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json')
        self.assertIsNotNone(response.data['eta_at'])
        self.assertEqual(response.data['eta_source'], 'estimate')
        # Sur place : plus d'arrivée à estimer.
        mission.refresh_from_db()
        services.advance(mission, 'on_site')
        mission.refresh_from_db()
        self.assertIsNone(mission.eta_at)
        # En route vers l'hôpital : nouvelle estimation, vers la destination.
        services.advance(mission, 'transporting', destination=self.hospital)
        mission.refresh_from_db()
        self.assertIsNotNone(mission.eta_at)

    def test_position_updates_refresh_the_eta_at_most_every_minute(self):
        mission = make_mission(priority='urgent')
        services.assign(mission)
        mission.refresh_from_db()
        first = mission.eta_at
        ambulance = mission.ambulance
        services.update_position(ambulance, GeoPoint(*offset(0.5, 0)))
        mission.refresh_from_db()
        self.assertEqual(mission.eta_at, first)  # moins d'une minute : inchangé
        Mission.objects.filter(pk=mission.pk).update(eta_updated_at=timezone.now() - timedelta(minutes=2))
        services.update_position(ambulance, GeoPoint(*offset(0.5, 0)))
        mission.refresh_from_db()
        self.assertLess(mission.eta_at, first + timedelta(minutes=2))
        self.assertNotEqual(mission.eta_updated_at, first)
