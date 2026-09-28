"""
Consumers WebSocket de Jappo Dundu.

- AlertConsumer     : ws/alerts/     alertes d'urgence (sang, lits, ambulances)
- DashboardConsumer : ws/dashboard/  mises à jour temps réel des tableaux de bord

Protocole (JSON, messages texte) — voir realtime/README.md :
- à la connexion, le serveur envoie ``connection_established`` ;
- le client peut envoyer ``ping``, ``subscribe`` et ``unsubscribe`` ;
- toute erreur de protocole est signalée par un message ``error`` sans
  fermer la connexion.

Codes de fermeture applicatifs :
- 4400 : paramètre de connexion invalide (région inconnue, id non entier) ;
- 4401 : non authentifié (token absent, invalide ou expiré) ;
- 4403 : rôle insuffisant pour ce flux ou ce périmètre.

Auteur : El Hadji Massogui Diop
"""

import json
import logging
import re
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from ml.constants import REGION_CODES
from security.roles import Role, get_user_roles

logger = logging.getLogger('jappo_dundu.realtime')

CLOSE_BAD_REQUEST = 4400
CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403

MAX_MESSAGE_CHARS = 4096
MAX_GROUPS_PER_CONNECTION = 20
MAX_HOSPITAL_ID = 2**31 - 1

# Rôles autorisés à suivre le périmètre d'un hôpital précis.
HOSPITAL_SCOPE_ROLES = frozenset(
    {Role.ADMIN, Role.HOSPITAL_STAFF, Role.AMBULANCE_DRIVER}
)


class SubscriptionError(Exception):
    """Demande d'abonnement refusée."""

    def __init__(self, code, message, close_code=CLOSE_BAD_REQUEST):
        super().__init__(message)
        self.code = code
        self.message = message
        self.close_code = close_code


def global_group(prefix):
    return f'{prefix}_global'


def region_group(prefix, region):
    """Nom du groupe d'une région (valide le code région)."""
    if region not in REGION_CODES:
        raise SubscriptionError('invalid_region', f"Région inconnue : {region!r}.")
    return f'{prefix}_region_{region}'


def hospital_group(prefix, hospital_id):
    """Nom du groupe d'un hôpital (valide l'identifiant)."""
    try:
        value = int(hospital_id)
    except (TypeError, ValueError):
        value = 0
    if not 0 < value <= MAX_HOSPITAL_ID:
        raise SubscriptionError(
            'invalid_hospital_id',
            "hospital_id doit être un entier strictement positif.",
        )
    return f'{prefix}_hospital_{value}'


class BaseRealtimeConsumer(AsyncJsonWebsocketConsumer):
    """Socle commun : authentification, autorisation et abonnements."""

    group_prefix = ''
    # None : tout utilisateur authentifié ; sinon ensemble de rôles requis.
    allowed_roles = None
    # Périmètres filtrables : 'region' et/ou 'hospital'.
    scopes = ()
    welcome_message = ''
    event_types = {}

    async def connect(self):
        self.joined_groups = set()
        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            await self._reject(CLOSE_UNAUTHENTICATED)
            return

        self.roles = await database_sync_to_async(get_user_roles)(user)
        if self.allowed_roles is not None and self.roles.isdisjoint(
            self.allowed_roles
        ):
            await self._reject(CLOSE_FORBIDDEN)
            return

        try:
            groups = self._initial_groups()
        except SubscriptionError as exc:
            await self._reject(exc.close_code)
            return

        for group in groups:
            await self._join(group)
        await self.accept()
        await self.send_json({
            'type': 'connection_established',
            'message': self.welcome_message,
            'groups': sorted(self.joined_groups),
            'user': {
                'id': user.pk,
                'username': user.get_username(),
                'roles': sorted(self.roles),
            },
        })
        logger.info(
            "WS %s connecté — user=%s groupes=%s",
            self.group_prefix, user.pk, sorted(self.joined_groups),
        )

    async def disconnect(self, close_code):
        for group in getattr(self, 'joined_groups', ()):
            await self.channel_layer.group_discard(group, self.channel_name)
        logger.info("WS %s déconnecté — code=%s", self.group_prefix, close_code)

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        """Décode le JSON de façon défensive avant ``receive_json``."""
        if text_data is None:
            await self._send_error(
                'invalid_message', "Seuls les messages texte JSON sont acceptés."
            )
            return
        if len(text_data) > MAX_MESSAGE_CHARS:
            await self._send_error('message_too_large', "Message trop volumineux.")
            return
        try:
            content = json.loads(text_data)
        except json.JSONDecodeError:
            await self._send_error('invalid_json', "JSON invalide.")
            return
        if not isinstance(content, dict):
            await self._send_error(
                'invalid_message', "Le message doit être un objet JSON."
            )
            return
        await self.receive_json(content, **kwargs)

    async def receive_json(self, content, **kwargs):
        msg_type = content.get('type')
        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
        elif msg_type == 'subscribe':
            await self._subscribe(content.get('group'))
        elif msg_type == 'unsubscribe':
            await self._unsubscribe(content.get('group'))
        else:
            await self._send_error(
                'unknown_type', f"Type de message non supporté : {msg_type!r}."
            )

    # --- Diffusion (appelés par le channel layer) ---------------------

    async def forward_event(self, event):
        await self.send_json({
            'type': self.event_types[event['type']],
            'id': event.get('id'),
            'sent_at': event.get('sent_at'),
            'data': event.get('data', {}),
        })

    # --- Abonnements ---------------------------------------------------

    def _initial_groups(self):
        params = parse_qs(self.scope.get('query_string', b'').decode('latin-1'))
        groups = []
        if 'region' in self.scopes and params.get('region'):
            groups.append(region_group(self.group_prefix, params['region'][0]))
        if 'hospital' in self.scopes and params.get('hospital_id'):
            groups.append(self._hospital_group(params['hospital_id'][0]))
        return groups or [global_group(self.group_prefix)]

    def _hospital_group(self, hospital_id):
        if self.roles.isdisjoint(HOSPITAL_SCOPE_ROLES):
            raise SubscriptionError(
                'forbidden',
                "Votre rôle ne permet pas de suivre un hôpital.",
                close_code=CLOSE_FORBIDDEN,
            )
        return hospital_group(self.group_prefix, hospital_id)

    def _validate_group_name(self, name):
        prefix = re.escape(self.group_prefix)
        if name == global_group(self.group_prefix):
            return name
        match = re.fullmatch(rf'{prefix}_region_(\w+)', name)
        if match and 'region' in self.scopes:
            return region_group(self.group_prefix, match.group(1))
        match = re.fullmatch(rf'{prefix}_hospital_(\d+)', name)
        if match and 'hospital' in self.scopes:
            return self._hospital_group(match.group(1))
        raise SubscriptionError('invalid_group', f"Groupe inconnu : {name!r}.")

    async def _subscribe(self, name):
        if not isinstance(name, str):
            await self._send_error('invalid_group', "Le champ 'group' est requis.")
            return
        try:
            group = self._validate_group_name(name)
        except SubscriptionError as exc:
            await self._send_error(exc.code, exc.message)
            return
        if group not in self.joined_groups:
            if len(self.joined_groups) >= MAX_GROUPS_PER_CONNECTION:
                await self._send_error(
                    'too_many_groups', "Nombre maximal d'abonnements atteint."
                )
                return
            await self._join(group)
        await self.send_json({'type': 'subscribed', 'group': group})

    async def _unsubscribe(self, name):
        if name not in self.joined_groups:
            await self._send_error(
                'not_subscribed', f"Non abonné au groupe : {name!r}."
            )
            return
        await self.channel_layer.group_discard(name, self.channel_name)
        self.joined_groups.discard(name)
        await self.send_json({'type': 'unsubscribed', 'group': name})

    async def _join(self, group):
        await self.channel_layer.group_add(group, self.channel_name)
        self.joined_groups.add(group)

    async def _reject(self, code):
        # Accepter puis fermer permet au client de lire le code (4401...)
        # et, par exemple, de rafraîchir son token avant de se reconnecter.
        await self.accept()
        await self.close(code=code)

    async def _send_error(self, code, message):
        await self.send_json({'type': 'error', 'code': code, 'message': message})


class AlertConsumer(BaseRealtimeConsumer):
    """Flux d'alertes d'urgence, ouvert à tout utilisateur authentifié.

    ws://host/ws/alerts/                 → flux national (alerts_global)
    ws://host/ws/alerts/?region=thies    → flux régional uniquement
    ws://host/ws/alerts/?hospital_id=5   → flux d'un hôpital (personnel)
    """

    group_prefix = 'alerts'
    scopes = ('region', 'hospital')
    welcome_message = "Connecté au flux d'alertes Jappo Dundu"
    event_types = {
        'alert_message': 'alert',
        'blood_alert': 'blood_alert',
        'bed_alert': 'bed_alert',
        'ambulance_alert': 'ambulance_alert',
    }

    alert_message = BaseRealtimeConsumer.forward_event
    blood_alert = BaseRealtimeConsumer.forward_event
    bed_alert = BaseRealtimeConsumer.forward_event
    ambulance_alert = BaseRealtimeConsumer.forward_event


class DashboardConsumer(BaseRealtimeConsumer):
    """Flux du tableau de bord, réservé aux admins et au personnel hospitalier.

    ws://host/ws/dashboard/                → flux national (dashboard_global)
    ws://host/ws/dashboard/?hospital_id=1  → flux d'un hôpital
    """

    group_prefix = 'dashboard'
    allowed_roles = frozenset({Role.ADMIN, Role.HOSPITAL_STAFF})
    scopes = ('hospital',)
    welcome_message = "Connecté au tableau de bord Jappo Dundu"
    event_types = {
        'dashboard_update': 'dashboard_update',
        'kpi_update': 'kpi_update',
        'prediction_update': 'prediction_update',
    }

    dashboard_update = BaseRealtimeConsumer.forward_event
    kpi_update = BaseRealtimeConsumer.forward_event
    prediction_update = BaseRealtimeConsumer.forward_event
