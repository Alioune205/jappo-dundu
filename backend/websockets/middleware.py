"""
Middleware d'authentification JWT pour les connexions WebSocket.

Authentifie les connexions WebSocket en extrayant le token JWT
depuis les paramètres de la query string.

Usage côté client :
    ws://host/ws/alerts/?token=<jwt_access_token>

Auteur : El Hadji Massogui Diop
"""

import logging
from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger('jappo_dundu.websockets')

User = get_user_model()


class JWTWebSocketMiddleware(BaseMiddleware):
    """Middleware d'authentification JWT pour les WebSockets.

    Extrait le token JWT de la query string et authentifie
    l'utilisateur avant de passer la requête au consumer.

    Si le token est invalide ou absent, l'utilisateur est
    défini comme AnonymousUser (le consumer peut alors
    décider de refuser ou d'accepter la connexion).
    """

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode('utf-8')
        query_params = parse_qs(query_string)

        token = query_params.get('token', [None])[0]

        if token:
            scope['user'] = await self._authenticate_token(token)
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _authenticate_token(self, token):
        """Valide le token JWT et retourne l'utilisateur associé.

        Utilise le décodeur SimpleJWT pour valider le token.
        Retourne AnonymousUser si le token est invalide.
        """
        try:
            from rest_framework_simplejwt.tokens import AccessToken

            validated_token = AccessToken(token)
            user_id = validated_token.get('user_id')
            return User.objects.get(id=user_id)
        except Exception as exc:
            logger.warning(
                "Authentification WebSocket échouée : %s", exc
            )
            return AnonymousUser()


def JWTAuthMiddlewareStack(inner):
    """Stack middleware combinant l'auth JWT et l'auth Django pour WebSocket.

    Applique d'abord le middleware JWT (token dans la query string),
    puis le middleware Django standard (session cookies) comme fallback.
    """
    return JWTWebSocketMiddleware(AuthMiddlewareStack(inner))
