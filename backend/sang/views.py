"""
API REST de l'application Sang.

Donneur (application mobile) :
- GET/PUT/PATCH /api/sang/donors/me/            profil donneur
- GET  /api/sang/donors/me/donations/           historique des dons
- GET  /api/sang/donors/me/responses/           historique des réponses
- GET  /api/sang/requests/nearby/               demandes compatibles proches
- POST /api/sang/requests/<id>/respond/         accepter / décliner / se désister

Établissement (personnel hospitalier, admin) :
- /api/sang/requests/                           demandes de son établissement
- POST /api/sang/requests/<id>/cancel/
- GET  /api/sang/requests/<id>/matches/         donneurs compatibles proches (anonymes)
- GET  /api/sang/requests/<id>/responses/
- POST /api/sang/requests/<id>/responses/<rid>/confirm/   don effectué
- POST /api/sang/requests/<id>/responses/<rid>/no-show/   donneur absent
- GET  /api/sang/donors/lookup/?phone_number=   retrouver un donneur
- /api/sang/donations/                          dons enregistrés

Référentiel : GET /api/sang/compatibility/

Auteur : Ibrahima Khalilou Diallo
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from geo.distance import GeoPoint
from ml.constants import BLOOD_GROUP_CODES, REGION_CODES
from security.permissions import IsAdminOrHospitalStaff
from security.roles import Role
from users.exceptions import Conflict
from users.filters import choice_param, int_param
from users.permissions import (
    IsFacilityStaffOrAdmin,
    facility_for_write,
    is_admin,
    scope_to_facility,
)
from users.services import add_role
from users.validators import normalize_phone_number

from . import services
from .compatibility import compatible_donor_groups, compatible_recipient_groups
from .models import BloodRequest, Donation, Donor, DonorResponse
from .serializers import (
    BloodRequestSerializer,
    DonationSerializer,
    DonorLookupSerializer,
    DonorMatchSerializer,
    DonorResponseSerializer,
    DonorSerializer,
    MyDonationSerializer,
    MyResponseSerializer,
    NearbyBloodRequestSerializer,
    NearbyRequestsQuerySerializer,
    RespondSerializer,
)

NO_DONOR_PROFILE = "Aucun profil donneur : créez-le avec PUT /api/sang/donors/me/."
MAX_MATCHES = 100


def current_donor(user):
    """Profil donneur de l'utilisateur ; 404 explicite s'il n'existe pas."""
    donor = Donor.objects.select_related('user').filter(user=user).first()
    if donor is None:
        raise NotFound(NO_DONOR_PROFILE)
    return donor


# =============================================================
# DONNEUR
# =============================================================


class DonorProfileView(APIView):
    """Profil donneur de l'utilisateur connecté.

    GET   /api/sang/donors/me/
    PUT   /api/sang/donors/me/  création ou remplacement :
          {"blood_group", "sex", "date_of_birth", "is_available",
           "latitude", "longitude", "last_donation_date"}
    PATCH /api/sang/donors/me/  mise à jour partielle (ex. position, disponibilité)

    Créer son profil donneur attribue le rôle ``donor``.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(DonorSerializer(current_donor(request.user)).data)

    def put(self, request):
        donor = Donor.objects.select_related('user').filter(user=request.user).first()
        serializer = DonorSerializer(donor, data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save(user=request.user)
            if donor is None:
                add_role(request.user, Role.DONOR)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if donor is None else status.HTTP_200_OK,
        )

    def patch(self, request):
        serializer = DonorSerializer(current_donor(request.user), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MyDonationsView(generics.ListAPIView):
    """GET /api/sang/donors/me/donations/ — dons du donneur connecté."""

    serializer_class = MyDonationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        donor = current_donor(self.request.user)
        return donor.donations.select_related('facility').order_by('-donated_on', '-id')


class MyResponsesView(generics.ListAPIView):
    """GET /api/sang/donors/me/responses/ — réponses du donneur connecté."""

    serializer_class = MyResponseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        donor = current_donor(self.request.user)
        return donor.responses.select_related('blood_request__facility').order_by('-created_at')


class DonorLookupView(APIView):
    """Retrouve un donneur par son téléphone (enregistrement d'un don).

    GET /api/sang/donors/lookup/?phone_number=77 123 45 67
    Recherche exacte uniquement : l'annuaire des donneurs n'est pas consultable.
    """

    permission_classes = [IsAdminOrHospitalStaff]

    def get(self, request):
        raw = request.query_params.get('phone_number', '')
        try:
            phone_number = normalize_phone_number(raw)
        except DjangoValidationError as exc:
            raise ValidationError({'phone_number': list(exc.messages)}) from exc
        donor = (
            Donor.objects.select_related('user')
            .filter(user__profile__phone_number=phone_number)
            .first()
        )
        if donor is None:
            raise NotFound("Aucun donneur inscrit avec ce numéro.")
        return Response(DonorLookupSerializer(donor).data)


class CompatibilityView(APIView):
    """GET /api/sang/compatibility/ — table de compatibilité des globules rouges."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            [
                {
                    'blood_group': group,
                    'can_receive_from': list(compatible_donor_groups(group)),
                    'can_donate_to': list(compatible_recipient_groups(group)),
                }
                for group in BLOOD_GROUP_CODES
            ]
        )


# =============================================================
# DEMANDES DE SANG
# =============================================================


class BloodRequestViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Demandes de sang.

    GET   /api/sang/requests/  ?status=open &blood_group=O- &urgency=critical
                               &region=dakar &facility=3 (admin)
    POST  /api/sang/requests/  {"blood_group", "units_needed", "urgency",
                                "notes", "needed_by", "search_radius_km",
                                "facility_id" (admin uniquement)}
    PATCH /api/sang/requests/<id>/  (demande ouverte : besoin, urgence, rayon...)

    Le personnel ne voit et ne gère que les demandes de son établissement.
    """

    serializer_class = BloodRequestSerializer
    permission_classes = [IsFacilityStaffOrAdmin]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'

    DONOR_ACTIONS = ('nearby', 'respond')

    def get_permissions(self):
        if self.action in self.DONOR_ACTIONS:
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        if self.action == 'respond':
            return BloodRequest.objects.select_related('facility')

        queryset = scope_to_facility(
            BloodRequest.objects.select_related('facility', 'created_by'),
            self.request.user,
        ).annotate(
            accepted_count=Count(
                'responses', filter=Q(responses__status=DonorResponse.Status.ACCEPTED)
            ),
            declined_count=Count(
                'responses', filter=Q(responses__status=DonorResponse.Status.DECLINED)
            ),
            donated_count=Count(
                'responses', filter=Q(responses__status=DonorResponse.Status.DONATED)
            ),
        )
        if self.action != 'list':
            return queryset

        params = self.request.query_params
        filters = {
            'status': choice_param(params, 'status', BloodRequest.Status.values),
            'blood_group': choice_param(params, 'blood_group', BLOOD_GROUP_CODES),
            'urgency': choice_param(params, 'urgency', BloodRequest.Urgency.values),
            'facility__region': choice_param(params, 'region', REGION_CODES),
            'facility_id': int_param(params, 'facility'),
        }
        return queryset.filter(
            **{key: value for key, value in filters.items() if value is not None}
        ).order_by('-created_at')

    def _reloaded(self, blood_request):
        return self.get_queryset().get(pk=blood_request.pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        facility = facility_for_write(request.user, data.pop('facility', None))
        blood_request = services.create_request(facility=facility, created_by=request.user, **data)
        return Response(
            self.get_serializer(self._reloaded(blood_request)).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        blood_request = self.get_object()
        serializer = self.get_serializer(blood_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        services.update_request(blood_request, **serializer.validated_data)
        return Response(self.get_serializer(self._reloaded(blood_request)).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        blood_request = services.cancel_request(self.get_object())
        return Response(self.get_serializer(self._reloaded(blood_request)).data)

    @action(detail=True, methods=['get'])
    def matches(self, request, pk=None):
        """Donneurs éligibles et compatibles les plus proches (anonymes).

        GET /api/sang/requests/<id>/matches/ ?limit=20 &radius_km=10
        Le rayon ne peut pas dépasser celui de la demande (à élargir par PATCH).
        """
        blood_request = self.get_object()
        if not blood_request.is_open:
            raise Conflict("Cette demande est clôturée.")
        params = request.query_params
        donors = services.find_matching_donors(
            blood_request,
            radius_km=int_param(params, 'radius_km', maximum=blood_request.search_radius_km),
            limit=int_param(params, 'limit', default=20, maximum=MAX_MATCHES),
        )
        serializer = DonorMatchSerializer(
            donors, many=True, context={'blood_request': blood_request}
        )
        return Response(
            {
                'request_id': blood_request.pk,
                'search_radius_km': blood_request.search_radius_km,
                'count': len(donors),
                'results': serializer.data,
            }
        )

    @action(detail=True, methods=['get'])
    def responses(self, request, pk=None):
        """GET /api/sang/requests/<id>/responses/ ?status=accepted"""
        blood_request = self.get_object()
        queryset = blood_request.responses.select_related('donor__user__profile')
        response_status = choice_param(request.query_params, 'status', DonorResponse.Status.values)
        if response_status:
            queryset = queryset.filter(status=response_status)
        page = self.paginate_queryset(queryset.order_by('-created_at'))
        return self.get_paginated_response(DonorResponseSerializer(page, many=True).data)

    @action(
        detail=True,
        methods=['post'],
        url_path=r'responses/(?P<response_id>\d+)/confirm',
        url_name='confirm-donation',
    )
    def confirm_donation(self, request, pk=None, response_id=None):
        """Confirme le don d'un donneur engagé ; clôt la demande si le besoin est couvert."""
        donation = services.confirm_donation(
            self.get_object(), int(response_id), recorded_by=request.user
        )
        if donation is None:
            raise NotFound("Réponse introuvable pour cette demande.")
        return Response(DonationSerializer(donation).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=['post'],
        url_path=r'responses/(?P<response_id>\d+)/no-show',
        url_name='no-show',
    )
    def no_show(self, request, pk=None, response_id=None):
        response = services.mark_no_show(self.get_object(), int(response_id))
        if response is None:
            raise NotFound("Réponse introuvable pour cette demande.")
        return Response(DonorResponseSerializer(response).data)

    @action(detail=False, methods=['get'])
    def nearby(self, request):
        """Demandes ouvertes compatibles avec le donneur connecté, les plus proches d'abord.

        GET /api/sang/requests/nearby/ ?latitude=&longitude= (position du
        téléphone ; sinon celle du profil) &radius_km=200 &limit=20
        """
        donor = current_donor(request.user)
        query = NearbyRequestsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        if 'latitude' in params:
            point = GeoPoint(params['latitude'], params['longitude'])
        elif donor.has_location:
            point = GeoPoint(donor.latitude, donor.longitude)
        else:
            raise ValidationError(
                "Position inconnue : renseignez latitude et longitude, "
                "ou enregistrez votre position dans votre profil donneur."
            )
        blood_requests = services.find_nearby_requests(
            donor, point, radius_km=params['radius_km'], limit=params['limit']
        )
        my_responses = dict(
            donor.responses.filter(blood_request__in=blood_requests).values_list(
                'blood_request_id', 'status'
            )
        )
        serializer = NearbyBloodRequestSerializer(
            blood_requests, many=True, context={'my_responses': my_responses}
        )
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """POST /api/sang/requests/<id>/respond/
        {"status": "accepted" | "declined" | "cancelled"}"""
        donor = current_donor(request.user)
        serializer = RespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        response = services.respond(donor, self.get_object(), serializer.validated_data['status'])
        return Response(MyResponseSerializer(response).data)


# =============================================================
# DONS
# =============================================================


class DonationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Dons enregistrés par l'établissement.

    GET  /api/sang/donations/ ?donor=12 &facility=3 (admin)
    POST /api/sang/donations/ {"donor_id", "donated_on" (défaut : aujourd'hui),
                               "facility_id" (admin uniquement)}
    """

    serializer_class = DonationSerializer
    permission_classes = [IsFacilityStaffOrAdmin]
    lookup_value_regex = r'\d+'

    def get_queryset(self):
        queryset = scope_to_facility(
            Donation.objects.select_related('donor__user', 'facility', 'recorded_by'),
            self.request.user,
        )
        params = self.request.query_params
        donor = int_param(params, 'donor')
        if donor is not None:
            queryset = queryset.filter(donor_id=donor)
        facility = int_param(params, 'facility')
        if facility is not None and is_admin(self.request.user):
            queryset = queryset.filter(facility_id=facility)
        return queryset.order_by('-donated_on', '-id')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        facility = facility_for_write(request.user, data.get('facility'))
        if not facility.is_active:
            raise Conflict("Cet établissement est désactivé.")
        donation = services.record_donation(
            donor=data['donor'],
            facility=facility,
            donated_on=data.get('donated_on') or timezone.localdate(),
            recorded_by=request.user,
        )
        return Response(self.get_serializer(donation).data, status=status.HTTP_201_CREATED)
