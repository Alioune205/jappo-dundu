"""
Authentification des connexions WebSocket.

Deux moyens, par ordre de priorité :
1. l'en-tête ``Authorization: Bearer <access>`` (mobile, outils, scripts) :
   même validation que l'API REST (signature, expiration, compte actif) ;
2. un ticket à usage unique ``?ticket=<ticket>`` (navigateurs, dont l'API
   WebSocket ne permet pas d'envoyer d'en-têtes), obtenu par
   ``POST /api/realtime/ticket/`` — voir tickets.py.

Le JWT n'est jamais accepté dans l'URL : une query string est journalisée
par les proxies, passerelles et outils de supervision, et un jeton d'accès
qui y figure pourrait être rejoué. Un ticket, lui, est inutilisable une
fois consommé et expire en quelques secondes.

En cas d'échec, ``scope['user']`` vaut AnonymousUser et le consumer ferme
la connexion avec le code 4401.

Aucune authentification par cookie de session n'est acceptée : cela
écarte le détournement de WebSocket inter-sites (CSWSH).

Auteur : El Hadji Massogui Diop
"""

import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .tickets import consume_ticket

logger = logging.getLogger('jappo_dundu.realtime')


def extract_token(scope):
    """Retourne le JWT de l'en-tête Authorization, ou None."""
    for name, value in scope.get('headers', []):
        if name == b'authorization':
            scheme, _, token = value.decode('latin-1').partition(' ')
            if scheme.lower() == 'bearer' and token.strip():
                return token.strip()
    return None


def extract_ticket(scope):
    """Retourne le ticket de la query string, ou None."""
    query = parse_qs(scope.get('query_string', b'').decode('latin-1'))
    ticket = query.get('ticket', [''])[0].strip()
    return ticket or None


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


@database_sync_to_async
def get_user_for_ticket(ticket):
    """Consomme le ticket et retourne l'utilisateur actif associé."""
    user_id = consume_ticket(ticket)
    if user_id is None:
        logger.info("Ticket WebSocket refusé : inconnu, expiré ou déjà utilisé")
        return AnonymousUser()
    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    return user or AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Renseigne ``scope['user']`` à partir du JWT (en-tête) ou du ticket."""

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        token = extract_token(scope)
        if token:
            scope['user'] = await get_user_for_token(token)
        else:
            ticket = extract_ticket(scope)
            scope['user'] = await get_user_for_ticket(ticket) if ticket else AnonymousUser()
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):  # noqa: N802 — convention Channels
    """Pile de middlewares WebSocket de Jappo Dundu."""
    return JWTAuthMiddleware(inner)
