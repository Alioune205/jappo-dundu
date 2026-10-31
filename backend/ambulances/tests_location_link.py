"""Tests du lien de localisation envoyé par SMS à l'appelant."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from users.tests.factories import api_client, offset

from .models import LocationLink
from .tests import MISSIONS, AmbulanceFixturesMixin, make_mission


@override_settings(PUBLIC_WEB_URL='https://jappodundu.sn', OSRM_URL='')
class LocationLinkTests(AmbulanceFixturesMixin, TestCase):
    def send(self, mission, **body):
        with mock.patch('identity.sms.send_sms') as sms, self.captureOnCommitCallbacks(execute=True):
            response = api_client(self.dispatcher).post(f'{MISSIONS}{mission.pk}/location-link/', body, format='json')
        return response, sms

    def test_link_moves_the_pickup_point_once(self):
        mission = make_mission(priority='urgent', caller_phone='+221771112233')
        response, sms = self.send(mission)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(sms.call_args.args[0], '+221771112233')
        self.assertIn('https://jappodundu.sn/localiser/', sms.call_args.args[1])
        token = LocationLink.objects.get(mission=mission).token

        latitude, longitude = offset(3, 1)
        public = api_client()  # sans compte
        url = f'/api/ambulances/locate/{token}/'
        ok = public.post(url, {'latitude': latitude, 'longitude': longitude, 'accuracy': 12}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        mission.refresh_from_db()
        self.assertAlmostEqual(mission.pickup_latitude, latitude, places=5)
        # Usage unique.
        self.assertEqual(public.post(url, {'latitude': latitude, 'longitude': longitude}, format='json').status_code, 409)

    def test_expired_or_unknown_link(self):
        mission = make_mission(priority='urgent')
        self.send(mission, phone_number='77 111 22 33')
        link = LocationLink.objects.get(mission=mission)
        LocationLink.objects.filter(pk=link.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        latitude, longitude = offset(1, 0)
        body = {'latitude': latitude, 'longitude': longitude}
        self.assertEqual(api_client().post(f'/api/ambulances/locate/{link.token}/', body, format='json').status_code, 409)
        self.assertEqual(api_client().post('/api/ambulances/locate/inconnu/', body, format='json').status_code, 409)

    def test_requires_a_phone_and_the_regulation(self):
        mission = make_mission(priority='urgent')
        self.assertEqual(self.send(mission)[0].status_code, 400)
        driver = api_client(self.driver).post(f'{MISSIONS}{mission.pk}/location-link/', {}, format='json')
        self.assertIn(driver.status_code, (403, 404))
