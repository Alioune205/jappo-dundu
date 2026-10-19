"""
API REST de l'application Lits.

- GET   /api/lits/capacities/                  capacités (filtres ci-dessous)
- POST  /api/lits/capacities/                  déclarer un service
- PATCH /api/lits/capacities/<id>/             lits installés / occupés
- POST  /api/lits/capacities/<id>/admit/       un lit occupé de plus (409 si plein)
- POST  /api/lits/capacities/<id>/discharge/   un lit libéré
- GET   /api/lits/capacities/summary/          synthèse par région et service
- GET   /api/lits/capacities/nearest/          établissements proches avec lits libres

- GET   /api/lits/reservations/                réservations (?status=active &facility= &mission=)
- POST  /api/lits/reservations/                réserver un lit {capacity_id | facility_id + category,
                                               mission_id?, reference?, notes?, hold_minutes?}
- POST  /api/lits/reservations/<id>/fulfill/   patient arrivé : le lit réservé devient occupé
- POST  /api/lits/reservations/<id>/cancel/    libérer le lit {reason?}

Lecture : admin, personnel hospitalier et ambulanciers (orientation des
patients). Écriture : admin, ou personnel de l'établissement concerné.

Auteur : Ibrahima Khalilou Diallo
"""

from django.db.models import F, Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ambulances.models import Mission
from ambulances.views import MissionViewSet, is_dispatcher, service_of

from geo.serializers import parse_nearby_query
from ml.constants import REGION_CODES, REGION_LABELS
from security.permissions import role_permission
from security.roles import DOMAIN_ROLES, Domain, Role, manages
from users.filters import boolean_param, choice_param, int_param
from users.permissions import facility_for_write, facility_permission, in_scope, is_admin, scope_to_facility

from . import services
from .models import BedCapacity, BedReservation
from .serializers import (
    BedCapacitySerializer,
    BedReservationCreateSerializer,
    BedReservationSerializer,
    NearbyBedFacilitySerializer,
)

CATEGORY_CODES = tuple(BedCapacity.Category.values)
CATEGORY_LABELS = dict(BedCapacity.Category.choices)

# Lecture : administrateurs des lits, et régulation / ambulanciers qui orientent
# les patients vers les lits libres. Écriture : administrateurs des lits seulement.
CanViewBeds = role_permission(
    *DOMAIN_ROLES[Domain.BEDS],
    Role.AMBULANCE_MANAGER,
    Role.AMBULANCE_DRIVER,
    message="Accès réservé aux administrateurs des lits et à la régulation.",
)
CanManageBeds = facility_permission(Domain.BEDS)


class BedCapacityViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Capacités en lits.

    GET /api/lits/capacities/ ?region=dakar &category=intensive_care
                              &facility=3 &available=true
    """

    serializer_class = BedCapacitySerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'
    default_radius_km = 50.0

    READ_ACTIONS = ('list', 'retrieve', 'summary', 'nearest')

    def get_permissions(self):
        if self.action in self.READ_ACTIONS:
            return [CanViewBeds()]
        return [CanManageBeds()]

    def get_queryset(self):
        queryset = BedCapacity.objects.select_related('facility', 'updated_by').filter(
            facility__is_active=True
        )
        if self.action not in ('list', 'summary'):
            return queryset
        params = self.request.query_params
        region = choice_param(params, 'region', REGION_CODES)
        if region:
            queryset = queryset.filter(facility__region=region)
        category = choice_param(params, 'category', CATEGORY_CODES)
        if category:
            queryset = queryset.filter(category=category)
        facility = int_param(params, 'facility')
        if facility is not None:
            queryset = queryset.filter(facility_id=facility)
        available = boolean_param(params, 'available')
        if available is True:
            queryset = queryset.filter(occupied_beds__lt=F('total_beds') - F('reserved_beds'))
        elif available is False:
            queryset = queryset.filter(occupied_beds__gte=F('total_beds') - F('reserved_beds'))
        return queryset.order_by('facility__name', 'category')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        facility = facility_for_write(request.user, data.pop('facility', None), domain=Domain.BEDS)
        capacity = services.create_capacity(facility=facility, updated_by=request.user, **data)
        return Response(self.get_serializer(capacity).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        capacity = self.get_object()
        serializer = self.get_serializer(capacity, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        capacity = services.update_capacity(
            capacity, updated_by=request.user, **serializer.validated_data
        )
        return Response(self.get_serializer(capacity).data)

    @action(detail=True, methods=['post'])
    def admit(self, request, pk=None):
        capacity = services.admit(self.get_object(), updated_by=request.user)
        return Response(self.get_serializer(capacity).data)

    @action(detail=True, methods=['post'])
    def discharge(self, request, pk=None):
        capacity = services.discharge(self.get_object(), updated_by=request.user)
        return Response(self.get_serializer(capacity).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Synthèse par région et service (tableau de bord).

        GET /api/lits/capacities/summary/ ?region=dakar &category=emergency
        """
        rows = (
            self.get_queryset()
            .order_by()
            .values('facility__region', 'category')
            .annotate(total=Sum('total_beds'), occupied=Sum('occupied_beds'), reserved=Sum('reserved_beds'))
            .order_by('facility__region', 'category')
        )
        return Response(
            [
                {
                    'region': row['facility__region'],
                    'region_display': REGION_LABELS.get(
                        row['facility__region'], row['facility__region']
                    ),
                    'category': row['category'],
                    'category_display': CATEGORY_LABELS[row['category']],
                    'total_beds': row['total'],
                    'occupied_beds': row['occupied'],
                    'reserved_beds': row['reserved'],
                    'available_beds': row['total'] - row['occupied'] - row['reserved'],
                    'occupancy_rate': round(row['occupied'] / row['total'], 4)
                    if row['total']
                    else None,
                }
                for row in rows
            ]
        )

    @action(detail=False, methods=['get'])
    def nearest(self, request):
        """Établissements les plus proches avec des lits libres.

        GET /api/lits/capacities/nearest/ ?latitude=&longitude= &category=emergency
            &radius_km=50 &limit=10 &min_available=1
        """
        params = request.query_params
        query = parse_nearby_query(params, default_radius_km=self.default_radius_km)
        facilities = services.find_facilities_with_beds(
            query['point'],
            category=choice_param(params, 'category', CATEGORY_CODES)
            or BedCapacity.Category.EMERGENCY,
            radius_m=query['radius_m'],
            limit=query['limit'],
            min_available=int_param(params, 'min_available', default=1, maximum=500),
        )
        return Response(NearbyBedFacilitySerializer(facilities, many=True).data)


# =============================================================
# RÉSERVATIONS
# =============================================================

# Réservent : les administrateurs des lits (leur établissement) et la régulation
# (sa région) ; l'administrateur général partout.
CanReserveBeds = role_permission(
    *DOMAIN_ROLES[Domain.BEDS],
    *DOMAIN_ROLES[Domain.AMBULANCES],
    message="Réservation de lits réservée aux administrateurs des lits et à la régulation.",
)


def _dispatch_region(user):
    """Région de régulation d'un régulateur limité ; None sinon."""
    if not is_dispatcher(user) or is_admin(user):
        return None
    service = service_of(user)
    return service.region if service is not None else None


def can_reserve_at(user, facility):
    if is_admin(user):
        return True
    if manages(user, Domain.BEDS) and in_scope(user, Domain.BEDS, facility):
        return True
    region = _dispatch_region(user)
    return region is not None and facility.region == region


def can_fulfill(user, reservation):
    """Admettre le patient : l'hôpital qui l'accueille (ou l'administrateur général)."""
    return is_admin(user) or (
        manages(user, Domain.BEDS) and in_scope(user, Domain.BEDS, reservation.capacity.facility)
    )


def can_cancel(user, reservation):
    return (
        reservation.created_by_id == user.pk
        or can_fulfill(user, reservation)
        or can_reserve_at(user, reservation.capacity.facility)
    )


class BedReservationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Réservations de lits (voir l'en-tête du module)."""

    serializer_class = BedReservationSerializer
    permission_classes = [CanReserveBeds]
    lookup_value_regex = r'\d+'

    def get_queryset(self):
        services.release_expired()
        user = self.request.user
        base = BedReservation.objects.select_related(
            'capacity__facility', 'mission', 'created_by', 'closed_by'
        )
        if is_admin(user):
            queryset = base
        else:
            queryset = base.none()
            if manages(user, Domain.BEDS):
                queryset = queryset | scope_to_facility(base, user, Domain.BEDS, field='capacity__facility')
            region = _dispatch_region(user)
            if region is not None:
                queryset = queryset | base.filter(capacity__facility__region=region)
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        filters = {
            'status': choice_param(params, 'status', BedReservation.Status.values),
            'capacity__facility_id': int_param(params, 'facility'),
            'mission_id': int_param(params, 'mission'),
        }
        return queryset.filter(**{k: v for k, v in filters.items() if v is not None}).order_by(
            'status', 'expires_at'
        )

    def create(self, request, *args, **kwargs):
        serializer = BedReservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        capacity = data['capacity']
        if not can_reserve_at(request.user, capacity.facility):
            raise PermissionDenied("Vous ne pouvez pas réserver de lit dans cet établissement.")
        mission = data.get('mission')
        if mission is not None:
            visible = Mission.objects.filter(MissionViewSet._visible_missions(request.user), pk=mission.pk)
            if not visible.exists():
                raise PermissionDenied("Cette mission ne relève pas de votre périmètre.")
        reservation = services.reserve(
            capacity,
            created_by=request.user,
            mission=mission,
            reference=data['reference'],
            notes=data['notes'],
            hold_minutes=data['hold_minutes'],
        )
        return Response(
            self.get_serializer(self.get_queryset().get(pk=reservation.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def fulfill(self, request, pk=None):
        reservation = self.get_object()
        if not can_fulfill(request.user, reservation):
            raise PermissionDenied("Seul l'établissement qui accueille le patient enregistre son admission.")
        services.fulfill_reservation(reservation, closed_by=request.user)
        return Response(self.get_serializer(reservation).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        if not can_cancel(request.user, reservation):
            raise PermissionDenied("Vous ne pouvez pas annuler cette réservation.")
        reason = str(request.data.get('reason', '') if isinstance(request.data, dict) else '')[:200]
        services.cancel_reservation(reservation, closed_by=request.user, reason=reason)
        return Response(self.get_serializer(reservation).data)
