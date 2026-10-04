"""
Envoi des notifications push par le service d'Expo.

Pourquoi Expo plutôt que Firebase en direct : l'application mobile est une
application Expo ; son service push relaie vers FCM (Android) et APNs (iOS)
avec un seul format de jeton. Le backend n'a ni clé Firebase ni certificat
Apple à gérer (ils sont configurés une fois dans le projet Expo, voir
mobile/README.md).

Fonctionnement :
- les destinataires sont calculés dans le fil de la requête, après
  validation de la transaction (requête PostGIS limitée, quelques ms) ;
- l'appel HTTP vers Expo part dans un thread dédié : une lenteur du service
  push ne retarde jamais l'API ;
- messages envoyés par lots de 100 (limite Expo) ;
- un jeton signalé ``DeviceNotRegistered`` (application désinstallée) est
  désactivé ;
- sans téléphone enregistré, rien n'est lancé (aucun appel réseau).

Réglages : PUSH_ENABLED, PUSH_ASYNC (False : envoi dans la requête, tests),
PUSH_EXPO_URL, PUSH_EXPO_ACCESS_TOKEN (facultatif, « enhanced security »
du projet Expo), PUSH_MAX_DONORS.

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import json
import logging
import re
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import close_old_connections, connections

from .models import PushDevice

logger = logging.getLogger('jappo_dundu.push')

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
BATCH_SIZE = 100
TIMEOUT_SECONDS = 10
TOKEN_RE = re.compile(r'^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$')

# Canal Android créé par l'application (son et importance « haute »).
ANDROID_CHANNEL = 'blood-alerts'

_executor = None
_executor_lock = threading.Lock()


def is_valid_token(token):
    return bool(token) and len(token) <= 255 and bool(TOKEN_RE.match(token))


def _setting(name, default):
    return getattr(settings, name, default)


def _get_executor():
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='push')
        return _executor


def send_to_users(user_ids, *, title, body, data=None):
    """Notifie les téléphones actifs de ``user_ids``. Retourne le nombre de messages préparés."""
    if not _setting('PUSH_ENABLED', True) or not user_ids:
        return 0
    tokens = list(
        PushDevice.objects.filter(user_id__in=set(user_ids), is_active=True).values_list('token', flat=True)
    )
    if not tokens:
        return 0

    messages = [
        {
            'to': token,
            'title': title,
            'body': body,
            'data': data or {},
            'sound': 'default',
            'priority': 'high',
            'channelId': ANDROID_CHANNEL,
        }
        for token in tokens
    ]
    if _setting('PUSH_ASYNC', True):
        _get_executor().submit(_deliver_in_thread, messages)
    else:
        _deliver(messages)
    return len(messages)


def _deliver_in_thread(messages):
    # Thread hors cycle de requête : connexions base ouvertes et fermées ici.
    close_old_connections()
    try:
        _deliver(messages)
    except Exception:  # noqa: BLE001 — un échec d'envoi ne doit rien casser
        logger.exception("Échec d'envoi de %d notification(s) push", len(messages))
    finally:
        connections.close_all()


def _deliver(messages):
    for start in range(0, len(messages), BATCH_SIZE):
        batch = messages[start:start + BATCH_SIZE]
        tickets = _post(batch)
        _handle_tickets(batch, tickets)


def _post(batch):
    """POST vers Expo ; retourne la liste des tickets (un par message), ou [] en cas d'échec."""
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    access_token = _setting('PUSH_EXPO_ACCESS_TOKEN', '')
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    request = urllib.request.Request(
        _setting('PUSH_EXPO_URL', EXPO_PUSH_URL),
        data=json.dumps(batch).encode(),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("Service push Expo injoignable (%d messages) : %s", len(batch), exc)
        return []
    tickets = payload.get('data') or []
    return tickets if isinstance(tickets, list) else []


def _handle_tickets(batch, tickets):
    """Désactive les jetons refusés définitivement ; journalise le reste."""
    dead, failures = [], 0
    for message, ticket in zip(batch, tickets):
        if not isinstance(ticket, dict) or ticket.get('status') == 'ok':
            continue
        failures += 1
        error = (ticket.get('details') or {}).get('error', '')
        if error == 'DeviceNotRegistered':
            dead.append(message['to'])
    if dead:
        PushDevice.objects.filter(token__in=dead).update(is_active=False, last_error='DeviceNotRegistered')
    if failures:
        logger.info("Push : %d échec(s) sur %d, %d jeton(s) désactivé(s)", failures, len(batch), len(dead))


# =============================================================
# ÉVÉNEMENTS MÉTIER
# =============================================================

URGENCY_TITLES = {
    'critical': 'Urgence vitale',
    'urgent': 'Demande urgente',
    'normal': 'Demande de sang',
}


def notify_blood_request(blood_request):
    """Prévient les donneurs compatibles, éligibles et à portée d'une nouvelle demande.

    Même sélection que l'appariement (sang.services.find_matching_donors) :
    seuls les donneurs qui peuvent réellement répondre sont sollicités. Le
    message ne contient aucune donnée personnelle ni précision clinique.
    """
    if not _setting('PUSH_ENABLED', True):
        return 0
    if not PushDevice.objects.filter(is_active=True).exists():
        return 0

    from sang.services import find_matching_donors

    donors = find_matching_donors(blood_request, limit=_setting('PUSH_MAX_DONORS', 50))
    facility = blood_request.facility
    title = f"{URGENCY_TITLES.get(blood_request.urgency, 'Demande de sang')} — groupe {blood_request.blood_group}"
    body = (
        f"{facility.name} ({facility.city}) recherche {blood_request.units_remaining} poche(s). "
        "Votre groupe est compatible : pouvez-vous donner ?"
    )
    return send_to_users(
        [donor.user_id for donor in donors],
        title=title,
        body=body,
        data={'type': 'blood_request', 'request_id': blood_request.pk},
    )
