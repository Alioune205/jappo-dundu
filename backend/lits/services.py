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
from django.db.models.functions import Least
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
CAPACITY_STALE = 'bed_capacity_stale'

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
        'expected_discharges': capacity.expected_discharges,
        'confirmed_at': capacity.confirmed_at.isoformat() if capacity.confirmed_at else None,
        'freshness': capacity.freshness,
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
                confirmed_at=timezone.now(),
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
    if locked.expected_discharges > locked.occupied_beds:
        raise Conflict("Les sorties prévues ne peuvent pas dépasser les lits occupés.")
    if locked.occupied_beds + locked.reserved_beds > locked.total_beds:
        # Un ajustement manuel ne supprime jamais en silence le lit promis à un
        # patient en route : la réservation doit être traitée d'abord.
        raise Conflict(
            f"{locked.reserved_beds} lit(s) de ce service sont réservés : admettez ou annulez "
            "ces réservations avant de réduire les lits disponibles."
        )
    locked.updated_by = updated_by
    locked.confirmed_at = timezone.now()
    locked.save()
    locked.facility = capacity.facility
    notify_capacity(locked, previous_available)
    return locked


def confirm_capacity(capacity, *, updated_by):
    """« Les chiffres sont toujours justes » : renouvelle leur fraîcheur sans les changer."""
    now = timezone.now()
    BedCapacity.objects.filter(pk=capacity.pk).update(confirmed_at=now, updated_by=updated_by, updated_at=now)
    capacity.refresh_from_db(fields=['confirmed_at', 'updated_by', 'updated_at'])
    notify_capacity(capacity, capacity.available_beds)
    return capacity


def stale_capacities(facility=None):
    """Services dont les chiffres n'ont pas été confirmés depuis ``BED_STALE_MINUTES``."""
    from django.conf import settings

    limit = timezone.now() - timedelta(minutes=getattr(settings, 'BED_STALE_MINUTES', 720))
    queryset = BedCapacity.objects.filter(confirmed_at__lt=limit, facility__is_active=True)
    if facility is not None:
        queryset = queryset.filter(facility=facility)
    return queryset.select_related('facility')


def remind_stale():
    """Alerte chaque établissement dont des services ne sont plus confirmés.

    Diffusée sur le flux d'alertes de l'établissement : le tableau de bord des
    lits affiche le rappel et le bouton « Confirmer ». Retourne le nombre de
    services concernés.
    """
    stale = list(stale_capacities())
    for capacity in stale:
        broadcast_alert(
            'bed',
            capacity_payload(capacity, CAPACITY_STALE),
            region=capacity.facility.region,
            hospital_id=capacity.facility_id,
        )
    return len(stale)


def _shift_occupancy(capacity, delta, condition, error, updated_by):
    with transaction.atomic():
        now = timezone.now()
        updated = BedCapacity.objects.filter(pk=capacity.pk, **condition).update(
            occupied_beds=F('occupied_beds') + delta,
            # Une sortie consomme une sortie prévue.
            expected_discharges=Least(F('expected_discharges'), F('occupied_beds') + delta),
            updated_by=updated_by,
            updated_at=now,
            confirmed_at=now,
        )
        if not updated:
            raise Conflict(error)
        capacity.refresh_from_db(
            fields=[
                'total_beds',
                'occupied_beds',
                'reserved_beds',
                'expected_discharges',
                'updated_at',
                'updated_by',
                'confirmed_at',
            ]
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
# NIVEAU DE TENSION
# =============================================================

# Consignes associées à chaque niveau (inspirées des niveaux d'escalade
# hospitaliers OPEL) ; à adapter avec chaque établissement.
TENSION_LEVELS = {
    1: ("Normal", "Activité habituelle."),
    2: ("Tension modérée", "Anticiper les sorties du jour ; confirmer les chiffres toutes les 2 h."),
    3: ("Tension forte", "Accélérer les sorties ; prévenir la régulation ; reporter les admissions programmées."),
    4: ("Saturation", "Plan blanc à envisager ; la régulation oriente les patients vers d'autres hôpitaux."),
}


def tension_of(capacities):
    """Niveau de tension (1 à 4) d'un établissement à partir de ses services, et ses raisons.

    - 4 : un service vital plein et l'établissement occupé à 95 % ou plus ;
    - 3 : un service vital plein, ou 90 % d'occupation ;
    - 2 : un service vital à 90 %, ou 80 % d'occupation ;
    - 1 : sinon.
    """
    capacities = list(capacities)
    total = sum(c.total_beds for c in capacities)
    used = sum(c.occupied_beds + c.reserved_beds for c in capacities)
    rate = used / total if total else 0
    vital = [c for c in capacities if c.category in BedCapacity.CRITICAL_CATEGORIES and c.total_beds]
    vital_full = [c for c in vital if c.available_beds == 0]
    vital_high = [c for c in vital if (c.occupied_beds + c.reserved_beds) / c.total_beds >= 0.9]
    reasons = [f"{c.get_category_display()} plein" for c in vital_full]
    if rate >= 0.8:
        reasons.append(f"Occupation {round(rate * 100)} %")
    if vital_full and rate >= 0.95:
        level = 4
    elif vital_full or rate >= 0.9:
        level = 3
    elif vital_high or rate >= 0.8:
        level = 2
        reasons.extend(f"{c.get_category_display()} à 90 %" for c in vital_high if c not in vital_full)
    else:
        level = 1
    label, action = TENSION_LEVELS[level]
    return {'level': level, 'label': label, 'action': action, 'occupancy_rate': round(rate, 4), 'reasons': reasons}


# =============================================================
# RECHERCHE
# =============================================================


def find_facilities_with_beds(point, *, category, radius_m, limit, min_available=1, capabilities=()):
    """Établissements actifs les plus proches ayant ``min_available`` lits libres.

    Chaque établissement retourné porte ``distance_m``, ``available_beds``,
    ``expected_discharges`` et ``confirmed_at``. ``capabilities`` : plateau
    technique exigé (tous les codes doivent être déclarés par l'établissement).
    """
    release_expired()
    service = BedCapacity.objects.filter(facility=OuterRef('pk'), category=category)
    queryset = (
        HealthFacility.objects.filter(is_active=True, facility_type__in=BED_FACILITY_TYPES)
        .annotate(
            available_beds=Subquery(service.annotate(free=FREE_BEDS).values('free')[:1]),
            expected_discharges=Subquery(service.values('expected_discharges')[:1]),
            # Fraîcheur des chiffres : l'écran signale un lit « libre » non reconfirmé.
            confirmed_at=Subquery(service.values('confirmed_at')[:1]),
        )
        .filter(available_beds__gte=min_available)
    )
    if not capabilities:
        return nearest(queryset, point, radius_m=radius_m, limit=limit)
    # Plateau technique requis (liste JSON, filtrée ici pour rester portable) :
    # on élargit la recherche puis on garde les établissements équipés.
    required = set(capabilities)
    candidates = nearest(queryset, point, radius_m=radius_m, limit=max(limit * 10, 50))
    return [facility for facility in candidates if required <= set(facility.capabilities or ())][:limit]


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
