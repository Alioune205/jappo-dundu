"""
Tickets de connexion WebSocket à usage unique.

Un navigateur ne peut pas envoyer d'en-tête ``Authorization`` lors de
l'ouverture d'un WebSocket. Plutôt que de placer le JWT dans l'URL (où il
finirait dans les journaux de proxy, d'APM ou de passerelle), le client
échange son JWT contre un ticket :

    POST /api/realtime/ticket/   (Authorization: Bearer <access>)
    → {"ticket": "<aléatoire>", "expires_in": 30}

puis ouvre ``wss://<domaine>/ws/alerts/?ticket=<ticket>``.

Le ticket :
- est aléatoire (256 bits), sans lien avec le JWT ;
- expire au bout de ``REALTIME_TICKET_TTL`` secondes (30 par défaut) ;
- n'est utilisable qu'une seule fois : la suppression atomique de la clé de
  cache départage deux tentatives concurrentes ;
- n'est stocké que sous forme d'empreinte SHA-256.

Le stockage est le cache Django : Redis en production (partagé entre
processus Daphne), mémoire locale en développement.

Auteur : El Hadji Massogui Diop
"""

import hashlib
import secrets

from django.conf import settings
from django.core.cache import cache

KEY_PREFIX = 'realtime-ticket:'
DEFAULT_TTL_SECONDS = 30


def ticket_ttl():
    return getattr(settings, 'REALTIME_TICKET_TTL', DEFAULT_TTL_SECONDS)


def _key(ticket):
    return KEY_PREFIX + hashlib.sha256(ticket.encode()).hexdigest()


def issue_ticket(user):
    """Crée un ticket pour ``user`` ; retourne ``(ticket, durée de vie en s)``."""
    ticket = secrets.token_urlsafe(32)
    ttl = ticket_ttl()
    cache.set(_key(ticket), user.pk, timeout=ttl)
    return ticket, ttl


def consume_ticket(ticket):
    """Retourne l'identifiant d'utilisateur du ticket et l'invalide, ou None."""
    if not ticket or len(ticket) > 128:
        return None
    key = _key(ticket)
    user_id = cache.get(key)
    # delete() ne renvoie True qu'au premier appelant : usage unique garanti
    # même si deux connexions présentent le même ticket au même instant.
    if user_id is None or not cache.delete(key):
        return None
    return user_id
