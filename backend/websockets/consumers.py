"""
Consumers WebSocket pour Jappo Dundu.

Fournit les canaux de communication temps réel :
- AlertConsumer : Diffusion des alertes urgences (sang, lits, ambulances)
- DashboardConsumer : Mises à jour en temps réel du tableau de bord

Auteur : El Hadji Massogui Diop
"""

import json
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger('jappo_dundu.websockets')


class AlertConsumer(AsyncJsonWebsocketConsumer):
    """Consumer WebSocket pour les alertes d'urgence en temps réel.

    Permet de diffuser les alertes à tous les clients connectés
    d'un hôpital ou d'une région spécifique.

    Connexion : ws://host/ws/alerts/
    Connexion avec filtre régional : ws://host/ws/alerts/?region=dakar

    Groupes :
    - 'alerts_global' : Toutes les alertes
    - 'alerts_region_{region}' : Alertes filtrées par région
    - 'alerts_hospital_{hospital_id}' : Alertes spécifiques à un hôpital
    """

    async def connect(self):
        """Gère la connexion WebSocket.

        Ajoute le client aux groupes appropriés en fonction
        des paramètres de la requête.
        """
        self.groups_joined = set()

        # Groupe global : toutes les alertes
        await self._join_group('alerts_global')

        # Groupe régional (optionnel)
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = dict(
            param.split('=')
            for param in query_string.split('&')
            if '=' in param
        )

        region = params.get('region')
        if region:
            await self._join_group(f'alerts_region_{region}')

        hospital_id = params.get('hospital_id')
        if hospital_id:
            await self._join_group(f'alerts_hospital_{hospital_id}')

        await self.accept()

        # Envoyer un message de bienvenue
        await self.send_json({
            'type': 'connection_established',
            'message': 'Connecté au flux d\'alertes Jappo Dundu',
            'groups': list(self.groups_joined),
        })

        logger.info(
            "WebSocket Alert connecté — groupes: %s",
            self.groups_joined,
        )

    async def disconnect(self, close_code):
        """Gère la déconnexion WebSocket.

        Retire le client de tous les groupes rejoints.
        """
        for group_name in self.groups_joined:
            await self.channel_layer.group_discard(
                group_name, self.channel_name
            )
        logger.info("WebSocket Alert déconnecté — code: %s", close_code)

    async def receive_json(self, content, **kwargs):
        """Traite les messages reçus des clients WebSocket.

        Messages supportés :
        - subscribe : S'abonner à un groupe supplémentaire
        - unsubscribe : Se désabonner d'un groupe
        - ping : Keepalive
        """
        msg_type = content.get('type')

        if msg_type == 'subscribe':
            group = content.get('group')
            if group:
                await self._join_group(group)
                await self.send_json({
                    'type': 'subscribed',
                    'group': group,
                })

        elif msg_type == 'unsubscribe':
            group = content.get('group')
            if group and group in self.groups_joined:
                await self.channel_layer.group_discard(
                    group, self.channel_name
                )
                self.groups_joined.discard(group)
                await self.send_json({
                    'type': 'unsubscribed',
                    'group': group,
                })

        elif msg_type == 'ping':
            await self.send_json({'type': 'pong'})

    async def alert_message(self, event):
        """Handler pour les messages d'alerte diffusés via le channel layer.

        Ce handler est appelé quand un message de type 'alert_message'
        est envoyé au groupe via `channel_layer.group_send()`.
        """
        await self.send_json({
            'type': 'alert',
            'data': event.get('data', {}),
        })

    async def blood_alert(self, event):
        """Handler pour les alertes de stock de sang critique."""
        await self.send_json({
            'type': 'blood_alert',
            'data': event.get('data', {}),
        })

    async def bed_alert(self, event):
        """Handler pour les alertes de disponibilité des lits."""
        await self.send_json({
            'type': 'bed_alert',
            'data': event.get('data', {}),
        })

    async def ambulance_alert(self, event):
        """Handler pour les alertes d'ambulance."""
        await self.send_json({
            'type': 'ambulance_alert',
            'data': event.get('data', {}),
        })

    async def _join_group(self, group_name):
        """Rejoint un groupe de channels et le mémorise."""
        await self.channel_layer.group_add(group_name, self.channel_name)
        self.groups_joined.add(group_name)


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    """Consumer WebSocket pour le tableau de bord en temps réel.

    Diffuse les mises à jour KPI aux tableaux de bord des hôpitaux :
    - Statistiques de stock de sang en temps réel
    - Disponibilité des lits
    - Statut des ambulances
    - Prédictions ML mises à jour

    Connexion : ws://host/ws/dashboard/
    Connexion filtrée : ws://host/ws/dashboard/?hospital_id=1
    """

    async def connect(self):
        """Gère la connexion au tableau de bord."""
        self.groups_joined = set()

        # Groupe global dashboard
        await self._join_group('dashboard_global')

        # Groupe par hôpital (optionnel)
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = dict(
            param.split('=')
            for param in query_string.split('&')
            if '=' in param
        )

        hospital_id = params.get('hospital_id')
        if hospital_id:
            await self._join_group(f'dashboard_hospital_{hospital_id}')

        await self.accept()

        await self.send_json({
            'type': 'connection_established',
            'message': 'Connecté au tableau de bord Jappo Dundu',
            'groups': list(self.groups_joined),
        })

        logger.info(
            "WebSocket Dashboard connecté — groupes: %s",
            self.groups_joined,
        )

    async def disconnect(self, close_code):
        """Gère la déconnexion du tableau de bord."""
        for group_name in self.groups_joined:
            await self.channel_layer.group_discard(
                group_name, self.channel_name
            )
        logger.info("WebSocket Dashboard déconnecté — code: %s", close_code)

    async def receive_json(self, content, **kwargs):
        """Traite les messages reçus."""
        msg_type = content.get('type')

        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})

        elif msg_type == 'request_update':
            # Le client demande une mise à jour immédiate des KPIs
            await self.send_json({
                'type': 'update_acknowledged',
                'message': 'Mise à jour demandée',
            })

    async def dashboard_update(self, event):
        """Handler pour les mises à jour du tableau de bord."""
        await self.send_json({
            'type': 'dashboard_update',
            'data': event.get('data', {}),
        })

    async def kpi_update(self, event):
        """Handler pour les mises à jour de KPIs spécifiques."""
        await self.send_json({
            'type': 'kpi_update',
            'data': event.get('data', {}),
        })

    async def prediction_update(self, event):
        """Handler pour les prédictions ML mises à jour."""
        await self.send_json({
            'type': 'prediction_update',
            'data': event.get('data', {}),
        })

    async def _join_group(self, group_name):
        """Rejoint un groupe de channels et le mémorise."""
        await self.channel_layer.group_add(group_name, self.channel_name)
        self.groups_joined.add(group_name)
