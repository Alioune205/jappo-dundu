"""
Tests de l'application temps réel (WebSockets).

Les connexions passent par l'application ASGI complète (core.asgi) :
routage, middleware JWT, consumers et channel layer en mémoire.
TransactionTestCase est requis : l'authentification interroge la base
depuis un autre thread (database_sync_to_async).

Auteur : El Hadji Massogui Diop
"""

from datetime import date
from io import StringIO
from unittest import mock

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from core.asgi import application

from .auth import extract_ticket, extract_token
from .broadcast import broadcast_alert, broadcast_dashboard
from .consumers import (
    CLOSE_BAD_REQUEST,
    CLOSE_FORBIDDEN,
    CLOSE_UNAUTHENTICATED,
    MAX_GROUPS_PER_CONNECTION,
    SubscriptionError,
)
from .tickets import consume_ticket, issue_ticket

User = get_user_model()

IN_MEMORY_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


class ExtractTokenTests(SimpleTestCase):

    def test_authorization_header(self):
        scope = {'headers': [(b'authorization', b'Bearer header-token')]}
        self.assertEqual(extract_token(scope), 'header-token')

    def test_jwt_in_query_string_is_ignored(self):
        # Un JWT dans l'URL finirait dans les journaux : il n'est jamais lu.
        self.assertIsNone(extract_token({'query_string': b'region=dakar&token=abc'}))

    def test_query_string_ticket(self):
        self.assertEqual(extract_ticket({'query_string': b'region=dakar&ticket=t1'}), 't1')
        self.assertIsNone(extract_ticket({'query_string': b'token=abc'}))

    def test_missing_or_malformed_token(self):
        self.assertIsNone(extract_token({'query_string': b''}))
        self.assertIsNone(extract_token({'headers': [(b'authorization', b'Basic xyz')]}))


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYERS)
class RealtimeTestCase(TransactionTestCase):
    """Socle : utilisateurs par rôle et helpers de connexion."""

    def setUp(self):
        call_command('setup_roles', stdout=StringIO())
        self.admin = User.objects.create_user('admin', is_staff=True)
        self.hospital = self._user('hospital', 'hospital_staff')
        self.donor = self._user('donor', 'donor')

    @staticmethod
    def _user(username, group):
        user = User.objects.create_user(username)
        user.groups.add(Group.objects.get(name=group))
        return user

    @staticmethod
    def token(user):
        return str(AccessToken.for_user(user))

    @staticmethod
    def ticket(user):
        return issue_ticket(user)[0]

    async def open(self, path, user=None, query='', headers=None):
        params = [query] if query else []
        if user is not None:
            params.append(f'ticket={self.ticket(user)}')
        url = path + ('?' + '&'.join(params) if params else '')
        communicator = WebsocketCommunicator(application, url, headers=headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def open_ok(self, path, user, query=''):
        communicator = await self.open(path, user, query)
        welcome = await communicator.receive_json_from()
        self.assertEqual(welcome['type'], 'connection_established')
        return communicator, welcome

    async def assert_closed(self, communicator, code):
        message = await communicator.receive_output(timeout=2)
        self.assertEqual(message['type'], 'websocket.close')
        self.assertEqual(message['code'], code)


class AuthenticationTests(RealtimeTestCase):

    async def test_anonymous_connection_is_rejected(self):
        communicator = await self.open('/ws/alerts/')
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_invalid_token_is_rejected(self):
        headers = [(b'authorization', b'Bearer not.a.jwt')]
        communicator = await self.open('/ws/alerts/', headers=headers)
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_jwt_in_query_string_is_rejected(self):
        communicator = await self.open('/ws/alerts/', query=f'token={self.token(self.donor)}')
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_unknown_ticket_is_rejected(self):
        communicator = await self.open('/ws/alerts/', query='ticket=inconnu')
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_ticket_is_single_use(self):
        ticket = self.ticket(self.donor)
        first = await self.open('/ws/alerts/', query=f'ticket={ticket}')
        welcome = await first.receive_json_from()
        self.assertEqual(welcome['user']['username'], 'donor')
        await first.disconnect()

        replay = await self.open('/ws/alerts/', query=f'ticket={ticket}')
        await self.assert_closed(replay, CLOSE_UNAUTHENTICATED)

    async def test_expired_ticket_is_rejected(self):
        ticket = self.ticket(self.donor)
        cache.clear()  # équivalent d'une expiration
        communicator = await self.open('/ws/alerts/', query=f'ticket={ticket}')
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_inactive_user_is_rejected(self):
        ticket = self.ticket(self.donor)
        self.donor.is_active = False
        await sync_to_async(self.donor.save)()
        communicator = await self.open('/ws/alerts/', query=f'ticket={ticket}')
        await self.assert_closed(communicator, CLOSE_UNAUTHENTICATED)

    async def test_authorization_header_is_accepted(self):
        headers = [(b'authorization', f'Bearer {self.token(self.donor)}'.encode())]
        communicator = await self.open('/ws/alerts/', headers=headers)
        welcome = await communicator.receive_json_from()
        self.assertEqual(welcome['user']['username'], 'donor')
        self.assertEqual(welcome['user']['roles'], ['donor'])
        await communicator.disconnect()


class AuthorizationTests(RealtimeTestCase):

    async def test_dashboard_is_forbidden_to_donors(self):
        communicator = await self.open('/ws/dashboard/', self.donor)
        await self.assert_closed(communicator, CLOSE_FORBIDDEN)

    async def test_dashboard_for_hospital_staff(self):
        communicator, welcome = await self.open_ok('/ws/dashboard/', self.hospital)
        self.assertEqual(welcome['groups'], ['dashboard_global'])
        await communicator.disconnect()

    async def test_region_filter_gives_regional_feed_only(self):
        communicator, welcome = await self.open_ok('/ws/alerts/', self.donor, 'region=thies')
        self.assertEqual(welcome['groups'], ['alerts_region_thies'])
        await communicator.disconnect()

    async def test_unknown_region_is_rejected(self):
        communicator = await self.open('/ws/alerts/', self.donor, 'region=atlantis')
        await self.assert_closed(communicator, CLOSE_BAD_REQUEST)

    async def test_non_numeric_hospital_id_is_rejected(self):
        communicator = await self.open('/ws/alerts/', self.hospital, 'hospital_id=abc')
        await self.assert_closed(communicator, CLOSE_BAD_REQUEST)

    async def test_hospital_scope_is_forbidden_to_donors(self):
        communicator = await self.open('/ws/alerts/', self.donor, 'hospital_id=5')
        await self.assert_closed(communicator, CLOSE_FORBIDDEN)

    async def test_hospital_scope_for_staff(self):
        communicator, welcome = await self.open_ok('/ws/alerts/', self.hospital, 'hospital_id=5')
        self.assertEqual(welcome['groups'], ['alerts_hospital_5'])
        await communicator.disconnect()


class ProtocolTests(RealtimeTestCase):

    async def test_ping_pong(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.donor)
        await communicator.send_json_to({'type': 'ping'})
        self.assertEqual(await communicator.receive_json_from(), {'type': 'pong'})
        await communicator.disconnect()

    async def test_subscribe_and_unsubscribe(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.donor)
        await communicator.send_json_to({'type': 'subscribe', 'group': 'alerts_region_dakar'})
        self.assertEqual(
            await communicator.receive_json_from(),
            {'type': 'subscribed', 'group': 'alerts_region_dakar'},
        )
        await communicator.send_json_to({'type': 'unsubscribe', 'group': 'alerts_region_dakar'})
        self.assertEqual(
            (await communicator.receive_json_from())['type'], 'unsubscribed'
        )
        await communicator.disconnect()

    async def test_arbitrary_group_subscription_is_refused(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.donor)
        for group in ('dashboard_global', 'alerts_region_atlantis', 'alerts_hospital_1',
                      'anything', 42):
            await communicator.send_json_to({'type': 'subscribe', 'group': group})
            reply = await communicator.receive_json_from()
            self.assertEqual(reply['type'], 'error', group)
        await communicator.disconnect()

    async def test_unsubscribe_from_unknown_group(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.donor)
        await communicator.send_json_to({'type': 'unsubscribe', 'group': 'alerts_region_kolda'})
        self.assertEqual((await communicator.receive_json_from())['code'], 'not_subscribed')
        await communicator.disconnect()

    async def test_invalid_messages_do_not_close_the_connection(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.donor)
        cases = [
            ('{not json', 'invalid_json'),
            ('[1, 2]', 'invalid_message'),
            ('{"type": "hack"}', 'unknown_type'),
            ('x' * 5000, 'message_too_large'),
        ]
        for payload, code in cases:
            await communicator.send_to(text_data=payload)
            self.assertEqual((await communicator.receive_json_from())['code'], code)
        await communicator.send_to(bytes_data=b'\x00\x01')
        self.assertEqual((await communicator.receive_json_from())['code'], 'invalid_message')

        await communicator.send_json_to({'type': 'ping'})
        self.assertEqual((await communicator.receive_json_from())['type'], 'pong')
        await communicator.disconnect()

    async def test_subscription_limit(self):
        communicator, _ = await self.open_ok('/ws/alerts/', self.hospital)
        for hospital_id in range(1, MAX_GROUPS_PER_CONNECTION):
            await communicator.send_json_to(
                {'type': 'subscribe', 'group': f'alerts_hospital_{hospital_id}'}
            )
            self.assertEqual((await communicator.receive_json_from())['type'], 'subscribed')
        await communicator.send_json_to({'type': 'subscribe', 'group': 'alerts_hospital_999'})
        self.assertEqual((await communicator.receive_json_from())['code'], 'too_many_groups')
        await communicator.disconnect()


class BroadcastTests(RealtimeTestCase):

    async def test_regional_alert_routing(self):
        national, _ = await self.open_ok('/ws/alerts/', self.admin)
        thies, _ = await self.open_ok('/ws/alerts/', self.donor, 'region=thies')
        kolda, _ = await self.open_ok('/ws/alerts/', self.hospital, 'region=kolda')

        sent = await sync_to_async(broadcast_alert)(
            'blood', {'blood_group': 'O-', 'needed_on': date(2026, 10, 1)}, region='thies'
        )
        self.assertTrue(sent)

        for communicator in (national, thies):
            message = await communicator.receive_json_from()
            self.assertEqual(message['type'], 'blood_alert')
            self.assertEqual(message['data'], {'blood_group': 'O-', 'needed_on': '2026-10-01'})
            self.assertRegex(message['id'], r'^[0-9a-f]{32}$')
            self.assertIn('sent_at', message)
        self.assertTrue(await kolda.receive_nothing(timeout=0.2))

        for communicator in (national, thies, kolda):
            await communicator.disconnect()

    async def test_dashboard_broadcast(self):
        dashboard, _ = await self.open_ok('/ws/dashboard/', self.hospital)
        await sync_to_async(broadcast_dashboard)('prediction', {'critical': 3})
        message = await dashboard.receive_json_from()
        self.assertEqual(message['type'], 'prediction_update')
        self.assertEqual(message['data'], {'critical': 3})
        await dashboard.disconnect()

    def test_invalid_broadcast_arguments(self):
        with self.assertRaises(ValueError):
            broadcast_alert('tsunami', {})
        with self.assertRaises(TypeError):
            broadcast_alert('blood', ['not', 'a', 'dict'])
        with self.assertRaises(SubscriptionError):
            broadcast_alert('blood', {}, region='atlantis')

    def test_channel_layer_failure_does_not_raise(self):
        with mock.patch('realtime.broadcast.get_channel_layer') as get_layer, \
                self.assertLogs('jappo_dundu.realtime', 'ERROR'):
            get_layer.return_value.group_send = mock.AsyncMock(
                side_effect=ConnectionError('redis down')
            )
            self.assertFalse(broadcast_alert('general', {'message': 'test'}))


class TicketTests(TestCase):
    """Émission et consommation des tickets de connexion WebSocket."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user('regulateur')
        self.client = APIClient()

    def test_ticket_requires_authentication(self):
        response = self.client.post('/api/realtime/ticket/')
        self.assertEqual(response.status_code, 401)

    def test_ticket_is_issued_to_authenticated_user(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/realtime/ticket/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['expires_in'], 30)
        self.assertGreaterEqual(len(response.data['ticket']), 40)
        self.assertEqual(consume_ticket(response.data['ticket']), self.user.pk)

    def test_ticket_is_consumed_once(self):
        ticket, _ = issue_ticket(self.user)
        self.assertEqual(consume_ticket(ticket), self.user.pk)
        self.assertIsNone(consume_ticket(ticket))

    def test_tickets_are_distinct_and_stored_hashed(self):
        first, _ = issue_ticket(self.user)
        second, _ = issue_ticket(self.user)
        self.assertNotEqual(first, second)
        self.assertIsNone(cache.get('realtime-ticket:' + first))

    @override_settings(REALTIME_TICKET_TTL=5)
    def test_ttl_is_configurable(self):
        _, ttl = issue_ticket(self.user)
        self.assertEqual(ttl, 5)

    def test_garbage_is_rejected(self):
        self.assertIsNone(consume_ticket(''))
        self.assertIsNone(consume_ticket('x' * 500))
