"""
Authentification JWT des connexions WebSocket.

Le token d'accès (le même que pour l'API REST) est lu, par ordre de
priorité :
1. dans l'en-tête ``Authorization: Bearer <token>`` (mobile, outils) ;
2. dans la query string ``?token=<token>`` (navigateurs, dont l'API
   WebSocket ne permet pas d'envoyer d'en-têtes).

Les mêmes règles que l'API REST s'appliquent (signature, expiration,
compte actif). En cas d'échec, ``scope['user']`` vaut AnonymousUser et le
consumer ferme la connexion avec le code 4401.

Aucune authentification par cookie de session n'est acceptée : cela
écarte le détournement de WebSocket inter-sites (CSWSH).

Auteur : El Hadji Massogui Diop
"""

import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

logger = logging.getLogger('jappo_dundu.realtime')


def extract_token(scope):
    """Retourne le token brut de la requête WebSocket, ou None."""
    for name, value in scope.get('headers', []):
        if name == b'authorization':
            scheme, _, token = value.decode('latin-1').partition(' ')
            if scheme.lower() == 'bearer' and token.strip():
                return token.strip()

    query = parse_qs(scope.get('query_string', b'').decode('latin-1'))
    token = query.get('token', [''])[0].strip()
    return token or None


@database_sync_to_async
def get_user_for_token(raw_token):
    """Valide le token et retourne l'utilisateur actif associé."""
    authenticator = JWTAuthentication()
    try:
        validated = authenticator.get_validated_token(raw_token)
        return authenticator.get_user(validated)
    except (InvalidToken, TokenError, AuthenticationFailed) as exc:
        # Ne jamais journaliser le token lui-même.
        logger.info("Token WebSocket refusé : %s", type(exc).__name__)
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Renseigne ``scope['user']`` à partir du token JWT."""

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        token = extract_token(scope)
        scope['user'] = (
            await get_user_for_token(token) if token else AnonymousUser()
        )
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):  # noqa: N802 — convention Channels
    """Pile de middlewares WebSocket de Jappo Dundu."""
    return JWTAuthMiddleware(inner)
