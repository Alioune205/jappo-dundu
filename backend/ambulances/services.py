"""
Logique métier du module Ambulances.

Affectation (``assign``) : la mission est verrouillée, puis l'ambulance est
« réservée » par une mise à jour conditionnelle
(``UPDATE ... SET status = 'on_mission' WHERE status = 'available'``).
Deux régulateurs qui affectent en même temps ne peuvent donc jamais
obtenir la même ambulance : le second passe au candidat suivant. Une
contrainte d'unicité en base interdit en dernier recours deux missions
actives pour une même ambulance.

Auteur : Ibrahima Khalilou Diallo
"""

import logging
import statistics
from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from geo.distance import GeoPoint
from geo.search import nearest
from realtime.broadcast import broadcast_alert, broadcast_dashboard
from users.exceptions import Conflict

from .models import Ambulance, Mission

logger = logging.getLogger('jappo_dundu.ambulances')

MissionStatus = Mission.Status
AmbulanceStatus = Ambulance.Status

DEFAULT_DISPATCH_RADIUS_KM = 50
DISPATCH_CANDIDATES = 10

MISSION_CREATED = 'mission_created'
MISSION_UPDATED = 'mission_updated'
AMBULANCE_POSITION = 'ambulance_position'
AMBULANCE_STATUS = 'ambulance_status'


# =============================================================
# DIFFUSION
# =============================================================


def mission_payload(mission, event):
    ambulance = mission.ambulance
    destination = mission.destination
    return {
        'event': event,
        'mission_id': mission.pk,
        'status': mission.status,
        'priority': mission.priority,
        'region': mission.region,
        'pickup': {
            'address': mission.pickup_address,
            'latitude': mission.pickup_latitude,
            'longitude': mission.pickup_longitude,
        },
        'ambulance': None
        if ambulance is None
        else {
            'id': ambulance.pk,
            'plate_number': ambulance.plate_number,
            'ambulance_type': ambulance.ambulance_type,
        },
        'destination': None
        if destination is None
        else {
            'id': destination.pk,
            'name': destination.name,
        },
    }


def notify_mission(mission, event):
    """Alerte régionale (et de l'hôpital de destination) + tableau de bord."""
    payload = mission_payload(mission, event)
    hospital_id = mission.destination_id

    def send():
        broadcast_alert('ambulance', payload, region=mission.region, hospital_id=hospital_id)
        broadcast_dashboard('dashboard', payload, hospital_id=hospital_id)

    transaction.on_commit(send)


def notify_ambulance(ambulance, event):
    """Position ou disponibilité d'une ambulance, pour les cartes temps réel.

    Diffusé au tableau de bord national et à celui de l'hôpital vers lequel
    l'ambulance transporte un patient (sinon celui de son établissement).
    """
    active = (
        Mission.objects.filter(ambulance=ambulance, status__in=Mission.ACTIVE_STATUSES)
        .values('pk', 'destination_id')
        .first()
    )
    payload = {
        'event': event,
        'ambulance_id': ambulance.pk,
        'plate_number': ambulance.plate_number,
        'ambulance_type': ambulance.ambulance_type,
        'status': ambulance.status,
        'latitude': ambulance.latitude,
        'longitude': ambulance.longitude,
        'location_updated_at': ambulance.location_updated_at,
        'mission_id': active['pk'] if active else None,
    }
    hospital_id = (active and active['destination_id']) or ambulance.facility_id
    transaction.on_commit(
        lambda: broadcast_dashboard('dashboard', payload, hospital_id=hospital_id)
    )


# =============================================================
# AMBULANCES
# =============================================================


def find_nearest_available(point, *, radius_m, limit, ambulance_type=None):
    """Ambulances disponibles les plus proches (chacune porte ``distance_m``)."""
    queryset = Ambulance.objects.filter(
        status=AmbulanceStatus.AVAILABLE,
        facility__is_active=True,
    ).select_related('facility', 'driver')
    if ambulance_type:
        queryset = queryset.filter(ambulance_type=ambulance_type)
    return nearest(queryset, point, radius_m=radius_m, limit=limit)


def update_position(ambulance, point):
    ambulance.latitude = point.latitude
    ambulance.longitude = point.longitude
    ambulance.location_updated_at = timezone.now()
    with transaction.atomic():
        ambulance.save(
            update_fields=['latitude', 'longitude', 'location_updated_at', 'updated_at']
        )
        notify_ambulance(ambulance, AMBULANCE_POSITION)
    return ambulance


def set_availability(ambulance, status):
    """Met une ambulance en service ou hors service (jamais pendant une mission)."""
    if status not in (AmbulanceStatus.AVAILABLE, AmbulanceStatus.OUT_OF_SERVICE):
        raise ValueError(f"Statut non modifiable manuellement : {status!r}.")
    with transaction.atomic():
        updated = (
            Ambulance.objects.filter(pk=ambulance.pk)
            .exclude(status=AmbulanceStatus.ON_MISSION)
            .update(status=status, updated_at=timezone.now())
        )
        if not updated:
            raise Conflict("L'ambulance est en mission : terminez ou annulez la mission d'abord.")
        ambulance.refresh_from_db(fields=['status', 'updated_at'])
        notify_ambulance(ambulance, AMBULANCE_STATUS)
    return ambulance


# =============================================================
# MISSIONS
# =============================================================


def create_mission(*, created_by, **data):
    with transaction.atomic():
        mission = Mission.objects.create(created_by=created_by, **data)
        notify_mission(mission, MISSION_CREATED)
    logger.info("Mission %s signalée (%s, %s)", mission.pk, mission.priority, mission.region)
    return mission


def _locked_mission(mission):
    return (
        Mission.objects.select_for_update(of=('self',))
        .select_related('ambulance', 'destination')
        .get(pk=mission.pk)
    )


def _claim(ambulance):
    """Réserve l'ambulance si elle est encore disponible (atomique)."""
    return bool(
        Ambulance.objects.filter(
            pk=ambulance.pk, status=AmbulanceStatus.AVAILABLE, facility__is_active=True
        ).update(status=AmbulanceStatus.ON_MISSION, updated_at=timezone.now())
    )


@transaction.atomic
def assign(mission, *, ambulance=None, ambulance_type=None, radius_km=DEFAULT_DISPATCH_RADIUS_KM):
    """Affecte une ambulance : celle indiquée, ou la plus proche disponible."""
    mission = _locked_mission(mission)
    if mission.status != MissionStatus.PENDING:
        raise Conflict("Seule une mission en attente peut recevoir une ambulance.")

    if ambulance is not None:
        if not _claim(ambulance):
            raise Conflict("Cette ambulance n'est pas disponible.")
        chosen = ambulance
    else:
        candidates = find_nearest_available(
            GeoPoint(mission.pickup_latitude, mission.pickup_longitude),
            radius_m=radius_km * 1000,
            limit=DISPATCH_CANDIDATES,
            ambulance_type=ambulance_type,
        )
        chosen = next((candidate for candidate in candidates if _claim(candidate)), None)
        if chosen is None:
            raise Conflict(f"Aucune ambulance disponible à moins de {radius_km:g} km.")

    chosen.status = AmbulanceStatus.ON_MISSION
    mission.ambulance = chosen
    mission.status = MissionStatus.ASSIGNED
    mission.assigned_at = timezone.now()
    mission.save(update_fields=['ambulance', 'status', 'assigned_at', 'updated_at'])
    notify_mission(mission, MISSION_UPDATED)
    notify_ambulance(chosen, AMBULANCE_STATUS)
    logger.info("Mission %s : ambulance %s affectée", mission.pk, chosen.pk)
    return mission


@transaction.atomic
def advance(mission, status, *, destination=None, cancellation_reason=''):
    """Fait avancer la mission dans son cycle de vie (hors affectation)."""
    mission = _locked_mission(mission)
    if status == MissionStatus.ASSIGNED:
        raise Conflict("L'affectation d'une ambulance passe par l'action « assign ».")
    if not mission.can_transition_to(status):
        raise Conflict(
            f"Transition impossible : « {mission.get_status_display()} » → "
            f"« {MissionStatus(status).label} »."
        )
    if destination is not None:
        if not destination.is_active:
            raise Conflict("L'établissement de destination est désactivé.")
        mission.destination = destination
    if status == MissionStatus.TRANSPORTING and mission.destination is None:
        raise Conflict("Indiquez l'établissement de destination avant le transport.")

    mission.status = status
    setattr(mission, Mission.TIMESTAMP_FIELDS[status], timezone.now())
    if status == MissionStatus.CANCELLED:
        mission.cancellation_reason = cancellation_reason
    mission.save()

    if mission.is_final and mission.ambulance_id:
        Ambulance.objects.filter(
            pk=mission.ambulance_id, status=AmbulanceStatus.ON_MISSION
        ).update(status=AmbulanceStatus.AVAILABLE, updated_at=timezone.now())
        mission.ambulance.refresh_from_db(fields=['status', 'updated_at'])
        notify_ambulance(mission.ambulance, AMBULANCE_STATUS)
    notify_mission(mission, MISSION_UPDATED)
    logger.info("Mission %s : %s", mission.pk, status)
    return mission


@transaction.atomic
def update_mission(mission, **changes):
    """Complète une mission non clôturée (description, priorité, destination...)."""
    mission = _locked_mission(mission)
    if mission.is_final:
        raise Conflict("Une mission clôturée ne peut plus être modifiée.")
    destination = changes.get('destination')
    if destination is not None and not destination.is_active:
        raise Conflict("L'établissement de destination est désactivé.")
    for field, value in changes.items():
        setattr(mission, field, value)
    mission.save()
    notify_mission(mission, MISSION_UPDATED)
    return mission


# =============================================================
# INDICATEURS
# =============================================================


def _minutes(deltas):
    minutes = [delta.total_seconds() / 60 for delta in deltas]
    if not minutes:
        return {'count': 0, 'average': None, 'median': None}
    return {
        'count': len(minutes),
        'average': round(statistics.fmean(minutes), 1),
        'median': round(statistics.median(minutes), 1),
    }


def mission_statistics(missions, ambulances, *, days):
    """Indicateurs de la période : volumes, délais (minutes), flotte."""
    since = timezone.now() - timedelta(days=days)
    period = missions.filter(created_at__gte=since)
    by_status = dict(period.order_by().values_list('status').annotate(total=Count('id')))
    timings = list(
        period.exclude(assigned_at=None).values_list('created_at', 'assigned_at', 'on_site_at')
    )
    fleet = dict(ambulances.order_by().values_list('status').annotate(total=Count('id')))
    return {
        'period_days': days,
        'missions': {
            'total': sum(by_status.values()),
            'by_status': {status: by_status.get(status, 0) for status in MissionStatus.values},
        },
        'assignment_delay_minutes': _minutes(
            assigned - created for created, assigned, _ in timings
        ),
        'response_time_minutes': _minutes(
            on_site - created for created, _, on_site in timings if on_site is not None
        ),
        'fleet': {status: fleet.get(status, 0) for status in AmbulanceStatus.values},
    }
