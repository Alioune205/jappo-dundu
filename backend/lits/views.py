"""
API REST de l'application Lits.

- GET   /api/lits/capacities/                  capacités (filtres ci-dessous)
- POST  /api/lits/capacities/                  déclarer un service
- PATCH /api/lits/capacities/<id>/             lits installés / occupés
- POST  /api/lits/capacities/<id>/admit/       un lit occupé de plus (409 si plein)
- POST  /api/lits/capacities/<id>/discharge/   un lit libéré
- GET   /api/lits/capacities/summary/          synthèse par région et service
- GET   /api/lits/capacities/nearest/          établissements proches avec lits libres

Lecture : admin, personnel hospitalier et ambulanciers (orientation des
patients). Écriture : admin, ou personnel de l'établissement concerné.

Auteur : Ibrahima Khalilou Diallo
"""

from django.db.models import F, Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from geo.serializers import parse_nearby_query
from ml.constants import REGION_CODES, REGION_LABELS
from security.permissions import role_permission
from security.roles import Role
from users.filters import boolean_param, choice_param, int_param
from users.permissions import IsFacilityStaffOrAdmin, facility_for_write

from . import services
from .models import BedCapacity
from .serializers import BedCapacitySerializer, NearbyBedFacilitySerializer

CATEGORY_CODES = tuple(BedCapacity.Category.values)
CATEGORY_LABELS = dict(BedCapacity.Category.choices)

CanViewBeds = role_permission(
    Role.ADMIN,
    Role.HOSPITAL_STAFF,
    Role.AMBULANCE_DRIVER,
    message="Accès réservé au personnel de santé et aux ambulanciers.",
)


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
        return [IsFacilityStaffOrAdmin()]

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
            queryset = queryset.filter(occupied_beds__lt=F('total_beds'))
        elif available is False:
            queryset = queryset.filter(occupied_beds__gte=F('total_beds'))
        return queryset.order_by('facility__name', 'category')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        facility = facility_for_write(request.user, data.pop('facility', None))
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
            .annotate(total=Sum('total_beds'), occupied=Sum('occupied_beds'))
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
                    'available_beds': row['total'] - row['occupied'],
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
