"""
Authentification JWT de Jappo Dundu (SimpleJWT).

- Claims enrichis avec les rôles (``role``, ``roles``) pour le routage
  côté web/mobile, sans donnée personnelle (email, nom) dans le token.
- Rotation des refresh tokens avec liste noire : un refresh token déjà
  utilisé ou révoqué (logout) est refusé.
- Limitation de débit dédiée sur la connexion (anti force brute).

Auteur : El Hadji Massogui Diop
"""

from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from .roles import get_user_roles, primary_role


class JappoDunduTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Sérialiseur de connexion : claims de rôles + profil dans la réponse."""

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
        data = super().validate(attrs)
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


class JappoDunduTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/token/ — obtention d'une paire access/refresh."""

    serializer_class = JappoDunduTokenObtainPairSerializer
    throttle_scope = 'login'

    def get_throttles(self):
        return [*super().get_throttles(), ScopedRateThrottle()]


class JappoDunduTokenRefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/ — rotation du refresh token."""


class JappoDunduTokenVerifyView(TokenVerifyView):
    """POST /api/auth/token/verify/ — vérifie la validité d'un token."""


class LogoutView(TokenBlacklistView):
    """POST /api/auth/logout/ — révoque le refresh token fourni."""
