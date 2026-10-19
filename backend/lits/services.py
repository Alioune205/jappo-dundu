"""
Logique métier du module Lits.

- Admission et sortie par mise à jour conditionnelle en SQL
  (``UPDATE ... WHERE occupied_beds < total_beds``) : deux admissions
  simultanées ne peuvent jamais dépasser la capacité, sans verrou applicatif.
- Recherche des établissements les plus proches disposant de lits libres
  dans un service donné (moteur ``geo``).
- Réservations : un lit bloqué pour un patient attendu compte comme
  indisponible jusqu'à l'admission, l'annulation ou l'expiration.
- Diffusion temps réel : indicateurs au tableau de bord à chaque changement,
  alerte quand un service vital sature ou redevient disponible.

Auteur : Ibrahima Khalilou Diallo
"""

import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import F, OuterRef, Subquery
from django.utils import timezone

from geo.search import nearest
from realtime.broadcast import broadcast_alert, broadcast_dashboard
from users.exceptions import Conflict
from users.models import HealthFacility

from .models import BED_FACILITY_TYPES, BedCapacity, BedReservation

logger = logging.getLogger('jappo_dundu.lits')

CAPACITY_UPDATED = 'bed_capacity_updated'
CAPACITY_SATURATED = 'bed_capacity_saturated'
CAPACITY_RESTORED = 'bed_capacity_restored'

DEFAULT_HOLD_MINUTES = 45
MAX_HOLD_MINUTES = 240

# Lits encore attribuables (ni occupés ni réservés), en SQL.
FREE_BEDS = F('total_beds') - F('occupied_beds') - F('reserved_beds')


# =============================================================
# DIFFUSION
# =============================================================


def capacity_payload(capacity, event):
    facility = capacity.facility
    return {
        'event': event,
        'capacity_id': capacity.pk,
        'category': capacity.category,
        'total_beds': capacity.total_beds,
        'occupied_beds': capacity.occupied_beds,
        'reserved_beds': capacity.reserved_beds,
        'available_beds': capacity.available_beds,
        'occupancy_rate': capacity.occupancy_rate,
        'facility': {
            'id': facility.pk,
            'name': facility.name,
            'city': facility.city,
            'region': facility.region,
            'latitude': facility.latitude,
            'longitude': facility.longitude,
        },
    }


def notify_capacity(capacity, previous_available):
    """Indicateurs au tableau de bord ; alerte si un service vital change d'état."""
    facility = capacity.facility
    kpi = capacity_payload(capacity, CAPACITY_UPDATED)
    alert = None
    if capacity.category in BedCapacity.CRITICAL_CATEGORIES:
        if capacity.available_beds == 0 and previous_available != 0:
            alert = capacity_payload(capacity, CAPACITY_SATURATED)
        elif capacity.available_beds > 0 and previous_available == 0:
            alert = capacity_payload(capacity, CAPACITY_RESTORED)

    def send():
        broadcast_dashboard('kpi', kpi, hospital_id=facility.pk)
        if alert is not None:
            broadcast_alert('bed', alert, region=facility.region, hospital_id=facility.pk)

    transaction.on_commit(send)


# =============================================================
# ÉCRITURES
# =============================================================


def _check_facility(facility):
    if not facility.is_active:
        raise Conflict("Cet établissement est désactivé.")
    if facility.facility_type not in BED_FACILITY_TYPES:
        raise Conflict(
            f"Un établissement de type « {facility.get_facility_type_display()} » "
            f"ne gère pas de lits d'hospitalisation."
        )


def create_capacity(*, facility, category, total_beds, occupied_beds=0, updated_by):
    _check_facility(facility)
    try:
        with transaction.atomic():
            capacity = BedCapacity.objects.create(
                facility=facility,
                category=category,
                total_beds=total_beds,
                occupied_beds=occupied_beds,
                updated_by=updated_by,
            )
            notify_capacity(capacity, previous_available=None)
    except IntegrityError as exc:
        raise Conflict("Ce service existe déjà pour cet établissement.") from exc
    return capacity


@transaction.atomic
def update_capacity(capacity, *, updated_by, **changes):
    """Met à jour le nombre de lits installés et/ou occupés."""
    locked = BedCapacity.objects.select_for_update().get(pk=capacity.pk)
    previous_available = locked.available_beds
    for field, value in changes.items():
        setattr(locked, field, value)
    if locked.occupied_beds > locked.total_beds:
        raise Conflict("Les lits occupés ne peuvent pas dépasser les lits installés.")
    if locked.occupied_beds + locked.reserved_beds > locked.total_beds:
        # Un ajustement manuel ne supprime jamais en silence le lit promis à un
        # patient en route : la réservation doit être traitée d'abord.
        raise Conflict(
            f"{locked.reserved_beds} lit(s) de ce service sont réservés : admettez ou annulez "
            "ces réservations avant de réduire les lits disponibles."
        )
    locked.updated_by = updated_by
    locked.save()
    locked.facility = capacity.facility
    notify_capacity(locked, previous_available)
    return locked


def _shift_occupancy(capacity, delta, condition, error, updated_by):
    with transaction.atomic():
        updated = BedCapacity.objects.filter(pk=capacity.pk, **condition).update(
            occupied_beds=F('occupied_beds') + delta,
            updated_by=updated_by,
            updated_at=timezone.now(),
        )
        if not updated:
            raise Conflict(error)
        capacity.refresh_from_db(
            fields=['total_beds', 'occupied_beds', 'reserved_beds', 'updated_at', 'updated_by']
        )
        notify_capacity(capacity, capacity.available_beds + delta)
    return capacity


def admit(capacity, *, updated_by):
    """Occupe un lit libre ; 409 si tous les lits sont occupés ou réservés.

    Le patient attendu sur une réservation s'admet par ``fulfill_reservation``.
    """
    release_expired(capacity=capacity)
    return _shift_occupancy(
        capacity,
        +1,
        {'occupied_beds__lt': F('total_beds') - F('reserved_beds')},
        "Aucun lit libre dans ce service (les lits restants sont occupés ou réservés).",
        updated_by,
    )


def discharge(capacity, *, updated_by):
    """Libère un lit ; 409 si aucun lit n'est occupé."""
    return _shift_occupancy(
        capacity,
        -1,
        {'occupied_beds__gt': 0},
        "Aucun lit occupé dans ce service.",
        updated_by,
    )


# =============================================================
# RECHERCHE
# =============================================================


def find_facilities_with_beds(point, *, category, radius_m, limit, min_available=1):
    """Établissements actifs les plus proches ayant ``min_available`` lits libres.

    Chaque établissement retourné porte ``distance_m`` et ``available_beds``.
    """
    release_expired()
    available = (
        BedCapacity.objects.filter(facility=OuterRef('pk'), category=category)
        .annotate(free=FREE_BEDS)
        .values('free')[:1]
    )
    queryset = (
        HealthFacility.objects.filter(is_active=True, facility_type__in=BED_FACILITY_TYPES)
        .annotate(available_beds=Subquery(available))
        .filter(available_beds__gte=min_available)
    )
    return nearest(queryset, point, radius_m=radius_m, limit=limit)


# =============================================================
# RÉSERVATIONS
# =============================================================


def _close(reservation, status, *, closed_by=None, reason='', admit=False):
    """Clôt une réservation active et libère (ou occupe) son lit, sans course.

    Retourne False si la réservation n'était plus active (déjà clôturée).
    """
    now = timezone.now()
    closed = BedReservation.objects.filter(pk=reservation.pk, status=BedReservation.Status.ACTIVE).update(
        status=status, closed_at=now, closed_by=closed_by, closing_reason=reason[:200]
    )
    if not closed:
        return False
    changes = {'reserved_beds': F('reserved_beds') - 1, 'updated_at': now}
    if admit:
        changes['occupied_beds'] = F('occupied_beds') + 1
        changes['updated_by'] = closed_by
    BedCapacity.objects.filter(pk=reservation.capacity_id).update(**changes)
    capacity = BedCapacity.objects.select_related('facility').get(pk=reservation.capacity_id)
    # Lit réservé libéré (+1 libre) ou devenu occupé (libres inchangés).
    notify_capacity(capacity, capacity.available_beds if admit else capacity.available_beds - 1)
    reservation.refresh_from_db()
    logger.info("Réservation %s : %s", reservation.pk, status)
    return True


def release_expired(*, capacity=None, now=None):
    """Expire les réservations échues.

    Appelée avant toute lecture ou écriture qui dépend des lits libres : aucune
    tâche planifiée n'est indispensable (``manage.py expire_bed_reservations``
    le fait aussi en lot).
    """
    due = BedReservation.objects.filter(
        status=BedReservation.Status.ACTIVE, expires_at__lte=now or timezone.now()
    )
    if capacity is not None:
        due = due.filter(capacity=capacity)
    count = 0
    for reservation in due.only('pk', 'capacity_id'):
        with transaction.atomic():
            if _close(reservation, BedReservation.Status.EXPIRED, reason="Délai de réservation écoulé"):
                count += 1
    return count


@transaction.atomic
def reserve(capacity, *, created_by, mission=None, reference='', notes='', hold_minutes=DEFAULT_HOLD_MINUTES):
    """Bloque un lit libre du service ; 409 si aucun lit n'est libre.

    Pour une mission, la réservation remplace celle qu'elle avait peut-être
    ailleurs (réorientation) et fixe l'établissement comme destination.
    """
    _check_facility(capacity.facility)
    release_expired(capacity=capacity)
    if mission is not None:
        from ambulances import services as mission_services

        if mission.is_final:
            raise Conflict("Cette mission est clôturée.")
        for previous in BedReservation.objects.filter(mission=mission, status=BedReservation.Status.ACTIVE):
            _close(previous, BedReservation.Status.CANCELLED, closed_by=created_by, reason="Mission réorientée")
        if mission.destination_id != capacity.facility_id:
            mission_services.update_mission(mission, destination=capacity.facility)

    reserved = BedCapacity.objects.filter(
        pk=capacity.pk, occupied_beds__lt=F('total_beds') - F('reserved_beds')
    ).update(reserved_beds=F('reserved_beds') + 1, updated_at=timezone.now())
    if not reserved:
        raise Conflict("Aucun lit libre dans ce service : réservation impossible.")
    reservation = BedReservation.objects.create(
        capacity=capacity,
        mission=mission,
        reference=reference,
        notes=notes,
        created_by=created_by,
        expires_at=timezone.now() + timedelta(minutes=hold_minutes),
    )
    capacity.refresh_from_db(fields=['total_beds', 'occupied_beds', 'reserved_beds', 'updated_at'])
    notify_capacity(capacity, capacity.available_beds + 1)
    logger.info("Lit réservé : réservation=%s service=%s", reservation.pk, capacity.pk)
    return reservation


@transaction.atomic
def fulfill_reservation(reservation, *, closed_by=None, reason="Patient admis"):
    """Le patient attendu est arrivé : le lit réservé devient occupé."""
    if not _close(reservation, BedReservation.Status.FULFILLED, closed_by=closed_by, reason=reason, admit=True):
        raise Conflict("Cette réservation n'est plus en cours.")
    return reservation


@transaction.atomic
def cancel_reservation(reservation, *, closed_by=None, reason=''):
    """Libère le lit réservé (patient réorienté, transfert annulé...)."""
    if not _close(reservation, BedReservation.Status.CANCELLED, closed_by=closed_by, reason=reason or "Annulée"):
        raise Conflict("Cette réservation n'est plus en cours.")
    return reservation


def close_mission_reservation(mission):
    """Fin de mission : patient remis à l'hôpital (admis) ou mission annulée (lit libéré)."""
    from ambulances.models import Mission

    reservation = BedReservation.objects.filter(mission=mission, status=BedReservation.Status.ACTIVE).first()
    if reservation is None:
        return None
    if mission.status == Mission.Status.COMPLETED:
        _close(
            reservation,
            BedReservation.Status.FULFILLED,
            reason="Patient remis à l'hôpital (mission terminée)",
            admit=True,
        )
    elif mission.status == Mission.Status.CANCELLED:
        _close(reservation, BedReservation.Status.CANCELLED, reason="Mission annulée")
    return reservation


def release_for_physical_capacity(capacity, *, total_beds, occupied_beds, reason):
    """Libère les réservations qui ne tiennent plus dans les lits déclarés par le SIH.

    À appeler AVANT d'enregistrer ``total_beds`` / ``occupied_beds`` (sinon la
    contrainte « réservés ≤ libres » refuserait l'écriture). Les réservations
    les plus récentes sont libérées d'abord : les engagements les plus anciens
    gardent la priorité. Met à jour ``capacity.reserved_beds`` ; retourne le
    nombre de réservations libérées.
    """
    excess = occupied_beds + capacity.reserved_beds - total_beds
    if excess <= 0:
        return 0
    released = 0
    newest_first = BedReservation.objects.filter(
        capacity=capacity, status=BedReservation.Status.ACTIVE
    ).order_by('-created_at')
    for reservation in newest_first[:excess]:
        if _close(reservation, BedReservation.Status.CANCELLED, reason=reason):
            released += 1
    capacity.refresh_from_db(fields=['reserved_beds'])
    if released:
        logger.warning("Service %s plein selon le SIH : %d réservation(s) libérée(s)", capacity.pk, released)
    return released
