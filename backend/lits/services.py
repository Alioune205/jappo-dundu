"""
Logique métier du module Lits.

- Admission et sortie par mise à jour conditionnelle en SQL
  (``UPDATE ... WHERE occupied_beds < total_beds``) : deux admissions
  simultanées ne peuvent jamais dépasser la capacité, sans verrou applicatif.
- Recherche des établissements les plus proches disposant de lits libres
  dans un service donné (moteur ``geo``).
- Diffusion temps réel : indicateurs au tableau de bord à chaque changement,
  alerte quand un service vital sature ou redevient disponible.

Auteur : Ibrahima Khalilou Diallo
"""

import logging

from django.db import IntegrityError, transaction
from django.db.models import F, OuterRef, Subquery
from django.utils import timezone

from geo.search import nearest
from realtime.broadcast import broadcast_alert, broadcast_dashboard
from users.exceptions import Conflict
from users.models import HealthFacility

from .models import BED_FACILITY_TYPES, BedCapacity

logger = logging.getLogger('jappo_dundu.lits')

CAPACITY_UPDATED = 'bed_capacity_updated'
CAPACITY_SATURATED = 'bed_capacity_saturated'
CAPACITY_RESTORED = 'bed_capacity_restored'


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
            fields=['total_beds', 'occupied_beds', 'updated_at', 'updated_by']
        )
        notify_capacity(capacity, capacity.available_beds + delta)
    return capacity


def admit(capacity, *, updated_by):
    """Occupe un lit ; 409 si le service est plein."""
    return _shift_occupancy(
        capacity,
        +1,
        {'occupied_beds__lt': F('total_beds')},
        "Aucun lit disponible dans ce service.",
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
    available = (
        BedCapacity.objects.filter(facility=OuterRef('pk'), category=category)
        .annotate(free=F('total_beds') - F('occupied_beds'))
        .values('free')[:1]
    )
    queryset = (
        HealthFacility.objects.filter(is_active=True, facility_type__in=BED_FACILITY_TYPES)
        .annotate(available_beds=Subquery(available))
        .filter(available_beds__gte=min_available)
    )
    return nearest(queryset, point, radius_m=radius_m, limit=limit)
