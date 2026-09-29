"""
API REST de l'application Ambulances.

Flotte (/api/ambulances/vehicles/) :
- GET   /                    liste (admin, personnel hospitalier, ambulanciers)
- POST  /  ; PATCH /<id>/    administration de la flotte (admin)
- GET   /nearest/            ambulances disponibles les plus proches (régulation)
- GET   /mine/               ambulance du conducteur connecté
- POST  /<id>/position/      position GPS (conducteur de l'ambulance ou admin)
- POST  /<id>/availability/  en service / hors service (conducteur ou admin)

Missions (/api/ambulances/missions/) :
- GET   /  ; POST /  ; PATCH /<id>/   régulation (admin, personnel hospitalier) ;
                                       un conducteur voit les missions de son ambulance
- POST  /<id>/assign/        affecter une ambulance (la plus proche par défaut)
- POST  /<id>/status/        on_site, transporting, completed (conducteur ou
                             régulation), cancelled (régulation)
- GET   /<id>/destinations/  établissements proches avec lits libres
- GET   /stats/              indicateurs (délais d'intervention, flotte)

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from geo.distance import GeoPoint
from geo.serializers import parse_nearby_query
from lits.models import BedCapacity
from lits.serializers import NearbyBedFacilitySerializer
from lits.services import find_facilities_with_beds
from ml.constants import REGION_CODES
from security.permissions import IsAdmin, IsAdminOrHospitalStaff, role_permission
from security.roles import Role, user_has_role
from users.filters import boolean_param, choice_param, int_param

from . import services
from .models import Ambulance, Mission
from .serializers import (
    AmbulanceSerializer,
    AssignSerializer,
    AvailabilitySerializer,
    MissionSerializer,
    MissionStatusSerializer,
    NearbyAmbulanceSerializer,
    PositionSerializer,
)

CanViewFleet = role_permission(
    Role.ADMIN,
    Role.HOSPITAL_STAFF,
    Role.AMBULANCE_DRIVER,
    message="Accès réservé à la régulation et aux ambulanciers.",
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
    return user_has_role(user, Role.ADMIN, Role.HOSPITAL_STAFF)


class IsAmbulanceDriverOrAdmin(BasePermission):
    """Admin, ou conducteur affecté à l'ambulance."""

    message = "Action réservée au conducteur de cette ambulance."

    def has_permission(self, request, view):
        return user_has_role(request.user, Role.ADMIN, Role.AMBULANCE_DRIVER)

    def has_object_permission(self, request, view, obj):
        return user_has_role(request.user, Role.ADMIN) or obj.driver_id == request.user.pk


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
        if self.action in ('create', 'partial_update'):
            return [IsAdmin()]
        if self.action == 'nearest':
            return [IsAdminOrHospitalStaff()]
        if self.action in ('position', 'availability', 'mine'):
            return [IsAmbulanceDriverOrAdmin()]
        return [CanViewFleet()]

    def get_queryset(self):
        queryset = Ambulance.objects.select_related('facility', 'driver')
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

    @action(detail=False, methods=['get'])
    def nearest(self, request):
        """GET /api/ambulances/vehicles/nearest/ ?latitude=&longitude= &radius_km=50
        &limit=10 &ambulance_type=medicalized"""
        params = request.query_params
        query = parse_nearby_query(params, default_radius_km=self.default_radius_km)
        ambulances = services.find_nearest_available(
            query['point'],
            radius_m=query['radius_m'],
            limit=query['limit'],
            ambulance_type=choice_param(params, 'ambulance_type', Ambulance.AmbulanceType.values),
        )
        return Response(NearbyAmbulanceSerializer(ambulances, many=True).data)

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
            return [IsAdminOrHospitalStaff()]
        return [CanViewFleet()]

    def get_queryset(self):
        queryset = Mission.objects.select_related(
            'ambulance__facility', 'ambulance__driver', 'destination', 'created_by'
        )
        if not is_dispatcher(self.request.user):
            # Un conducteur ne voit que les missions de son ambulance.
            queryset = queryset.filter(ambulance__driver=self.request.user)
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

    def _reloaded(self, mission):
        return self.get_queryset().get(pk=mission.pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
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
        mission = services.assign(mission, **serializer.validated_data)
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
        if not is_dispatcher(request.user) and new_status not in DRIVER_STATUSES:
            raise PermissionDenied("L'annulation d'une mission relève de la régulation.")
        mission = services.advance(
            mission,
            new_status,
            destination=serializer.validated_data.get('destination'),
            cancellation_reason=serializer.validated_data.get('cancellation_reason', ''),
        )
        return Response(self.get_serializer(self._reloaded(mission)).data)

    @action(detail=True, methods=['get'])
    def destinations(self, request, pk=None):
        """Établissements proches ayant des lits libres, depuis l'ambulance
        (position connue) ou le lieu d'intervention.

        GET /api/ambulances/missions/<id>/destinations/ ?category=emergency
            &radius_km=50 &limit=5
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
        region = choice_param(params, 'region', REGION_CODES)
        if region:
            missions = missions.filter(region=region)
            ambulances = ambulances.filter(facility__region=region)
        return Response(services.mission_statistics(missions, ambulances, days=days))
