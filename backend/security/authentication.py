"""
Authentification JWT de Jappo Dundu (SimpleJWT).

- Claims enrichis avec les rôles (``role``, ``roles``) pour le routage
  côté web/mobile, sans donnée personnelle (email, nom) dans le token.
- Rotation des refresh tokens avec liste noire : un refresh token déjà
  utilisé ou révoqué (logout) est refusé.
- Limitation de débit dédiée sur la connexion (anti force brute).
- Connexion par identifiant ou par numéro de téléphone (application mobile :
  un donneur retient son numéro plus sûrement qu'un identifiant).

Auteur : El Hadji Massogui Diop
"""

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from users.models import UserProfile
from users.validators import normalize_phone_number

from .roles import get_user_roles, primary_role

# Saisie qui ressemble à un numéro : chiffres, +, espaces et séparateurs usuels.
_PHONE_LIKE = re.compile(r'^\+?[\d\s.\-()/]{9,20}$')


def resolve_login(identifier):
    """Identifiant de connexion → nom d'utilisateur.

    Un numéro de téléphone (« 77 123 45 67 », « +221771234567 »…) est
    remplacé par l'identifiant du compte qui le porte. Sinon, la saisie est
    rendue telle quelle : un numéro inconnu échoue comme un mauvais
    identifiant, sans révéler qu'il n'existe pas.
    """
    value = (identifier or '').strip()
    if not _PHONE_LIKE.match(value):
        return value
    try:
        phone = normalize_phone_number(value)
    except DjangoValidationError:
        return value
    username = (
        UserProfile.objects.filter(phone_number=phone)
        .values_list('user__username', flat=True)
        .first()
    )
    return username or value


class JappoDunduTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Sérialiseur de connexion : claims de rôles + profil dans la réponse.

    Double authentification activée : le code à 6 chiffres (``otp``) est exigé
    après le mot de passe ; sans lui, 401 avec ``code: "otp_required"``.
    """

    otp = serializers.CharField(required=False, allow_blank=True, write_only=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        roles = get_user_roles(user)
        token['username'] = user.get_username()
        token['roles'] = sorted(roles)
        token['role'] = primary_role(roles)
        token['is_staff'] = user.is_staff
        return token

    def validate(self, attrs):
        attrs[self.username_field] = resolve_login(attrs.get(self.username_field))
        otp_code = attrs.pop('otp', '')
        data = super().validate(attrs)
        check_second_factor(self.user, otp_code)
        roles = get_user_roles(self.user)
        data['user'] = {
            'id': self.user.pk,
            'username': self.user.get_username(),
            'email': self.user.email,
            'full_name': self.user.get_full_name() or self.user.get_username(),
            'is_staff': self.user.is_staff,
            'role': primary_role(roles),
            'roles': sorted(roles),
            'groups': list(self.user.groups.values_list('name', flat=True)),
        }
        return data


def check_second_factor(user, code):
    """Vérifie le code TOTP d'un compte qui a activé la double authentification."""
    from .models import TwoFactor
    from .otp import verify

    two_factor = TwoFactor.objects.filter(user=user, confirmed_at__isnull=False).first()
    if two_factor is None:
        return
    if not code:
        # Le code figure dans le corps : le client affiche alors le champ du code.
        raise AuthenticationFailed({'detail': "Code de double authentification requis.", 'code': 'otp_required'})
    step = verify(two_factor.secret, code, last_used_step=two_factor.last_used_step)
    if step is None:
        raise AuthenticationFailed({'detail': "Code de double authentification invalide ou expiré.", 'code': 'otp_invalid'})
    TwoFactor.objects.filter(pk=two_factor.pk).update(last_used_step=step)


@extend_schema_view(
    post=extend_schema(
        summary="Se connecter : paire de jetons JWT et profil",
        description=(
            "Identifiant : nom d'utilisateur, e-mail ou téléphone. Si la double "
            "authentification est activée, le champ otp (code à 6 chiffres) est exigé ; "
            "sans lui, la réponse est 401 avec code = otp_required."
        ),
        responses={
            200: inline_serializer(
                'LoginResponse',
                fields={
                    'access': serializers.CharField(),
                    'refresh': serializers.CharField(),
                    'user': inline_serializer(
                        'LoginUser',
                        fields={
                            'id': serializers.IntegerField(),
                            'username': serializers.CharField(),
                            'email': serializers.EmailField(),
                            'full_name': serializers.CharField(),
                            'is_staff': serializers.BooleanField(),
                            'role': serializers.CharField(),
                            'roles': serializers.ListField(child=serializers.CharField()),
                            'groups': serializers.ListField(child=serializers.CharField()),
                        },
                    ),
                },
            ),
            401: OpenApiResponse(description="Identifiants invalides ou code OTP manquant."),
        },
        auth=[],
    )
)
class JappoDunduTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/token/ — obtention d'une paire access/refresh."""

    serializer_class = JappoDunduTokenObtainPairSerializer
    throttle_scope = 'login'

    def get_throttles(self):
        return [*super().get_throttles(), ScopedRateThrottle()]


class JappoDunduTokenRefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/ — rotation du refresh token."""


@extend_schema_view(
    post=extend_schema(
        summary="Vérifier la validité d'un jeton",
        responses={200: OpenApiResponse(description="Jeton valide."), 401: OpenApiResponse(description="Jeton invalide ou expiré.")},
        auth=[],
    )
)
class JappoDunduTokenVerifyView(TokenVerifyView):
    """POST /api/auth/token/verify/ — vérifie la validité d'un token."""


@extend_schema_view(
    post=extend_schema(
        summary="Se déconnecter : révoquer le jeton de rafraîchissement",
        responses={200: OpenApiResponse(description="Jeton révoqué.")},
    )
)
class LogoutView(TokenBlacklistView):
    """POST /api/auth/logout/ — révoque le refresh token fourni."""
