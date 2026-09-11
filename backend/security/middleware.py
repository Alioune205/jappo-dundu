"""
Middleware de sécurité pour Jappo Dundu.

Fournit :
- RequestLoggingMiddleware : Logging d'audit de toutes les requêtes API
- SecurityHeadersMiddleware : En-têtes de sécurité HTTP

Auteur : El Hadji Massogui Diop
"""

import logging
import time
import uuid

from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger('jappo_dundu.security')


class RequestLoggingMiddleware(MiddlewareMixin):
    """Middleware de logging d'audit des requêtes API.

    Enregistre pour chaque requête :
    - Un identifiant unique de requête
    - La méthode HTTP et le chemin
    - L'utilisateur authentifié (ou 'anonymous')
    - L'adresse IP source
    - Le code de statut de la réponse
    - Le temps de traitement en millisecondes
    """

    def process_request(self, request):
        """Initialise le chronomètre et l'ID de requête."""
        request._start_time = time.monotonic()
        request._request_id = str(uuid.uuid4())[:8]

    def process_response(self, request, response):
        """Enregistre les détails de la requête dans les logs."""
        duration_ms = 0
        if hasattr(request, '_start_time'):
            duration_ms = (time.monotonic() - request._start_time) * 1000

        request_id = getattr(request, '_request_id', 'unknown')
        user = 'anonymous'
        if hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user.username

        client_ip = self._get_client_ip(request)

        log_data = {
            'request_id': request_id,
            'method': request.method,
            'path': request.path,
            'user': user,
            'ip': client_ip,
            'status': response.status_code,
            'duration_ms': round(duration_ms, 2),
        }

        # Niveau de log basé sur le code de statut
        if response.status_code >= 500:
            logger.error("API Request: %(log_data)s", {'log_data': log_data})
        elif response.status_code >= 400:
            logger.warning("API Request: %(log_data)s", {'log_data': log_data})
        else:
            logger.info("API Request: %(log_data)s", {'log_data': log_data})

        # Ajouter l'ID de requête dans les headers de la réponse
        response['X-Request-ID'] = request_id

        return response

    @staticmethod
    def _get_client_ip(request):
        """Extrait l'adresse IP du client, en tenant compte des proxys."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', 'unknown')


class SecurityHeadersMiddleware(MiddlewareMixin):
    """Middleware ajoutant les en-têtes de sécurité HTTP.

    Implémente les bonnes pratiques OWASP pour la protection
    contre les attaques XSS, clickjacking, MIME sniffing, etc.
    """

    def process_response(self, request, response):
        # Protection contre le MIME type sniffing
        response['X-Content-Type-Options'] = 'nosniff'

        # Protection XSS (complément au CSP)
        response['X-XSS-Protection'] = '1; mode=block'

        # Empêcher l'embedding dans des iframes tierces
        response['X-Frame-Options'] = 'DENY'

        # Politique de référent stricte
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Permissions Policy (anciennement Feature-Policy)
        response['Permissions-Policy'] = (
            'geolocation=(self), '
            'camera=(), '
            'microphone=(), '
            'payment=()'
        )

        return response
