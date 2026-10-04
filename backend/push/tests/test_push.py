"""
Tests des notifications push : enregistrement des téléphones, envoi par
lots au service Expo (simulé, aucun appel réseau), désactivation des jetons
morts, sollicitation des donneurs à la création d'une demande de sang.
"""

import json
from unittest import mock

from django.test import TestCase, override_settings

from sang.tests.helpers import SangFixturesMixin, make_donor
from security.roles import Role
from users.tests.factories import api_client, make_user

from ..models import PushDevice
from ..services import BATCH_SIZE, is_valid_token, send_to_users

TOKEN = 'ExponentPushToken[abc123DEF]'
URL = '/api/push/devices/'


def expo_response(tickets):
    """Faux retour de urlopen : JSON {"data": [...tickets]}."""
    response = mock.MagicMock()
    response.read.return_value = json.dumps({'data': tickets}).encode()
    response.__enter__.return_value = response
    return response


class TokenValidationTests(TestCase):
    def test_expo_token_formats(self):
        self.assertTrue(is_valid_token('ExponentPushToken[abc-123_X]'))
        self.assertTrue(is_valid_token('ExpoPushToken[abc]'))
        for bad in ('', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'fcm:xyz'):
            self.assertFalse(is_valid_token(bad), bad)


class DeviceRegistrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.donor = make_user('awa', Role.DONOR)
        cls.other = make_user('moussa', Role.DONOR)

    def test_requires_authentication(self):
        self.assertEqual(api_client().post(URL, {'token': TOKEN, 'platform': 'android'}).status_code, 401)

    def test_register_then_refresh(self):
        response = api_client(self.donor).post(URL, {'token': TOKEN, 'platform': 'android'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        again = api_client(self.donor).post(URL, {'token': TOKEN, 'platform': 'android'}, format='json')
        self.assertEqual(again.status_code, 200)
        self.assertEqual(PushDevice.objects.filter(token=TOKEN).count(), 1)

    def test_invalid_token_or_platform(self):
        client = api_client(self.donor)
        self.assertEqual(client.post(URL, {'token': 'nimporte', 'platform': 'android'}, format='json').status_code, 400)
        self.assertEqual(client.post(URL, {'token': TOKEN, 'platform': 'symbian'}, format='json').status_code, 400)

    def test_same_phone_changes_owner(self):
        api_client(self.donor).post(URL, {'token': TOKEN, 'platform': 'ios'}, format='json')
        api_client(self.other).post(URL, {'token': TOKEN, 'platform': 'ios'}, format='json')
        device = PushDevice.objects.get(token=TOKEN)
        self.assertEqual(device.user, self.other)

    def test_unregister_only_own_device(self):
        PushDevice.objects.create(user=self.donor, token=TOKEN, platform='android')
        # Un autre compte ne peut pas couper les notifications d'autrui.
        api_client(self.other).post(f'{URL}unregister/', {'token': TOKEN}, format='json')
        self.assertTrue(PushDevice.objects.get(token=TOKEN).is_active)

        response = api_client(self.donor).post(f'{URL}unregister/', {'token': TOKEN}, format='json')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(PushDevice.objects.get(token=TOKEN).is_active)

    def test_reregister_reactivates(self):
        PushDevice.objects.create(user=self.donor, token=TOKEN, platform='android', is_active=False, last_error='DeviceNotRegistered')
        api_client(self.donor).post(URL, {'token': TOKEN, 'platform': 'android'}, format='json')
        device = PushDevice.objects.get(token=TOKEN)
        self.assertTrue(device.is_active)
        self.assertEqual(device.last_error, '')


@override_settings(PUSH_ASYNC=False, PUSH_ENABLED=True, PUSH_EXPO_ACCESS_TOKEN='')
class SendTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = make_user('awa', Role.DONOR)

    def test_nothing_sent_without_device(self):
        with mock.patch('push.services.urllib.request.urlopen') as urlopen:
            self.assertEqual(send_to_users([self.user.pk], title='t', body='b'), 0)
        urlopen.assert_not_called()

    def test_inactive_devices_are_skipped(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android', is_active=False)
        with mock.patch('push.services.urllib.request.urlopen') as urlopen:
            self.assertEqual(send_to_users([self.user.pk], title='t', body='b'), 0)
        urlopen.assert_not_called()

    def test_message_format(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android')
        with mock.patch('push.services.urllib.request.urlopen', return_value=expo_response([{'status': 'ok'}])) as urlopen:
            send_to_users([self.user.pk], title='Urgence', body='Corps', data={'request_id': 7})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, 'https://exp.host/--/api/v2/push/send')
        (message,) = json.loads(request.data)
        self.assertEqual(message['to'], TOKEN)
        self.assertEqual(message['title'], 'Urgence')
        self.assertEqual(message['data'], {'request_id': 7})
        self.assertEqual(message['priority'], 'high')
        self.assertEqual(message['channelId'], 'blood-alerts')
        self.assertNotIn('Authorization', request.headers)

    @override_settings(PUSH_EXPO_ACCESS_TOKEN='secret')
    def test_access_token_is_sent(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android')
        with mock.patch('push.services.urllib.request.urlopen', return_value=expo_response([{'status': 'ok'}])) as urlopen:
            send_to_users([self.user.pk], title='t', body='b')
        self.assertEqual(urlopen.call_args.args[0].headers['Authorization'], 'Bearer secret')

    def test_batches_of_100(self):
        users = [make_user(f'donneur{i}', Role.DONOR) for i in range(BATCH_SIZE + 1)]
        for i, user in enumerate(users):
            PushDevice.objects.create(user=user, token=f'ExponentPushToken[t{i}]', platform='android')
        with mock.patch(
            'push.services.urllib.request.urlopen',
            side_effect=lambda req, timeout: expo_response([{'status': 'ok'}] * len(json.loads(req.data))),
        ) as urlopen:
            sent = send_to_users([u.pk for u in users], title='t', body='b')
        self.assertEqual(sent, BATCH_SIZE + 1)
        self.assertEqual([len(json.loads(c.args[0].data)) for c in urlopen.call_args_list], [BATCH_SIZE, 1])

    def test_uninstalled_app_token_is_deactivated(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android')
        tickets = [{'status': 'error', 'message': 'not registered', 'details': {'error': 'DeviceNotRegistered'}}]
        with mock.patch('push.services.urllib.request.urlopen', return_value=expo_response(tickets)):
            send_to_users([self.user.pk], title='t', body='b')
        device = PushDevice.objects.get(token=TOKEN)
        self.assertFalse(device.is_active)
        self.assertEqual(device.last_error, 'DeviceNotRegistered')

    def test_service_outage_does_not_raise(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android')
        import urllib.error

        with mock.patch('push.services.urllib.request.urlopen', side_effect=urllib.error.URLError('hors ligne')):
            self.assertEqual(send_to_users([self.user.pk], title='t', body='b'), 1)
        self.assertTrue(PushDevice.objects.get(token=TOKEN).is_active)

    @override_settings(PUSH_ENABLED=False)
    def test_disabled(self):
        PushDevice.objects.create(user=self.user, token=TOKEN, platform='android')
        with mock.patch('push.services.urllib.request.urlopen') as urlopen:
            self.assertEqual(send_to_users([self.user.pk], title='t', body='b'), 0)
        urlopen.assert_not_called()


@override_settings(PUSH_ASYNC=False, PUSH_ENABLED=True)
class BloodRequestPushTests(SangFixturesMixin, TestCase):
    """Une nouvelle demande sollicite les donneurs compatibles, éligibles et à portée."""

    def create_request(self, **payload):
        payload = {'blood_group': 'A+', 'units_needed': 2, 'urgency': 'critical', 'search_radius_km': 10, **payload}
        with (
            mock.patch('sang.notifications.broadcast_alert'),
            mock.patch('sang.notifications.broadcast_dashboard'),
            mock.patch('push.services.send_to_users', wraps=send_to_users) as spy,
            mock.patch('push.services.urllib.request.urlopen', side_effect=lambda req, timeout: expo_response(
                [{'status': 'ok'}] * len(json.loads(req.data))
            )) as urlopen,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = api_client(self.staff).post('/api/sang/requests/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return spy, urlopen

    def test_only_reachable_compatible_eligible_donors_are_notified(self):
        near_compatible = make_donor('proche_o', 'O-', north_km=2)
        near_incompatible = make_donor('proche_b', 'B+', north_km=2)
        far_compatible = make_donor('loin_a', 'A+', north_km=50)
        unavailable = make_donor('indispo', 'A+', north_km=1, is_available=False)
        for i, donor in enumerate([near_compatible, near_incompatible, far_compatible, unavailable]):
            PushDevice.objects.create(user=donor.user, token=f'ExponentPushToken[d{i}]', platform='android')

        _, urlopen = self.create_request()

        messages = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual([m['to'] for m in messages], ['ExponentPushToken[d0]'])
        message = messages[0]
        self.assertEqual(message['title'], 'Urgence vitale — groupe A+')
        self.assertIn(self.hospital.name, message['body'])
        self.assertEqual(message['data']['type'], 'blood_request')
        # Les précisions cliniques ne quittent jamais le backend.
        self.assertNotIn('notes', json.dumps(message))

    def test_no_network_call_when_no_phone_is_registered(self):
        make_donor('proche', 'O-', north_km=1)
        spy, urlopen = self.create_request(notes='Hémorragie')
        spy.assert_not_called()
        urlopen.assert_not_called()
