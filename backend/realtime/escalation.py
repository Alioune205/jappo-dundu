"""
Alertes critiques : création, accusé de réception, relance par SMS.

- ``raise_alert`` : crée l'alerte (une seule ouverte par objet) et la diffuse ;
- ``resolve`` : l'action attendue a eu lieu (mission affectée, pré-alerte
  répondue, commande acceptée) : l'alerte se ferme d'elle-même ;
- ``acknowledge`` : quelqu'un a vu l'alerte et s'en occupe ;
- ``escalate`` (commande ``escalate_critical_alerts``, chaque minute) :
  sans accusé après ``CRITICAL_ESCALATION_MINUTES`` (2), SMS à la ligne de
  garde de l'établissement ; après le double, SMS aux administrateurs
  généraux qui ont un téléphone. L'administrateur général supervise sans
  opérer : son SMS l'oriente vers le service qui agit (``SUPERVISOR_HINTS``).

Les SMS ne contiennent ni nom de patient ni précision clinique.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .broadcast import broadcast_alert
from .models import CriticalAlert

logger = logging.getLogger('jappo_dundu.realtime')

ACK_EVENT = 'critical_alert'


# Consigne ajoutée au SMS de l'administrateur général : il n'affecte pas
# d'ambulance et ne répond pas à la place de l'établissement, il alerte qui le fait.
SUPERVISOR_HINTS = {
    CriticalAlert.Kind.MISSION: " Contactez la régulation SAMU de la région.",
    CriticalAlert.Kind.PREALERT: " Contactez l'hôpital de destination.",
    CriticalAlert.Kind.BLOOD_ORDER: " Contactez le centre fournisseur.",
}


def _minutes():
    return getattr(settings, 'CRITICAL_ESCALATION_MINUTES', 2)


def payload(alert):
    return {
        'event': ACK_EVENT,
        'critical_alert_id': alert.pk,
        'kind': alert.kind,
        'title': alert.title,
        'message': alert.message,
        'acknowledged': alert.acknowledged_at is not None,
        'facility_id': alert.facility_id,
    }


def raise_alert(kind, target, *, title, message, facility=None, region=''):
    """Ouvre une alerte critique sur ``target`` (sans doublon tant qu'elle est ouverte)."""
    try:
        with transaction.atomic():
            alert = CriticalAlert.objects.create(
                kind=kind,
                target_type=type(target).__name__,
                target_id=target.pk,
                facility=facility,
                region=region or '',
                title=title,
                message=message,
            )
    except IntegrityError:
        return None
    data = payload(alert)
    transaction.on_commit(
        lambda: broadcast_alert('general', data, region=region or None, hospital_id=getattr(facility, 'pk', None))
    )
    if facility is not None:
        from sih.interop import dispatch_webhook

        transaction.on_commit(lambda: dispatch_webhook(facility, kind, {**data, 'target_id': target.pk}))
    return alert


def resolve(kind, target, *, user=None):
    """L'action attendue a eu lieu : ferme l'alerte ouverte de cet objet."""
    return CriticalAlert.objects.filter(
        kind=kind, target_type=type(target).__name__, target_id=target.pk, acknowledged_at__isnull=True
    ).update(acknowledged_at=timezone.now(), acknowledged_by=user)


def acknowledge(alert, user):
    if alert.acknowledged_at is None:
        alert.acknowledged_at = timezone.now()
        alert.acknowledged_by = user
        alert.save(update_fields=['acknowledged_at', 'acknowledged_by'])
    return alert


def _admin_phones():
    from django.contrib.auth import get_user_model

    return list(
        get_user_model()
        .objects.filter(is_staff=True, is_active=True)
        .exclude(profile__phone_number='')
        .values_list('profile__phone_number', flat=True)
    )


def escalate(now=None):
    """Relance par SMS les alertes critiques restées sans accusé. Retourne le nombre de relances."""
    from identity.sms import send_sms

    now = now or timezone.now()
    step = timedelta(minutes=_minutes())
    count = 0
    open_alerts = CriticalAlert.objects.filter(acknowledged_at__isnull=True, escalation_level__lt=2).select_related(
        'facility'
    )
    for alert in open_alerts:
        age = now - alert.created_at
        text = f"Jappo Dundu - ALERTE NON PRISE EN CHARGE : {alert.title}. {alert.message}"
        if alert.escalation_level == 0 and age >= step:
            phone = alert.facility and (alert.facility.on_call_phone or alert.facility.phone_number)
            if phone:
                send_sms(phone, text)
            alert.escalation_level = 1
        elif alert.escalation_level == 1 and age >= 2 * step:
            supervisor_text = text + SUPERVISOR_HINTS.get(alert.kind, '')
            for phone in _admin_phones():
                send_sms(phone, supervisor_text)
            alert.escalation_level = 2
        else:
            continue
        alert.escalated_at = now
        alert.save(update_fields=['escalation_level', 'escalated_at'])
        logger.warning("Alerte critique %s relancée (niveau %d)", alert.pk, alert.escalation_level)
        count += 1
    return count
