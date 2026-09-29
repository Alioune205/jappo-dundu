"""
API REST de l'application Users.

- POST  /api/users/register/        inscription publique d'un citoyen (donneur)
- GET   /api/users/me/              compte connecté ; PATCH pour le modifier
- POST  /api/users/me/password/     changement de mot de passe
- /api/users/                       gestion des comptes (admin)
- /api/facilities/                  établissements de santé

Auteur : Ibrahima Khalilou Diallo
"""

import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from geo.search import nearest
from geo.serializers import parse_nearby_query
from ml.constants import REGION_CODES
from security.authentication import JappoDunduTokenObtainPairSerializer
from security.permissions import IsAdmin
from security.roles import Role

from .filters import boolean_param, choice_param, int_param
from .models import HealthFacility
from .permissions import is_admin
from .serializers import (
    AccountSerializer,
    HealthFacilitySerializer,
    NearbyFacilitySerializer,
    PasswordChangeSerializer,
    RegisterSerializer,
    UserAdminSerializer,
)

logger = logging.getLogger('jappo_dundu.users')

User = get_user_model()

ROLE_CODES = tuple(role.value for role in Role)
FACILITY_TYPE_CODES = tuple(HealthFacility.FacilityType.values)


def token_pair(user):
    """Paire access/refresh avec les mêmes claims que POST /api/auth/token/."""
    refresh = JappoDunduTokenObtainPairSerializer.get_token(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class RegistrationThrottle(AnonRateThrottle):
    """Anti-abus : 20 inscriptions par heure et par adresse IP."""

    scope = 'register'
    rate = '20/hour'


class RegisterView(generics.CreateAPIView):
    """Inscription d'un citoyen donneur ; renvoie aussi ses tokens.

    POST /api/users/register/
    {"username", "password", "first_name", "last_name", "phone_number",
     "region", "email" (facultatif)}
    """

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    # Un token invalide envoyé par erreur ne doit pas bloquer l'inscription.
    authentication_classes = []

    def get_throttles(self):
        return [*super().get_throttles(), RegistrationThrottle()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {**token_pair(user), 'user': AccountSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class AccountView(generics.RetrieveUpdateAPIView):
    """Compte de l'utilisateur connecté.

    GET   /api/users/me/
    PATCH /api/users/me/  {"first_name", "last_name", "email", "phone_number", "region"}
    """

    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    """Change le mot de passe et ferme les autres sessions.

    POST /api/users/me/password/  {"current_password", "new_password"}
    Tous les refresh tokens existants sont révoqués ; une nouvelle paire
    est renvoyée pour la session courante.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        logger.info("Mot de passe modifié : user=%s", user.pk)
        return Response(
            {
                'detail': "Mot de passe modifié. Les autres sessions sont fermées.",
                **token_pair(user),
            },
            status=status.HTTP_200_OK,
        )


class UserAdminViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Gestion des comptes (administrateurs uniquement).

    GET   /api/users/   ?role=hospital_staff &facility=3 &region=dakar
                        &is_active=true &search=diallo
    POST  /api/users/   création d'un compte avec son rôle
    GET   /api/users/<id>/
    PATCH /api/users/<id>/  (rôle, établissement, activation, mot de passe...)

    Pas de suppression : désactiver le compte (``is_active: false``)
    conserve l'historique et révoque ses sessions.
    """

    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'

    def get_queryset(self):
        params = self.request.query_params
        queryset = (
            User.objects.select_related('profile__facility')
            .prefetch_related('groups')
            .order_by('username')
        )

        role = choice_param(params, 'role', ROLE_CODES)
        if role == Role.ADMIN:
            queryset = queryset.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif role:
            queryset = queryset.filter(groups__name=role)
        facility = int_param(params, 'facility')
        if facility is not None:
            queryset = queryset.filter(profile__facility_id=facility)
        region = choice_param(params, 'region', REGION_CODES)
        if region:
            queryset = queryset.filter(profile__region=region)
        is_active = boolean_param(params, 'is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(profile__phone_number__icontains=search)
            )
        return queryset.distinct()


class HealthFacilityViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Établissements de santé.

    GET   /api/facilities/  ?region=dakar &facility_type=hospital &search=fann
                            &is_active=false (admin)
    GET   /api/facilities/nearest/ ?latitude=&longitude= &radius_km=50 &limit=10
                                   &facility_type=hospital
    POST  /api/facilities/          (admin)
    PATCH /api/facilities/<id>/     (admin ; ``is_active: false`` pour retirer)

    Lecture ouverte à tout utilisateur connecté (cartes web et mobile).
    """

    serializer_class = HealthFacilitySerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    lookup_value_regex = r'\d+'
    default_radius_km = 50.0

    def get_permissions(self):
        if self.action in ('create', 'partial_update', 'update'):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        params = self.request.query_params
        queryset = HealthFacility.objects.all()

        # Seul l'admin voit (et peut filtrer) les établissements désactivés ;
        # une recherche de proximité ne porte que sur les actifs par défaut.
        if is_admin(self.request.user):
            default = True if self.action == 'nearest' else None
            is_active = boolean_param(params, 'is_active', default=default)
            if is_active is not None:
                queryset = queryset.filter(is_active=is_active)
        else:
            queryset = queryset.filter(is_active=True)

        region = choice_param(params, 'region', REGION_CODES)
        if region:
            queryset = queryset.filter(region=region)
        facility_type = choice_param(params, 'facility_type', FACILITY_TYPE_CODES)
        if facility_type:
            queryset = queryset.filter(facility_type=facility_type)
        search = params.get('search', '').strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(city__icontains=search))
        return queryset.order_by('name')

    @action(detail=False, methods=['get'])
    def nearest(self, request):
        query = parse_nearby_query(request.query_params, default_radius_km=self.default_radius_km)
        facilities = nearest(
            self.get_queryset(),
            query['point'],
            radius_m=query['radius_m'],
            limit=query['limit'],
        )
        return Response(NearbyFacilitySerializer(facilities, many=True).data)
