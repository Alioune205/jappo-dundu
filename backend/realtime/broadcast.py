"""
API de diffusion temps réel pour les autres modules du backend.

Exemple (module sang, après enregistrement d'une demande urgente) :

    from django.db import transaction
    from realtime.broadcast import broadcast_alert

    transaction.on_commit(lambda: broadcast_alert(
        'blood',
        {'blood_group': 'O-', 'units_needed': 4, 'hospital': 'CHU Fann'},
        region='dakar',
    ))

Routage :
- une alerte part toujours sur le flux national (``alerts_global``) et, si
  précisé, sur le flux de sa région et/ou de son hôpital ;
- une mise à jour de tableau de bord part sur ``dashboard_global`` et, si
  précisé, sur ``dashboard_hospital_<id>``.
Un client n'étant connecté qu'à un périmètre, il ne reçoit pas de doublon ;
chaque message porte un ``id`` unique pour dédoublonner au besoin.

Ces fonctions sont synchrones (vues DRF, services, commandes). Elles ne
lèvent pas d'exception : une panne du channel layer est journalisée et
signalée par un retour ``False``, sans casser la transaction métier.

Auteur : El Hadji Massogui Diop
"""

import json
import logging
import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from .consumers import global_group, hospital_group, region_group

logger = logging.getLogger('jappo_dundu.realtime')

ALERT_KINDS = {
    'general': 'alert_message',
    'blood': 'blood_alert',
    'bed': 'bed_alert',
    'ambulance': 'ambulance_alert',
}

DASHBOARD_KINDS = {
    'dashboard': 'dashboard_update',
    'kpi': 'kpi_update',
    'prediction': 'prediction_update',
}


def broadcast_alert(kind, data, *, region=None, hospital_id=None):
    """Diffuse une alerte (kind : general, blood, bed, ambulance)."""
    groups = [global_group('alerts')]
    if region is not None:
        groups.append(region_group('alerts', region))
    if hospital_id is not None:
        groups.append(hospital_group('alerts', hospital_id))
    return _broadcast(ALERT_KINDS, kind, data, groups)


def broadcast_dashboard(kind, data, *, hospital_id=None):
    """Diffuse une mise à jour de tableau de bord (dashboard, kpi, prediction)."""
    groups = [global_group('dashboard')]
    if hospital_id is not None:
        groups.append(hospital_group('dashboard', hospital_id))
    return _broadcast(DASHBOARD_KINDS, kind, data, groups)


def _broadcast(kinds, kind, data, groups):
    if kind not in kinds:
        raise ValueError(
            f"Type de diffusion inconnu : {kind!r} (attendu : {sorted(kinds)})."
        )
    if not isinstance(data, dict):
        raise TypeError("data doit être un dictionnaire JSON-sérialisable.")

    message = {
        'type': kinds[kind],
        'id': uuid.uuid4().hex,
        'sent_at': timezone.now().isoformat(),
        # Normalise dates, Decimal, UUID... en types JSON natifs.
        'data': json.loads(json.dumps(data, cls=DjangoJSONEncoder)),
    }

    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.error("Diffusion impossible : aucun channel layer configuré.")
        return False

    try:
        for group in groups:
            async_to_sync(channel_layer.group_send)(group, message)
    except Exception:  # noqa: BLE001 — la diffusion ne doit pas casser l'appelant
        logger.exception("Échec de diffusion %s vers %s", message['type'], groups)
        return False

    logger.info("Diffusion %s vers %s", message['type'], groups)
    return True
