"""
Routes de récupération de compte et de connexion sociale (montées sous /api/auth/).

POST /api/auth/password-reset/          {"identifier"}                          → 202
POST /api/auth/password-reset/confirm/  {"identifier", "code", "new_password"}  → 200 + jetons
POST /api/auth/social/<google|facebook|apple>/
     google   : {"id_token"}
     apple    : {"identity_token", "first_name"?, "last_name"?}
     facebook : {"access_token"}                                               → 200 + jetons

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from users.views import token_pair

from . import services
from .social import SocialAuthError, verify

RESET_SENT = (
    "Si un compte correspond, un code à 6 chiffres vient d'être envoyé par SMS "
    "(et par e-mail s'il est renseigné). Il expire dans 15 minutes."
)


class ScopedView(APIView):
    """Vue publique avec limitation de débit dédiée (``throttle_scope``)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get_throttles(self):
        return [*super().get_throttles(), ScopedRateThrottle()]


class ResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)


class ResetConfirmSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    code = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class PasswordResetRequestView(ScopedView):
    """Demande d'un code. Réponse identique que le compte existe ou non."""

    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = ResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_reset(serializer.validated_data['identifier'])
        return Response({'detail': RESET_SENT}, status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(ScopedView):
    """Nouveau mot de passe avec le code reçu ; ouvre directement une session."""

    throttle_scope = 'password_reset_confirm'

    def post(self, request):
        serializer = ResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = services.confirm_reset(data['identifier'], data['code'], data['new_password'])
        except services.ResetError as exc:
            raise serializers.ValidationError({'code': [str(exc)]}) from exc
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc
        return Response({'detail': "Mot de passe modifié. Vous êtes connecté.", **token_pair(user)})


class SocialLoginView(ScopedView):
    """Connexion (ou inscription) par Google, Facebook ou Apple."""

    throttle_scope = 'login'

    def post(self, request, provider):
        try:
            identity = verify(provider, request.data if isinstance(request.data, dict) else {})
            user, created = services.social_login(identity)
        except SocialAuthError as exc:
            return Response({'detail': exc.message}, status=exc.status)
        return Response(
            {
                **token_pair(user),
                'created': created,
                # Téléphone et région manquent après une inscription sociale : l'application les demande.
                'profile_complete': services.profile_complete(user),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
