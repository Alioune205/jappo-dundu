"""
API REST de l'application Ambulances.

Flotte (/api/ambulances/vehicles/) :
- GET   /                    liste (régulation : son service ; ambulancier : son véhicule)
- POST  /  ; PATCH /<id>/    administration de la flotte (admin, administrateur des ambulances)
- GET   /nearest/            ambulances disponibles les plus proches (régulation)
- GET   /mine/               ambulance du conducteur connecté
- GET   /drivers/            ambulanciers affectables (administration de la flotte)
- POST  /<id>/position/      position GPS (conducteur de l'ambulance ou admin)
- POST  /<id>/availability/  en service / hors service (conducteur, administrateur
                             des ambulances de son service, admin)

Missions (/api/ambulances/missions/) :
- GET   /  ; POST /  ; PATCH /<id>/   régulation (admin : national ; administrateur
                                       des ambulances et personnel hospitalier : leur région) ;
                                       un conducteur voit les missions de son ambulance
- POST  /<id>/assign/        affecter une ambulance (la plus proche par défaut)
- POST  /<id>/status/        on_site, transporting, completed (conducteur de
                             l'ambulance affectée ou régulation), cancelled (régulation)
- GET   /<id>/destinations/  établissements proches avec lits libres
- GET   /stats/              indicateurs (délais d'intervention, flotte)

Alerte SOS (/api/ambulances/sos/), tout compte connecté (application mobile) :
- POST  /                    envoyer sa position et la nature de l'urgence
- GET   /                    suivre sa dernière alerte
- POST  /<id>/cancel/        la retirer tant qu'aucune ambulance n'est partie

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from geo.distance import GeoPoint
from geo.serializers import parse_nearby_query
from lits.models import BedCapacity
from lits.serializers import NearbyBedFacilitySerializer
from lits.services import find_facilities_with_beds
from ml.constants import REGION_CODES
from security.permissions import ManagesAmbulances, role_permission
from security.roles import DOMAIN_ROLES, Domain, Role, manages, user_has_role
from users.models import HealthFacility
from users.permissions import user_facility
from users.services import user_facility_id
from users.filters import boolean_param, capabilities_param, choice_param, int_param

from . import services, triage
from .models import Ambulance, EmergencyProfile, Mission
from .serializers import (
    AmbulanceSerializer,
    AssignSerializer,
    AvailabilitySerializer,
    BilanSerializer,
    CitizenSosSerializer,
    DestinationAnswerSerializer,
    TransferSerializer,
    EmergencyProfileSerializer,
    MissionSerializer,
    MissionStatusSerializer,
    NearbyAmbulanceSerializer,
    PositionSerializer,
    SosInputSerializer,
)

CanViewFleet = role_permission(
    *DOMAIN_ROLES[Domain.AMBULANCES],
    Role.AMBULANCE_DRIVER,
    message="Accès réservé à la régulation et aux ambulanciers.",
)
# Missions : en plus, l'administrateur des lits consulte celles dirigées vers
# son établissement (préparer l'accueil du patient).
CanViewMissions = role_permission(
    *DOMAIN_ROLES[Domain.AMBULANCES],
    Role.AMBULANCE_DRIVER,
    Role.BED_MANAGER,
    message="Accès réservé à la régulation, aux ambulanciers et aux hôpitaux de destination.",
)
CanEditFleet = role_permission(
    Role.ADMIN,
    Role.AMBULANCE_MANAGER,
    message="Gestion de la flotte réservée à l'administrateur des ambulances.",
)

# Étapes qu'un conducteur peut déclarer lui-même.
DRIVER_STATUSES = frozenset(
    {
        Mission.Status.ON_SITE,
        Mission.Status.TRANSPORTING,
        Mission.Status.COMPLETED,
    }
)


def is_dispatcher(user):
    return manages(user, Domain.AMBULANCES)


# Régulateurs limités à leur établissement (véhicules) et à sa région (missions).
# Le rôle historique ``hospital_staff`` régule comme un administrateur des
# ambulances, mais n'a plus de périmètre national.
SCOPED_DISPATCHER_ROLES = (Role.AMBULANCE_MANAGER, Role.HOSPITAL_STAFF)


def national_dispatcher(user):
    """Régulation nationale : administrateur général uniquement."""
    return user_has_role(user, Role.ADMIN)


def is_driver_only(user):
    """Ambulancier sans rôle de régulation : limité à son propre véhicule."""
    return user_has_role(user, Role.AMBULANCE_DRIVER) and not is_dispatcher(user)


def service_of(user):
    """Établissement d'un régulateur limité à son périmètre.

    None : périmètre national (ou utilisateur sans rôle de régulation).
    Un régulateur sans établissement est refusé.
    """
    if national_dispatcher(user) or not user_has_role(user, *SCOPED_DISPATCHER_ROLES):
        return None
    facility = user_facility(user)
    if facility is None:
        raise PermissionDenied("Votre compte n'est rattaché à aucun service d'ambulances.")
    return facility


class IsAmbulanceDriverOrAdmin(BasePermission):
    """Admin, ou conducteur affecté à l'ambulance."""

    message = "Action réservée au conducteur de cette ambulance."

    def has_permission(self, request, view):
        return user_has_role(request.user, Role.ADMIN, Role.AMBULANCE_DRIVER)

    def has_object_permission(self, request, view, obj):
        return user_has_role(request.user, Role.ADMIN) or obj.driver_id == request.user.pk


class CanSetAvailability(BasePermission):
    """Conducteur de l'ambulance, administrateur des ambulances de son service, ou admin."""

    message = "Seuls le conducteur et la régulation du service de cette ambulance changent sa disponibilité."

    def has_permission(self, request, view):
        return user_has_role(request.user, Role.ADMIN, Role.AMBULANCE_DRIVER, Role.AMBULANCE_MANAGER)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user_has_role(user, Role.ADMIN) or obj.driver_id == user.pk:
            return True
        return user_has_role(user, Role.AMBULANCE_MANAGER) and user_facility_id(user) == obj.facility_id


class AmbulanceViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Flotte d'ambulances.

    GET /api/ambulances/vehicles/ ?status=available &ambulance_type=medicalized
                                  &region=dakar &facility=3
    """

    serializer_class = AmbulanceSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'
    default_radius_km = 50.0

    def get_permissions(self):
        if self.action in ('create', 'partial_update', 'drivers'):
            return [CanEditFleet()]
        if self.action == 'nearest':
            return [ManagesAmbulances()]
        if self.action == 'availability':
            return [CanSetAvailability()]
        if self.action in ('position', 'mine'):
            return [IsAmbulanceDriverOrAdmin()]
        return [CanViewFleet()]

    def get_queryset(self):
        queryset = Ambulance.objects.select_related('facility', 'driver')
        # position / availability / mine : contrôle par objet (conducteur affecté).
        driver_actions = self.action in ('position', 'availability', 'mine')
        service = service_of(self.request.user) if not driver_actions else None
        if service is not None:
            # Régulateur limité : uniquement les véhicules de son service.
            queryset = queryset.filter(facility=service)
        elif not driver_actions and is_driver_only(self.request.user):
            # Ambulancier : son véhicule seulement (pas l'annuaire de la flotte).
            queryset = queryset.filter(driver=self.request.user)
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        filters = {
            'status': choice_param(params, 'status', Ambulance.Status.values),
            'ambulance_type': choice_param(
                params, 'ambulance_type', Ambulance.AmbulanceType.values
            ),
            'facility__region': choice_param(params, 'region', REGION_CODES),
            'facility_id': int_param(params, 'facility'),
        }
        return queryset.filter(
            **{key: value for key, value in filters.items() if value is not None}
        ).order_by('plate_number')

    def _check_service(self, serializer):
        service = service_of(self.request.user)
        facility = serializer.validated_data.get('facility')
        if service is not None and facility is not None and facility.pk != service.pk:
            raise PermissionDenied("Vous ne gérez que les véhicules de votre service.")
        driver = serializer.validated_data.get('driver')
        if service is not None and driver is not None and user_facility_id(driver) != service.pk:
            raise PermissionDenied("Vous n'affectez que les ambulanciers de votre service.")
        return service

    def perform_create(self, serializer):
        service = self._check_service(serializer)
        if service is not None and 'facility' not in serializer.validated_data:
            serializer.save(facility=service)
        else:
            serializer.save()

    def perform_update(self, serializer):
        self._check_service(serializer)
        serializer.save()

    @action(detail=False, methods=['get'])
    def nearest(self, request):
        """GET /api/ambulances/vehicles/nearest/ ?latitude=&longitude= &radius_km=50
        &limit=10 &ambulance_type=medicalized

        Triées par durée de trajet jusqu'au point (``travel_minutes``).
        """
        params = request.query_params
        query = parse_nearby_query(params, default_radius_km=self.default_radius_km)
        ambulances = services.find_nearest_available(
            query['point'],
            radius_m=query['radius_m'],
            limit=query['limit'],
            ambulance_type=choice_param(params, 'ambulance_type', Ambulance.AmbulanceType.values),
            facility=service_of(request.user),
        )
        # Les plus rapides par la route d'abord (durée réelle ou estimée).
        ambulances = services.rank_by_travel_time(ambulances, query['point'])
        return Response(NearbyAmbulanceSerializer(ambulances, many=True).data)

    @action(detail=False, methods=['get'])
    def drivers(self, request):
        """GET /api/ambulances/vehicles/drivers/ : comptes ambulanciers actifs
        (régulation limitée : ceux de son service), avec leur véhicule actuel."""
        drivers = (
            get_user_model()
            .objects.filter(is_active=True, groups__name=Role.AMBULANCE_DRIVER)
            .select_related('profile', 'ambulance')
            .order_by('last_name', 'first_name', 'username')
        )
        service = service_of(request.user)
        if service is not None:
            drivers = drivers.filter(profile__facility=service)
        return Response([
            {
                'id': driver.pk,
                'full_name': driver.get_full_name() or driver.get_username(),
                'phone_number': getattr(getattr(driver, 'profile', None), 'phone_number', None),
                'ambulance': None
                if getattr(driver, 'ambulance', None) is None
                else {'id': driver.ambulance.pk, 'plate_number': driver.ambulance.plate_number},
            }
            for driver in drivers
        ])

    @action(detail=False, methods=['get'])
    def mine(self, request):
        ambulance = self.get_queryset().filter(driver=request.user).first()
        if ambulance is None:
            raise NotFound("Aucune ambulance ne vous est affectée.")
        return Response(self.get_serializer(ambulance).data)

    @action(detail=True, methods=['post'])
    def position(self, request, pk=None):
        """POST /api/ambulances/vehicles/<id>/position/ {"latitude", "longitude"}"""
        ambulance = self.get_object()
        serializer = PositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        point = GeoPoint(**serializer.validated_data)
        return Response(self.get_serializer(services.update_position(ambulance, point)).data)

    @action(detail=True, methods=['post'])
    def availability(self, request, pk=None):
        """POST /api/ambulances/vehicles/<id>/availability/
        {"status": "available" | "out_of_service"}"""
        ambulance = self.get_object()
        serializer = AvailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ambulance = services.set_availability(ambulance, serializer.validated_data['status'])
        return Response(self.get_serializer(ambulance).data)


class MissionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Missions d'urgence.

    GET  /api/ambulances/missions/ ?status=pending &active=true &priority=critical
                                   &region=dakar &ambulance=4
    POST /api/ambulances/missions/ {"priority", "description", "pickup_address",
          "pickup_latitude", "pickup_longitude", "region", "caller_phone",
          "destination_id"}
    """

    serializer_class = MissionSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'

    DISPATCH_ACTIONS = ('create', 'partial_update', 'assign', 'stats')

    def get_permissions(self):
        if self.action in self.DISPATCH_ACTIONS:
            return [ManagesAmbulances()]
        return [CanViewMissions()]

    def get_queryset(self):
        queryset = Mission.objects.select_related(
            'ambulance__facility', 'ambulance__driver', 'destination', 'created_by'
        )
        queryset = queryset.filter(self._visible_missions(self.request.user))
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        filters = {
            'status': choice_param(params, 'status', Mission.Status.values),
            'priority': choice_param(params, 'priority', Mission.Priority.values),
            'region': choice_param(params, 'region', REGION_CODES),
            'ambulance_id': int_param(params, 'ambulance'),
        }
        queryset = queryset.filter(
            **{key: value for key, value in filters.items() if value is not None}
        )
        active = boolean_param(params, 'active')
        if active is True:
            queryset = queryset.exclude(status__in=Mission.FINAL_STATUSES)
        elif active is False:
            queryset = queryset.filter(status__in=Mission.FINAL_STATUSES)
        return queryset.order_by('-created_at')

    @staticmethod
    def _visible_missions(user):
        """Missions visibles, selon les rôles cumulés de l'utilisateur."""
        if national_dispatcher(user):
            return Q()
        visible = Q(pk__in=[])
        facility = user_facility(user)
        if facility is not None and user_has_role(user, *SCOPED_DISPATCHER_ROLES):
            visible |= Q(region=facility.region)
        if facility is not None and user_has_role(user, Role.BED_MANAGER):
            # Patients attendus, et transferts demandés par l'établissement.
            visible |= Q(destination_id=facility.pk) | Q(origin_facility_id=facility.pk)
        if user_has_role(user, Role.AMBULANCE_DRIVER):
            # Un conducteur ne voit que les missions de son ambulance.
            visible |= Q(ambulance__driver=user)
        return visible

    def _reloaded(self, mission):
        return self.get_queryset().get(pk=mission.pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = service_of(request.user)
        if service is not None and serializer.validated_data.get('region') != service.region:
            raise PermissionDenied("Vous ne régulez que les missions de votre région.")
        mission = services.create_mission(created_by=request.user, **serializer.validated_data)
        return Response(
            self.get_serializer(self._reloaded(mission)).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        mission = self.get_object()
        serializer = self.get_serializer(mission, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        mission = services.update_mission(mission, **serializer.validated_data)
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """POST /api/ambulances/missions/<id>/assign/
        {} (la plus proche) | {"ambulance_type": "medicalized", "radius_km": 80}
        | {"ambulance_id": 4}"""
        mission = self.get_object()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = service_of(request.user)
        chosen = serializer.validated_data.get('ambulance')
        if service is not None and chosen is not None and chosen.facility_id != service.pk:
            raise PermissionDenied("Vous n'affectez que les véhicules de votre service.")
        mission = services.assign(mission, facility=service, **serializer.validated_data)
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=True, methods=['post'], url_path='status')
    def change_status(self, request, pk=None):
        """POST /api/ambulances/missions/<id>/status/
        {"status": "on_site" | "transporting" | "completed" | "cancelled",
         "destination_id" (facultatif), "cancellation_reason" (annulation)}"""
        mission = self.get_object()
        serializer = MissionStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data['status']
        if not is_dispatcher(request.user):
            # Hors régulation, seul le conducteur de l'ambulance affectée fait
            # avancer la mission (un hôpital de destination ne fait que la suivre).
            ambulance = mission.ambulance
            if ambulance is None or ambulance.driver_id != request.user.pk:
                raise PermissionDenied("Seul le conducteur de l'ambulance affectée peut faire avancer la mission.")
            if new_status not in DRIVER_STATUSES:
                raise PermissionDenied("L'annulation d'une mission relève de la régulation.")
        mission = services.advance(
            mission,
            new_status,
            destination=serializer.validated_data.get('destination'),
            cancellation_reason=serializer.validated_data.get('cancellation_reason', ''),
        )
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=False, methods=['post'])
    def transfer(self, request):
        """Transfert vers un autre établissement, demandé par l'hôpital de départ.

        POST /api/ambulances/missions/transfer/ {"destination_id", "category",
             "priority", "description", "origin_id" (admin)}
        Crée la mission (lieu : l'établissement de départ) et réserve un lit à
        l'arrivée ; la régulation affecte ensuite l'ambulance.
        """
        serializer = TransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        requested_origin = data.pop('origin', None)
        if user_has_role(request.user, Role.ADMIN):
            if requested_origin is None:
                raise ValidationError({'origin_id': ["Obligatoire pour un administrateur."]})
            origin = requested_origin
        else:
            origin = user_facility(request.user)
            if origin is None or not user_has_role(request.user, Role.BED_MANAGER, Role.HOSPITAL_STAFF):
                raise PermissionDenied("Seul le personnel d'un établissement demande un transfert.")
            origin = HealthFacility.objects.get(pk=origin.pk)
        mission = services.create_transfer(origin=origin, created_by=request.user, **data)
        return Response(self.get_serializer(self._reloaded(mission)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='destination-response')
    def destination_response(self, request, pk=None):
        """Pré-alerte : l'hôpital de destination accepte ou refuse le patient.

        POST /api/ambulances/missions/<id>/destination-response/
        {"accepted": true} | {"accepted": false, "note": "scanner en panne"}
        Réservé au personnel (lits) de l'établissement de destination et à l'admin.
        """
        mission = self.get_object()
        facility = user_facility(request.user)
        receives = (
            facility is not None
            and facility.pk == mission.destination_id
            and user_has_role(request.user, Role.BED_MANAGER, Role.HOSPITAL_STAFF)
        )
        if not (user_has_role(request.user, Role.ADMIN) or receives):
            raise PermissionDenied("Seul l'hôpital de destination répond à la pré-alerte.")
        serializer = DestinationAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mission = services.answer_destination(mission, user=request.user, **serializer.validated_data)
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=True, methods=['post'])
    def bilan(self, request, pk=None):
        """Bilan de l'équipage : POST /api/ambulances/missions/<id>/bilan/ {"vitals": {...}, "notes"}

        Conducteur de l'ambulance affectée ou régulation.
        """
        mission = self.get_object()
        ambulance = mission.ambulance
        is_crew = ambulance is not None and ambulance.driver_id == request.user.pk
        if not (is_crew or is_dispatcher(request.user)):
            raise PermissionDenied("Seul l'équipage ou la régulation transmet le bilan.")
        serializer = BilanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mission = services.update_bilan(
            mission,
            vitals=serializer.validated_data.get('vitals'),
            notes=serializer.validated_data.get('notes'),
        )
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=True, methods=['get'])
    def destinations(self, request, pk=None):
        """Établissements proches ayant des lits libres, depuis l'ambulance
        (position connue) ou le lieu d'intervention.

        GET /api/ambulances/missions/<id>/destinations/ ?category=emergency
            &radius_km=50 &limit=5 &capability=ct_scan,trauma
        """
        mission = self.get_object()
        ambulance = mission.ambulance
        if ambulance is not None and mission.is_active and ambulance.latitude is not None:
            origin = GeoPoint(ambulance.latitude, ambulance.longitude)
        else:
            origin = GeoPoint(mission.pickup_latitude, mission.pickup_longitude)
        params = request.query_params
        category = (
            choice_param(params, 'category', BedCapacity.Category.values)
            or BedCapacity.Category.EMERGENCY
        )
        facilities = find_facilities_with_beds(
            origin,
            category=category,
            radius_m=int_param(params, 'radius_km', default=50, maximum=500) * 1000,
            limit=int_param(params, 'limit', default=5, maximum=50),
            capabilities=capabilities_param(params),
        )
        return Response(
            {
                'origin': {'latitude': origin.latitude, 'longitude': origin.longitude},
                'category': category,
                'results': NearbyBedFacilitySerializer(facilities, many=True).data,
            }
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """GET /api/ambulances/missions/stats/ ?days=30 &region=dakar"""
        params = request.query_params
        days = int_param(params, 'days', default=30, maximum=365)
        missions = Mission.objects.all()
        ambulances = Ambulance.objects.all()
        service = service_of(request.user)
        if service is not None:
            missions = missions.filter(region=service.region)
            ambulances = ambulances.filter(facility=service)
        region = choice_param(params, 'region', REGION_CODES)
        if region:
            missions = missions.filter(region=region)
            ambulances = ambulances.filter(facility__region=region)
        return Response(services.mission_statistics(missions, ambulances, days=days))


# Alerte terminée encore montrée au citoyen (« ambulance arrivée », « retirée »).
SOS_RECENT = timedelta(hours=6)


class SosView(APIView):
    """Alerte SOS du citoyen connecté (application mobile)."""

    permission_classes = [IsAuthenticated]
    throttle_scope = 'sos'

    def get_throttles(self):
        # Seul l'envoi est plafonné : le suivi se relit toutes les quelques secondes.
        return [ScopedRateThrottle()] if self.request.method == 'POST' else super().get_throttles()

    def get(self, request):
        mission = services.active_sos(request.user) or (
            Mission.objects.filter(
                created_by=request.user,
                source=Mission.Source.SOS,
                created_at__gte=timezone.now() - SOS_RECENT,
            )
            .order_by('-created_at')
            .first()
        )
        if mission is None:
            raise NotFound("Aucune alerte SOS récente.")
        return Response(CitizenSosSerializer(mission).data)

    def post(self, request):
        serializer = SosInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        mission, created = services.create_sos(
            request.user,
            GeoPoint(data['latitude'], data['longitude']),
            kind=data['kind'],
            landmark=data['landmark'],
        )
        return Response(
            CitizenSosSerializer(mission).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class EmergencyProfileView(APIView):
    """Fiche d'urgence du citoyen connecté.

    GET /api/ambulances/sos/profile/   (fiche vide si jamais remplie)
    PUT /api/ambulances/sos/profile/   {"share_with_samu", "allergies", "conditions",
                                        "medications", "contacts": [{"name", "phone", "relation"}],
                                        "notify_contacts"}
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = EmergencyProfile.objects.filter(user=request.user).first() or EmergencyProfile(user=request.user)
        return Response(EmergencyProfileSerializer(profile).data)

    def put(self, request):
        profile, _ = EmergencyProfile.objects.get_or_create(user=request.user)
        serializer = EmergencyProfileSerializer(profile, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SosCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        mission = get_object_or_404(
            Mission.objects.select_related('ambulance'),
            pk=pk,
            created_by=request.user,
            source=Mission.Source.SOS,
        )
        return Response(CitizenSosSerializer(services.cancel_sos(mission)).data)


class TriageView(APIView):
    """Tri de l'appel : questions, consignes et priorité suggérée (source unique web et mobile).

    GET  /api/ambulances/triage/                      questions et consignes
    POST /api/ambulances/triage/ {"answers": {...}}   priorité suggérée et consignes
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(triage.protocol())

    def post(self, request):
        return Response(triage.assess(request.data.get('answers') or {}))
