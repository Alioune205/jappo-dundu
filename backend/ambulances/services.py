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
from geo.routing import travel_time, travel_times_to
from geo.search import nearest
from lits.services import close_mission_reservation
from push.services import (
    notify_destination_refused,
    notify_mission_assigned,
    notify_mission_cancelled,
    notify_sos_assigned,
)
from realtime import escalation
from realtime.broadcast import broadcast_alert, broadcast_dashboard
from realtime.models import CriticalAlert
from users.exceptions import Conflict
from users.models import HealthFacility

from .models import Ambulance, Mission
from .triage import SOS_ANSWERS

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
        'source': mission.source,
        # Ni constantes ni observations dans le flux (il atteint aussi les
        # citoyens) : les écrans autorisés relisent la mission par l'API.
        'destination_status': mission.destination_status,
        'eta_at': mission.eta_at.isoformat() if mission.eta_at else None,
        'bilan_updated_at': mission.bilan_updated_at.isoformat() if mission.bilan_updated_at else None,
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


SHIFT_CHECK_HOURS = 12


def readiness_of(ambulance, now=None):
    """État de préparation : vérifiée depuis moins de 12 h et sans défaut."""
    check = ambulance.checks.order_by('-checked_at').first()
    if check is None:
        return {'ready': False, 'checked_at': None, 'issues': ["Pas de vérification de garde"]}
    stale = (now or timezone.now()) - check.checked_at > timedelta(hours=SHIFT_CHECK_HOURS)
    issues = [*check.issues, *(["Vérification de plus de 12 h"] if stale else [])]
    return {'ready': not issues, 'checked_at': check.checked_at, 'issues': issues}


def record_check(ambulance, *, checked_by, **data):
    from .models import ShiftCheck

    check = ShiftCheck.objects.create(ambulance=ambulance, checked_by=checked_by, **data)
    notify_ambulance(ambulance, AMBULANCE_STATUS)
    return check


def rank_by_travel_time(ambulances, point):
    """Trie des ambulances par durée de trajet jusqu'au point (chacune porte ``travel``).

    Les plus proches à vol d'oiseau ne sont pas toujours les plus rapides par
    la route : on les départage par la durée réelle (ou estimée).
    """
    ambulances = list(ambulances)
    times = travel_times_to(point, [(a.latitude, a.longitude) for a in ambulances])
    for ambulance, travel in zip(ambulances, times, strict=True):
        ambulance.travel = travel
        ambulance.readiness = readiness_of(ambulance)
    # Les ambulances prêtes d'abord (vérifiées, sans défaut), puis la plus rapide.
    return sorted(ambulances, key=lambda a: (not a.readiness['ready'], a.travel.minutes))


# Une estimation recalculée au plus une fois par minute au fil des positions.
ETA_REFRESH_SECONDS = 60


def target_of(mission):
    """Point vers lequel roule l'ambulance : l'hôpital pendant le transport, sinon le lieu."""
    if mission.status == MissionStatus.TRANSPORTING and mission.destination is not None:
        return (mission.destination.latitude, mission.destination.longitude)
    if mission.status == MissionStatus.ASSIGNED:
        return (mission.pickup_latitude, mission.pickup_longitude)
    return None


def refresh_eta(mission, *, force=False, now=None):
    """Recalcule l'heure d'arrivée estimée ; efface-la quand l'ambulance n'est plus en route.

    Retourne True si l'estimation a changé (à enregistrer par l'appelant).
    """
    now = now or timezone.now()
    target = target_of(mission)
    ambulance = mission.ambulance
    if target is None or ambulance is None or ambulance.latitude is None:
        if mission.eta_at is None:
            return False
        mission.eta_at = mission.eta_updated_at = None
        mission.eta_source = ''
        return True
    if (
        not force
        and mission.eta_updated_at is not None
        and (now - mission.eta_updated_at).total_seconds() < ETA_REFRESH_SECONDS
    ):
        return False
    travel = travel_time(GeoPoint(ambulance.latitude, ambulance.longitude), *target)
    mission.eta_at = now + timedelta(minutes=travel.minutes)
    mission.eta_source = travel.source
    mission.eta_updated_at = now
    return True


ETA_FIELDS = ['eta_at', 'eta_source', 'eta_updated_at']


def find_nearest_available(point, *, radius_m, limit, ambulance_type=None, facility=None):
    """Ambulances disponibles les plus proches (chacune porte ``distance_m``).

    ``facility`` : limite la recherche aux véhicules de ce service.
    """
    queryset = Ambulance.objects.filter(
        status=AmbulanceStatus.AVAILABLE,
        facility__is_active=True,
    ).select_related('facility', 'driver')
    if ambulance_type:
        queryset = queryset.filter(ambulance_type=ambulance_type)
    if facility is not None:
        queryset = queryset.filter(facility=facility)
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
        # Arrivée estimée de la mission en cours, au fil des positions.
        mission = (
            Mission.objects.filter(ambulance=ambulance, status__in=(MissionStatus.ASSIGNED, MissionStatus.TRANSPORTING))
            .select_related('destination')
            .first()
        )
        if mission is not None:
            mission.ambulance = ambulance
            if refresh_eta(mission):
                mission.save(update_fields=[*ETA_FIELDS, 'updated_at'])
                notify_mission(mission, MISSION_UPDATED)
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


def _regulation_of(region):
    """Service d'ambulances de la région (sa ligne de garde reçoit les relances)."""
    return (
        HealthFacility.objects.filter(
            region=region, is_active=True, facility_type=HealthFacility.FacilityType.AMBULANCE_SERVICE
        )
        .order_by('pk')
        .first()
    )


def raise_mission_alert(mission):
    """Mission critique ou SOS : la régulation doit la prendre en charge (relance sinon)."""
    if mission.priority != Mission.Priority.CRITICAL and mission.source != Mission.Source.SOS:
        return
    label = "Alerte SOS" if mission.source == Mission.Source.SOS else "Mission critique"
    escalation.raise_alert(
        CriticalAlert.Kind.MISSION,
        mission,
        title=f"{label} n° {mission.pk}",
        message=f"Région {mission.get_region_display()} : aucune ambulance affectée.",
        facility=_regulation_of(mission.region),
        region=mission.region,
    )


def sync_prealert_alert(mission):
    """Pré-alerte en attente : l'hôpital de destination doit répondre (relance sinon)."""
    if mission.is_final or mission.destination_status != Mission.DestinationStatus.PENDING:
        escalation.resolve(CriticalAlert.Kind.PREALERT, mission)
        return
    escalation.raise_alert(
        CriticalAlert.Kind.PREALERT,
        mission,
        title=f"Patient annoncé (mission n° {mission.pk})",
        message=f"{mission.destination.name} : accepter ou refuser le patient.",
        facility=mission.destination,
        region=mission.destination.region,
    )


def create_mission(*, created_by, **data):
    with transaction.atomic():
        mission = Mission.objects.create(created_by=created_by, **data)
        notify_mission(mission, MISSION_CREATED)
        raise_mission_alert(mission)
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
def assign(
    mission, *, ambulance=None, ambulance_type=None, radius_km=DEFAULT_DISPATCH_RADIUS_KM, facility=None
):
    """Affecte une ambulance : celle indiquée, ou la plus proche disponible.

    ``facility`` : recherche automatique limitée aux véhicules de ce service.
    """
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
            facility=facility,
        )
        ranked = rank_by_travel_time(
            candidates, GeoPoint(mission.pickup_latitude, mission.pickup_longitude)
        )
        chosen = next((candidate for candidate in ranked if _claim(candidate)), None)
        if chosen is None:
            raise Conflict(f"Aucune ambulance disponible à moins de {radius_km:g} km.")

    chosen.status = AmbulanceStatus.ON_MISSION
    mission.ambulance = chosen
    mission.status = MissionStatus.ASSIGNED
    mission.assigned_at = timezone.now()
    refresh_eta(mission, force=True)
    mission.save(update_fields=['ambulance', 'status', 'assigned_at', *ETA_FIELDS, 'updated_at'])
    escalation.resolve(CriticalAlert.Kind.MISSION, mission)
    notify_mission(mission, MISSION_UPDATED)
    notify_ambulance(chosen, AMBULANCE_STATUS)
    # L'ambulancier est prévenu même application fermée ; le citoyen d'une
    # alerte SOS apprend qu'une ambulance arrive.
    transaction.on_commit(lambda: notify_mission_assigned(mission))
    if mission.source == Mission.Source.SOS:
        transaction.on_commit(lambda: notify_sos_assigned(mission))
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
    refresh_eta(mission, force=True)
    mission.save()

    if mission.is_final:
        # Lit réservé à l'hôpital de destination : occupé si le patient est remis,
        # libéré si la mission est annulée.
        close_mission_reservation(mission)
        escalation.resolve(CriticalAlert.Kind.MISSION, mission)
    if mission.destination_id:
        sync_prealert_alert(mission)
    if mission.is_final and mission.ambulance_id:
        Ambulance.objects.filter(
            pk=mission.ambulance_id, status=AmbulanceStatus.ON_MISSION
        ).update(status=AmbulanceStatus.AVAILABLE, updated_at=timezone.now())
        mission.ambulance.refresh_from_db(fields=['status', 'updated_at'])
        notify_ambulance(mission.ambulance, AMBULANCE_STATUS)
    notify_mission(mission, MISSION_UPDATED)
    if status == MissionStatus.CANCELLED:
        transaction.on_commit(lambda: notify_mission_cancelled(mission))
    logger.info("Mission %s : %s", mission.pk, status)
    return mission


# =============================================================
# ALERTE SOS (citoyen)
# =============================================================

SOS_KINDS = {
    'accident': "Accident",
    'malaise': "Malaise ou perte de connaissance",
    'breathing': "Difficulté à respirer",
    'childbirth': "Accouchement",
    'other': "Autre urgence",
}
# Rayon de recherche de l'établissement qui fixe la région de l'alerte.
SOS_REGION_RADIUS_M = 300_000


def region_at(point, default=None):
    """Région de l'établissement actif le plus proche du point (sinon ``default``)."""
    closest = nearest(
        HealthFacility.objects.filter(is_active=True), point, radius_m=SOS_REGION_RADIUS_M, limit=1
    )
    return closest[0].region if closest else default


LOCATION_LINK_MINUTES = 30


def send_location_link(mission, *, phone_number, created_by, base_url):
    """Envoie par SMS un lien qui fait remonter la position GPS de l'appelant."""
    import secrets

    from identity.sms import send_sms

    from .models import LocationLink

    if mission.is_final:
        raise Conflict("Cette mission est clôturée.")
    link = LocationLink.objects.create(
        token=secrets.token_urlsafe(32),
        mission=mission,
        phone_number=phone_number,
        created_by=created_by,
        expires_at=timezone.now() + timedelta(minutes=LOCATION_LINK_MINUTES),
    )
    url = f"{base_url.rstrip('/')}/localiser/{link.token}"
    transaction.on_commit(
        lambda: send_sms(
            phone_number,
            f"SAMU / Jappo Dundu : touchez ce lien pour envoyer votre position aux secours : {url}",
        )
    )
    return link


@transaction.atomic
def receive_location(token, point, *, accuracy_m=None):
    """Position transmise depuis le lien : met à jour le lieu d'une mission pas encore sur place."""
    from .models import LocationLink

    link = LocationLink.objects.select_for_update().select_related('mission').filter(token=token).first()
    if link is None or link.used_at is not None or link.expires_at < timezone.now():
        raise Conflict("Ce lien a expiré : rappelez le SAMU au 1515.")
    mission = _locked_mission(link.mission)
    if mission.status not in (MissionStatus.PENDING, MissionStatus.ASSIGNED):
        raise Conflict("Les secours sont déjà sur place.")
    mission.pickup_latitude = point.latitude
    mission.pickup_longitude = point.longitude
    refresh_eta(mission, force=True)
    mission.save(update_fields=['pickup_latitude', 'pickup_longitude', *ETA_FIELDS, 'updated_at'])
    link.used_at = timezone.now()
    link.accuracy_m = accuracy_m
    link.save(update_fields=['used_at', 'accuracy_m'])
    notify_mission(mission, MISSION_UPDATED)
    return mission


CALLER_CANCELLATION = "Alerte retirée par l'appelant"


def caller_history(user_id, days=30):
    """Alertes SOS d'un citoyen sur ``days`` jours : la régulation repère les fausses alertes répétées."""
    since = timezone.now() - timedelta(days=days)
    alerts = Mission.objects.filter(created_by_id=user_id, source=Mission.Source.SOS, created_at__gte=since)
    return {
        'days': days,
        'alerts': alerts.count(),
        'cancelled_by_regulation': alerts.filter(status=MissionStatus.CANCELLED)
        .exclude(cancellation_reason=CALLER_CANCELLATION)
        .count(),
    }


MAX_INCIDENT_AMBULANCES = 10


def create_incident(*, victims, ambulances, priority, description, pickup_address, pickup_latitude,
                    pickup_longitude, region, created_by, triage=None, caller_phone=''):
    """Plusieurs victimes : un incident, une mission par ambulance demandée, affectées aussitôt.

    Les ambulances sont affectées une par une (les plus rapides d'abord) ;
    celles qui manquent laissent leur mission en attente, visible par la
    régulation. Retourne l'incident.
    """
    from .models import Incident

    ambulances = max(1, min(ambulances, victims, MAX_INCIDENT_AMBULANCES))
    with transaction.atomic():
        incident = Incident.objects.create(
            description=description,
            victims=victims,
            region=region,
            pickup_address=pickup_address,
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            created_by=created_by,
        )
        missions = [
            create_mission(
                created_by=created_by,
                priority=priority,
                description=f"{description} — victime {index + 1}/{victims}",
                pickup_address=pickup_address,
                pickup_latitude=pickup_latitude,
                pickup_longitude=pickup_longitude,
                region=region,
                caller_phone=caller_phone,
                triage=triage or {},
                incident=incident,
            )
            for index in range(ambulances)
        ]
    for mission in missions:
        try:
            assign(mission)
        except Conflict:
            break  # plus d'ambulance disponible : les suivantes restent en attente
    logger.info("Incident %s : %d victimes, %d missions", incident.pk, victims, len(missions))
    return incident


@transaction.atomic
def create_transfer(*, origin, destination, category, priority, description, created_by):
    """Transfert d'un patient vers un autre établissement : mission + lit réservé à l'arrivée.

    La mission part de l'établissement d'origine (lieu d'intervention) vers la
    destination, déjà fixée ; la régulation n'a plus qu'à affecter
    l'ambulance. L'hôpital d'arrivée reçoit la pré-alerte (accepter, refuser).
    """
    from lits.models import BedCapacity
    from lits.services import reserve

    if origin.pk == destination.pk:
        raise Conflict("L'établissement d'arrivée doit être différent de celui de départ.")
    if not destination.is_active:
        raise Conflict("L'établissement de destination est désactivé.")
    capacity = BedCapacity.objects.filter(facility=destination, category=category).first()
    if capacity is None:
        raise Conflict("Ce service n'existe pas dans l'établissement de destination.")
    mission = Mission.objects.create(
        created_by=created_by,
        source=Mission.Source.TRANSFER,
        priority=priority,
        description=description or f"Transfert vers {destination.name}",
        pickup_address=origin.address or origin.name,
        pickup_latitude=origin.latitude,
        pickup_longitude=origin.longitude,
        region=origin.region,
        origin_facility=origin,
    )
    # Fixe aussi la destination (pré-alerte en attente) ; 409 sans lit libre.
    reserve(capacity, created_by=created_by, mission=mission, reference=f"Transfert depuis {origin.name}")
    mission.refresh_from_db()
    notify_mission(mission, MISSION_CREATED)
    logger.info("Transfert %s : %s → %s", mission.pk, origin.pk, destination.pk)
    return mission


def notify_emergency_contacts(mission):
    """SMS aux contacts d'urgence du citoyen, s'il l'a demandé (consentement explicite)."""
    from identity.sms import send_sms

    from .models import EmergencyProfile

    profile = EmergencyProfile.objects.filter(user_id=mission.created_by_id, notify_contacts=True).first()
    if profile is None or not profile.contacts:
        return 0
    name = mission.created_by.get_full_name() or mission.created_by.get_username()
    body = (
        f"Jappo Dundu : {name} a déclenché une alerte SOS ({mission.description.replace('SOS — ', '')}). "
        "Le SAMU est prévenu et le rappelle."
    )
    for contact in profile.contacts:
        send_sms(contact['phone'], body)
    return len(profile.contacts)


def active_sos(user):
    return (
        Mission.objects.filter(created_by=user, source=Mission.Source.SOS)
        .exclude(status__in=Mission.FINAL_STATUSES)
        .order_by('-created_at')
        .first()
    )


def create_sos(user, point, *, kind, landmark=''):
    """Alerte SOS envoyée depuis l'application : mission en attente, à qualifier.

    Un citoyen n'a qu'une alerte en cours : un second appui renvoie la même
    (un doigt qui insiste ne doit pas mobiliser deux ambulances). Retourne
    ``(mission, created)``.
    """
    with transaction.atomic():
        current = active_sos(user)
        if current is not None:
            return current, False
        profile = getattr(user, 'profile', None)
        region = region_at(point, default=getattr(profile, 'region', None))
        if region is None:
            raise Conflict("Position hors de la zone couverte : appelez le SAMU au 1515.")
        mission = Mission.objects.create(
            created_by=user,
            source=Mission.Source.SOS,
            priority=Mission.Priority.URGENT,
            description=f"SOS — {SOS_KINDS[kind]}",
            pickup_address=landmark.strip() or "Position GPS du téléphone",
            pickup_latitude=point.latitude,
            pickup_longitude=point.longitude,
            region=region,
            caller_phone=getattr(profile, 'phone_number', '') or '',
            triage=dict(SOS_ANSWERS.get(kind, {})),
        )
        notify_mission(mission, MISSION_CREATED)
        raise_mission_alert(mission)
        transaction.on_commit(lambda: notify_emergency_contacts(mission))
    logger.info("Alerte SOS %s (%s, %s)", mission.pk, kind, region)
    return mission, True


@transaction.atomic
def cancel_sos(mission):
    """Le citoyen retire son alerte tant qu'aucune ambulance n'est partie."""
    mission = _locked_mission(mission)
    if mission.status != MissionStatus.PENDING:
        raise Conflict("Une ambulance est déjà en route : appelez le SAMU au 1515 pour l'annuler.")
    return advance(mission, MissionStatus.CANCELLED, cancellation_reason=CALLER_CANCELLATION)


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
    if 'destination' in changes:
        refresh_eta(mission, force=True)
    mission.save()
    notify_mission(mission, MISSION_UPDATED)
    if 'destination' in changes and mission.destination_id:
        sync_prealert_alert(mission)
    return mission


@transaction.atomic
def answer_destination(mission, *, user, accepted, note=''):
    """Pré-alerte : l'hôpital de destination accepte ou refuse le patient.

    Un refus libère le lit réservé pour la mission et prévient l'équipage ; la
    régulation choisit une autre destination (qui repasse « en attente »).
    """
    from lits.models import BedReservation
    from lits.services import cancel_reservation

    mission = _locked_mission(mission)
    if mission.is_final:
        raise Conflict("Cette mission est clôturée.")
    if mission.destination_id is None:
        raise Conflict("Aucun établissement de destination n'est indiqué pour cette mission.")
    Status = Mission.DestinationStatus
    mission.destination_status = Status.ACCEPTED if accepted else Status.REFUSED
    mission.destination_note = note.strip()
    mission.destination_answered_at = timezone.now()
    mission.destination_answered_by = user
    mission.save(
        update_fields=[
            'destination_status',
            'destination_note',
            'destination_answered_at',
            'destination_answered_by',
            'updated_at',
        ]
    )
    escalation.resolve(CriticalAlert.Kind.PREALERT, mission, user=user)
    if not accepted:
        reservation = BedReservation.objects.filter(mission=mission, status=BedReservation.Status.ACTIVE).first()
        if reservation is not None:
            cancel_reservation(reservation, closed_by=user, reason=f"Refusé par l'hôpital : {mission.destination_note}")
        transaction.on_commit(lambda: notify_destination_refused(mission))
    notify_mission(mission, MISSION_UPDATED)
    logger.info("Mission %s : destination %s (%s)", mission.pk, mission.destination_status, mission.destination_id)
    return mission


@transaction.atomic
def update_bilan(mission, *, vitals=None, notes=None):
    """Bilan de l'équipage (constantes, observations), transmis à l'hôpital de destination."""
    mission = _locked_mission(mission)
    if mission.is_final:
        raise Conflict("Cette mission est clôturée.")
    if vitals is not None:
        mission.vitals = {**mission.vitals, **vitals}
    if notes is not None:
        mission.bilan_notes = notes.strip()
    mission.bilan_updated_at = timezone.now()
    mission.save(update_fields=['vitals', 'bilan_notes', 'bilan_updated_at', 'updated_at'])
    notify_mission(mission, MISSION_UPDATED)
    return mission


# =============================================================
# INDICATEURS
# =============================================================

# Maille des zones d'appels : 0,02° ≈ 2 km.
DEMAND_GRID_DEG = 0.02
MAX_DEMAND_MISSIONS = 20_000


def demand_profile(missions, *, top=5):
    """Où et quand les appels arrivent : par heure, par jour de la semaine, zones les plus actives.

    Sert au pré-positionnement : placer les ambulances disponibles près des
    zones chaudes de l'heure à venir.
    """
    by_hour = [0] * 24
    by_weekday = [0] * 7
    zones = {}
    rows = missions.order_by('-created_at').values_list('created_at', 'pickup_latitude', 'pickup_longitude')
    for created_at, latitude, longitude in rows[:MAX_DEMAND_MISSIONS]:
        local = timezone.localtime(created_at)
        by_hour[local.hour] += 1
        by_weekday[local.weekday()] += 1
        cell = (round(latitude / DEMAND_GRID_DEG), round(longitude / DEMAND_GRID_DEG))
        zone = zones.setdefault(cell, {'count': 0, 'hours': [0] * 24})
        zone['count'] += 1
        zone['hours'][local.hour] += 1
    hottest = sorted(zones.items(), key=lambda item: -item[1]['count'])[:top]
    return {
        'by_hour': by_hour,
        'by_weekday': by_weekday,
        'zones': [
            {
                'latitude': round(cell[0] * DEMAND_GRID_DEG, 4),
                'longitude': round(cell[1] * DEMAND_GRID_DEG, 4),
                'count': zone['count'],
                'peak_hour': max(range(24), key=lambda h: zone['hours'][h]),
            }
            for cell, zone in hottest
        ],
    }


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
