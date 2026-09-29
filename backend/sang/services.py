"""
Logique métier du module Sang.

Algorithme d'appariement donneurs ↔ demande (``find_matching_donors``) :
1. groupes compatibles avec le receveur (ABO/Rh, ``compatibility``) ;
2. donneurs éligibles aujourd'hui (âge, délai depuis le dernier don,
   disponibilité, compte actif), filtrés en SQL ;
3. exclusion des donneurs ayant déjà répondu à la demande ;
4. recherche géographique autour de l'établissement, dans le rayon de la
   demande, du plus proche au plus éloigné (PostGIS : index GiST + KNN).

Les opérations qui modifient une demande verrouillent sa ligne
(``select_for_update``) : deux confirmations simultanées ne peuvent pas
dépasser le nombre de poches demandé.

Auteur : Ibrahima Khalilou Diallo
"""

import logging

from django.db import transaction
from django.utils import timezone

from geo.distance import GeoPoint
from geo.search import MAX_RESULTS, nearest
from users.exceptions import Conflict

from . import notifications
from .compatibility import can_donate, compatible_donor_groups, compatible_recipient_groups
from .models import BloodRequest, Donation, Donor, DonorResponse

logger = logging.getLogger('jappo_dundu.sang')

Status = BloodRequest.Status
ResponseStatus = DonorResponse.Status


def facility_point(facility):
    return GeoPoint(facility.latitude, facility.longitude)


# =============================================================
# RECHERCHE
# =============================================================


def find_matching_donors(blood_request, *, radius_km=None, limit=20, today=None):
    """Donneurs éligibles et compatibles les plus proches de l'établissement.

    Chaque donneur retourné porte ``distance_m``.
    """
    radius_km = min(radius_km or blood_request.search_radius_km, blood_request.search_radius_km)
    queryset = (
        Donor.objects.eligible(today)
        .filter(blood_group__in=compatible_donor_groups(blood_request.blood_group))
        .exclude(responses__blood_request=blood_request)
        .select_related('user')
    )
    return nearest(
        queryset,
        facility_point(blood_request.facility),
        radius_m=radius_km * 1000,
        limit=limit,
    )


def find_nearby_requests(donor, point, *, radius_km, limit):
    """Demandes ouvertes compatibles, dont le rayon de recherche atteint ``point``.

    Chaque demande retournée porte ``distance_m`` (établissement ↔ point).
    """
    queryset = BloodRequest.objects.filter(
        status=Status.OPEN,
        blood_group__in=compatible_recipient_groups(donor.blood_group),
        facility__is_active=True,
    ).select_related('facility')
    candidates = nearest(
        queryset,
        point,
        radius_m=radius_km * 1000,
        limit=MAX_RESULTS,
        latitude_field='facility__latitude',
        longitude_field='facility__longitude',
    )
    reachable = [req for req in candidates if req.distance_m <= req.search_radius_km * 1000]
    return reachable[:limit]


# =============================================================
# DEMANDES
# =============================================================


def create_request(*, facility, created_by, **data):
    if not facility.is_active:
        raise Conflict("Cet établissement est désactivé.")
    with transaction.atomic():
        blood_request = BloodRequest.objects.create(
            facility=facility, created_by=created_by, **data
        )
        notifications.notify_request(blood_request, notifications.REQUEST_CREATED)
    logger.info(
        "Demande de sang %s créée : %s × %d, établissement=%s",
        blood_request.pk,
        blood_request.blood_group,
        blood_request.units_needed,
        facility.pk,
    )
    return blood_request


def _locked_request(blood_request):
    locked = BloodRequest.objects.select_for_update().get(pk=blood_request.pk)
    # Évite une requête pour l'établissement, déjà chargé par l'appelant.
    locked.facility = blood_request.facility
    return locked


def _close(blood_request, status):
    blood_request.status = status
    blood_request.closed_at = timezone.now()


@transaction.atomic
def update_request(blood_request, **changes):
    """Modifie une demande ouverte ; la clôture si le besoin est couvert."""
    blood_request = _locked_request(blood_request)
    if not blood_request.is_open:
        raise Conflict("Seule une demande ouverte peut être modifiée.")
    units_needed = changes.get('units_needed', blood_request.units_needed)
    if units_needed < blood_request.units_collected:
        raise Conflict(
            f"{blood_request.units_collected} poche(s) déjà collectée(s) : "
            f"le besoin ne peut pas être inférieur."
        )
    for field, value in changes.items():
        setattr(blood_request, field, value)
    event = notifications.REQUEST_UPDATED
    if blood_request.units_remaining == 0:
        _close(blood_request, Status.FULFILLED)
        event = notifications.REQUEST_CLOSED
    blood_request.save()
    notifications.notify_request(blood_request, event)
    return blood_request


@transaction.atomic
def cancel_request(blood_request):
    blood_request = _locked_request(blood_request)
    if not blood_request.is_open:
        raise Conflict("Cette demande est déjà clôturée.")
    _close(blood_request, Status.CANCELLED)
    blood_request.save(update_fields=['status', 'closed_at', 'updated_at'])
    notifications.notify_request(blood_request, notifications.REQUEST_CLOSED)
    logger.info("Demande de sang %s annulée", blood_request.pk)
    return blood_request


# =============================================================
# RÉPONSES DES DONNEURS
# =============================================================


@transaction.atomic
def respond(donor, blood_request, status, *, today=None):
    """Enregistre la réponse d'un donneur (accepter, décliner, se désister)."""
    if status not in DonorResponse.DONOR_STATUSES:
        raise ValueError(f"Statut de réponse invalide : {status!r}.")
    blood_request = _locked_request(blood_request)
    if not blood_request.is_open:
        raise Conflict("Cette demande est clôturée.")
    if not can_donate(donor.blood_group, blood_request.blood_group):
        raise Conflict("Votre groupe sanguin n'est pas compatible avec cette demande.")

    response = (
        DonorResponse.objects.select_for_update()
        .filter(blood_request=blood_request, donor=donor)
        .first()
    )
    if response is not None and response.status in DonorResponse.FINAL_STATUSES:
        raise Conflict("Votre participation à cette demande est déjà clôturée.")
    if status == ResponseStatus.CANCELLED and (
        response is None or response.status != ResponseStatus.ACCEPTED
    ):
        raise Conflict("Seul un engagement accepté peut être annulé.")
    if status == ResponseStatus.ACCEPTED:
        reasons = donor.ineligibility_reasons(today)
        if reasons:
            raise Conflict(" ".join(reasons))

    if response is None:
        response = DonorResponse.objects.create(
            blood_request=blood_request, donor=donor, status=status
        )
    else:
        response.status = status
        response.save(update_fields=['status', 'updated_at'])
    response.blood_request = blood_request
    notifications.notify_response(response)
    return response


def _locked_response(blood_request, response_id):
    try:
        return (
            DonorResponse.objects.select_for_update()
            .select_related('donor')
            .get(pk=response_id, blood_request=blood_request)
        )
    except DonorResponse.DoesNotExist:
        return None


@transaction.atomic
def confirm_donation(blood_request, response_id, *, recorded_by, donated_on=None):
    """Confirme le don d'un donneur engagé : historique, stock collecté, clôture."""
    blood_request = _locked_request(blood_request)
    response = _locked_response(blood_request, response_id)
    if response is None:
        return None
    if not blood_request.is_open:
        raise Conflict("Cette demande est clôturée.")
    if response.status != ResponseStatus.ACCEPTED:
        raise Conflict("Seul un donneur ayant accepté peut voir son don confirmé.")

    donated_on = donated_on or timezone.localdate()
    donation = Donation.objects.create(
        donor=response.donor,
        facility=blood_request.facility,
        donated_on=donated_on,
        blood_request=blood_request,
        response=response,
        recorded_by=recorded_by,
    )
    response.status = ResponseStatus.DONATED
    response.save(update_fields=['status', 'updated_at'])
    response.donor.record_donation_date(donated_on)

    blood_request.units_collected += 1
    event = notifications.REQUEST_UPDATED
    if blood_request.units_remaining == 0:
        _close(blood_request, Status.FULFILLED)
        event = notifications.REQUEST_CLOSED
    blood_request.save()

    response.blood_request = blood_request
    notifications.notify_response(response)
    notifications.notify_request(blood_request, event)
    logger.info(
        "Don confirmé : demande=%s donneur=%s (%d/%d)",
        blood_request.pk,
        response.donor_id,
        blood_request.units_collected,
        blood_request.units_needed,
    )
    return donation


@transaction.atomic
def mark_no_show(blood_request, response_id):
    """Signale qu'un donneur engagé ne s'est pas présenté."""
    blood_request = _locked_request(blood_request)
    response = _locked_response(blood_request, response_id)
    if response is None:
        return None
    if response.status != ResponseStatus.ACCEPTED:
        raise Conflict("Seul un donneur ayant accepté peut être signalé absent.")
    response.status = ResponseStatus.NO_SHOW
    response.save(update_fields=['status', 'updated_at'])
    response.blood_request = blood_request
    notifications.notify_response(response)
    return response


# =============================================================
# DONS SPONTANÉS
# =============================================================


@transaction.atomic
def record_donation(*, donor, facility, donated_on, recorded_by):
    """Enregistre un don hors demande (don spontané au centre de transfusion)."""
    donation = Donation.objects.create(
        donor=donor,
        facility=facility,
        donated_on=donated_on,
        recorded_by=recorded_by,
    )
    donor.record_donation_date(donated_on)
    logger.info("Don enregistré : donneur=%s établissement=%s", donor.pk, facility.pk)
    return donation
