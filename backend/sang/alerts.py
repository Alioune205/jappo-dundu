"""
Alertes des donneurs par vagues.

Prévenir tous les donneurs d'un coup épuise le réseau et fait venir plus de
monde que nécessaire. Une demande alerte d'abord les donneurs les plus
proches ; si les engagements ne couvrent pas les poches restantes après un
délai, la vague suivante prévient les suivants, en élargissant le rayon de
recherche quand il n'y a plus personne à portée.

Règles (réglables dans les settings) :
- taille d'une vague selon l'urgence : ``BLOOD_ALERT_WAVE_SIZE`` ;
- délai avant la vague suivante : ``BLOOD_ALERT_WAVE_MINUTES`` ;
- au plus ``BLOOD_ALERT_MAX_WAVES`` vagues par demande ;
- un donneur n'est jamais alerté deux fois pour la même demande, et au plus
  ``BLOOD_ALERT_MAX_PER_WEEK`` fois par semaine, sauf urgence critique ;
- heures calmes (``BLOOD_ALERT_QUIET_HOURS``, 22 h – 7 h) : les demandes
  d'urgence « normale » attendent le matin ; critiques et urgentes partent
  à toute heure ;
- canal : notification push si le donneur a un téléphone enregistré, SMS
  sinon (solution de repli sans Internet).

``escalate_open_requests`` est appelé par la commande
``python manage.py escalate_blood_alerts`` (à planifier toutes les 2 minutes).
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import MAX_SEARCH_RADIUS_KM, BloodRequest, Donor, DonorAlert, DonorResponse

logger = logging.getLogger('jappo_dundu.sang')

Urgency = BloodRequest.Urgency

DEFAULT_WAVE_SIZE = {Urgency.CRITICAL: 30, Urgency.URGENT: 20, Urgency.NORMAL: 10}
DEFAULT_WAVE_MINUTES = {Urgency.CRITICAL: 5, Urgency.URGENT: 10, Urgency.NORMAL: 30}


def _setting(name, default):
    return getattr(settings, name, default)


def wave_size(urgency):
    return _setting('BLOOD_ALERT_WAVE_SIZE', DEFAULT_WAVE_SIZE).get(urgency, 10)


def wave_delay(urgency):
    return timedelta(minutes=_setting('BLOOD_ALERT_WAVE_MINUTES', DEFAULT_WAVE_MINUTES).get(urgency, 30))


def in_quiet_hours(now=None):
    start, end = _setting('BLOOD_ALERT_QUIET_HOURS', (22, 7))
    hour = timezone.localtime(now or timezone.now()).hour
    return hour >= start or hour < end


def _candidates(blood_request, now):
    """Donneurs pas encore alertés pour cette demande, ni trop sollicités cette semaine."""
    queryset = Donor.objects.exclude(alerts__blood_request=blood_request)
    if blood_request.urgency != Urgency.CRITICAL:
        week_ago = now - timedelta(days=7)
        queryset = queryset.annotate(
            recent_alerts=Count('alerts', filter=Q(alerts__sent_at__gte=week_ago))
        ).filter(recent_alerts__lt=_setting('BLOOD_ALERT_MAX_PER_WEEK', 3))
    return queryset


def send_wave(blood_request, *, now=None, manual=False):
    """Envoie la vague suivante d'une demande ouverte. Retourne le nombre de donneurs alertés.

    Sans donneur à portée, le rayon double (jusqu'à ``MAX_SEARCH_RADIUS_KM``)
    avant d'abandonner la vague. ``manual`` : relance décidée par l'hôpital,
    envoyée même pendant les heures calmes.
    """
    from push.models import PushDevice
    from push.services import notify_blood_request as notify_push

    from .notifications import notify_blood_request_sms
    from .services import find_matching_donors

    now = now or timezone.now()
    with transaction.atomic():
        locked = BloodRequest.objects.select_for_update().select_related('facility').get(pk=blood_request.pk)
        if locked.status != BloodRequest.Status.OPEN:
            return 0
        if locked.urgency == Urgency.NORMAL and in_quiet_hours(now) and not manual:
            return 0
        if locked.alert_wave >= _setting('BLOOD_ALERT_MAX_WAVES', 5):
            return 0

        size = wave_size(locked.urgency)
        donors = list(find_matching_donors(locked, limit=size, queryset=_candidates(locked, now)))
        while not donors and locked.search_radius_km < MAX_SEARCH_RADIUS_KM:
            locked.search_radius_km = min(locked.search_radius_km * 2, MAX_SEARCH_RADIUS_KM)
            donors = list(find_matching_donors(locked, limit=size, queryset=_candidates(locked, now)))

        locked.alert_wave += 1
        locked.last_alert_at = now
        locked.save(update_fields=['alert_wave', 'last_alert_at', 'search_radius_km', 'updated_at'])
        if not donors:
            logger.info("Demande %s : aucun donneur à alerter (vague %d).", locked.pk, locked.alert_wave)
            return 0

        with_phone = set(
            PushDevice.objects.filter(is_active=True, user_id__in=[d.user_id for d in donors]).values_list(
                'user_id', flat=True
            )
        )
        push_donors = [d for d in donors if d.user_id in with_phone]
        sms_donors = [d for d in donors if d.user_id not in with_phone]
        DonorAlert.objects.bulk_create(
            [
                DonorAlert(
                    blood_request=locked,
                    donor=donor,
                    wave=locked.alert_wave,
                    channel=DonorAlert.Channel.PUSH if donor.user_id in with_phone else DonorAlert.Channel.SMS,
                )
                for donor in donors
            ],
            ignore_conflicts=True,
        )

    def deliver():
        if push_donors:
            notify_push(locked, donors=push_donors)
        if sms_donors:
            notify_blood_request_sms(locked, donors=sms_donors)

    transaction.on_commit(deliver)
    logger.info(
        "Demande %s : vague %d, %d donneur(s) alerté(s) (rayon %d km).",
        locked.pk,
        locked.alert_wave,
        len(donors),
        locked.search_radius_km,
    )
    return len(donors)


def needs_next_wave(blood_request, now=None):
    """Les engagements ne couvrent pas les poches restantes et le délai de la vague est écoulé."""
    now = now or timezone.now()
    if blood_request.status != BloodRequest.Status.OPEN:
        return False
    if blood_request.last_alert_at is not None and now - blood_request.last_alert_at < wave_delay(
        blood_request.urgency
    ):
        return False
    engaged = blood_request.responses.filter(status=DonorResponse.Status.ACCEPTED).count()
    return engaged < blood_request.units_remaining


def escalate_open_requests(now=None):
    """Envoie la vague suivante des demandes ouvertes qui en ont besoin. Retourne le nombre de vagues envoyées."""
    now = now or timezone.now()
    waves = 0
    queryset = BloodRequest.objects.filter(
        status=BloodRequest.Status.OPEN, alert_wave__lt=_setting('BLOOD_ALERT_MAX_WAVES', 5)
    )
    for blood_request in queryset:
        if needs_next_wave(blood_request, now) and send_wave(blood_request, now=now):
            waves += 1
    return waves
