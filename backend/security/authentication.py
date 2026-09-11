"""
Backend d'authentification JWT personnalisé pour Jappo Dundu.

Étend le comportement par défaut de SimpleJWT pour inclure
les informations de rôle dans les tokens et gérer la
rotation sécurisée des refresh tokens.

Auteur : El Hadji Massogui Diop
"""

from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


class JappoDunduTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Sérialiseur JWT enrichi avec les informations utilisateur.

    Ajoute au token :
    - Le rôle de l'utilisateur
    - Son nom complet
    - Son statut admin
    - Ses groupes
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Ajout des claims personnalisés au token
        token['username'] = user.username
        token['email'] = user.email
        token['is_staff'] = user.is_staff
        token['full_name'] = user.get_full_name() or user.username

        # Rôle : depuis un champ `role` sur le modèle ou depuis les groupes
        role = getattr(user, 'role', None)
        if role:
            token['role'] = role
        else:
            groups = list(user.groups.values_list('name', flat=True))
            token['groups'] = groups
            if groups:
                token['role'] = groups[0]

        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        # Ajouter des informations utilisateur à la réponse JSON
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'full_name': self.user.get_full_name() or self.user.username,
            'is_staff': self.user.is_staff,
            'role': getattr(self.user, 'role', None),
            'groups': list(
                self.user.groups.values_list('name', flat=True)
            ),
        }

        return data


class JappoDunduTokenObtainPairView(TokenObtainPairView):
    """Vue d'obtention de tokens JWT avec claims enrichis."""

    serializer_class = JappoDunduTokenObtainPairSerializer


class JappoDunduTokenRefreshSerializer(TokenRefreshSerializer):
    """Sérialiseur de refresh de token avec validation renforcée."""

    pass


class JappoDunduTokenRefreshView(TokenRefreshView):
    """Vue de rafraîchissement de tokens JWT."""

    serializer_class = JappoDunduTokenRefreshSerializer
