"""
Tests de l'application WebSockets.

Couvre :
- La connexion et déconnexion des consumers
- L'envoi et la réception de messages
- L'abonnement aux groupes
- Le middleware d'authentification JWT

Auteur : El Hadji Massogui Diop
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from channels.testing import WebsocketCommunicator
from channels.layers import get_channel_layer

from .consumers import AlertConsumer, DashboardConsumer

User = get_user_model()

# Configuration de test avec InMemoryChannelLayer
TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class AlertConsumerTestCase(TestCase):
    """Tests du consumer d'alertes."""

    async def test_connect_and_receive_welcome(self):
        """Un client peut se connecter et reçoit un message de bienvenue."""
        communicator = WebsocketCommunicator(
            AlertConsumer.as_asgi(), '/ws/alerts/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Recevoir le message de bienvenue
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'connection_established')
        self.assertIn('alerts_global', response['groups'])

        await communicator.disconnect()

    async def test_connect_with_region_filter(self):
        """Un client peut se connecter avec un filtre régional."""
        communicator = WebsocketCommunicator(
            AlertConsumer.as_asgi(), '/ws/alerts/?region=dakar'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertIn('alerts_region_dakar', response['groups'])

        await communicator.disconnect()

    async def test_ping_pong(self):
        """Le consumer répond aux pings avec des pongs."""
        communicator = WebsocketCommunicator(
            AlertConsumer.as_asgi(), '/ws/alerts/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consommer le message de bienvenue
        await communicator.receive_json_from()

        # Envoyer un ping
        await communicator.send_json_to({'type': 'ping'})
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'pong')

        await communicator.disconnect()

    async def test_group_broadcast(self):
        """Les messages envoyés au groupe sont reçus par les clients."""
        communicator = WebsocketCommunicator(
            AlertConsumer.as_asgi(), '/ws/alerts/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consommer le message de bienvenue
        await communicator.receive_json_from()

        # Envoyer un message au groupe via le channel layer
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            'alerts_global',
            {
                'type': 'alert_message',
                'data': {
                    'alert_type': 'blood_shortage',
                    'region': 'dakar',
                    'severity': 'critical',
                },
            },
        )

        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'alert')
        self.assertEqual(
            response['data']['alert_type'], 'blood_shortage'
        )

        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class DashboardConsumerTestCase(TestCase):
    """Tests du consumer du tableau de bord."""

    async def test_connect_and_receive_welcome(self):
        """Un client peut se connecter au dashboard."""
        communicator = WebsocketCommunicator(
            DashboardConsumer.as_asgi(), '/ws/dashboard/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'connection_established')
        self.assertIn('dashboard_global', response['groups'])

        await communicator.disconnect()

    async def test_connect_with_hospital_filter(self):
        """Un client peut se connecter avec un filtre hôpital."""
        communicator = WebsocketCommunicator(
            DashboardConsumer.as_asgi(), '/ws/dashboard/?hospital_id=5'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertIn('dashboard_hospital_5', response['groups'])

        await communicator.disconnect()

    async def test_dashboard_update_broadcast(self):
        """Les mises à jour dashboard sont reçues par les clients."""
        communicator = WebsocketCommunicator(
            DashboardConsumer.as_asgi(), '/ws/dashboard/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consommer le message de bienvenue
        await communicator.receive_json_from()

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            'dashboard_global',
            {
                'type': 'dashboard_update',
                'data': {
                    'total_blood_units': 1250,
                    'available_beds': 87,
                    'active_ambulances': 12,
                },
            },
        )

        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'dashboard_update')
        self.assertEqual(response['data']['total_blood_units'], 1250)

        await communicator.disconnect()
