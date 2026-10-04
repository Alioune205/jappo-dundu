"""
Middleware de sécurité et d'observabilité pour Jappo Dundu.

- HealthCheckMiddleware : répond à /api/health/ avant toute autre couche
  (validation d'ALLOWED_HOSTS, redirection HTTPS), pour les sondes Docker
  et les load balancers.
- RequestLoggingMiddleware : journal d'audit de chaque requête HTTP avec un
  identifiant de corrélation (X-Request-ID).
- SecurityHeadersMiddleware : en-têtes non couverts par Django
  (Permissions-Policy, Cache-Control: no-store sur l'API).

Auteur : El Hadji Massogui Diop
"""

import logging
import re
import time
import uuid

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from rest_framework.throttling import BaseThrottle

logger = logging.getLogger('jappo_dundu.security')

HEALTH_PATH = '/api/health/'
REQUEST_ID_HEADER = 'X-Request-ID'
_SAFE_REQUEST_ID = re.compile(r'^[A-Za-z0-9._-]{8,64}$')


def health_payload():
    """Contenu de la sonde de vivacité (aucune dépendance externe)."""
    return {
        'status': 'healthy',
        'service': 'Jappo Dundu API',
        'version': '1.0.0',
    }


def get_client_ip(request):
    """Adresse IP du client, avec la même règle que le throttling DRF.

    Respecte ``REST_FRAMEWORK['NUM_PROXIES']`` : un en-tête
    X-Forwarded-For forgé par le client ne peut pas usurper l'adresse.
    """
    return BaseThrottle().get_ident(request) or 'unknown'


class HealthCheckMiddleware(MiddlewareMixin):
    """Court-circuite /api/health/ (doit être le premier middleware)."""

    def process_request(self, request):
        if request.path == HEALTH_PATH and request.method in ('GET', 'HEAD'):
            return JsonResponse(health_payload())
        return None


class RequestLoggingMiddleware(MiddlewareMixin):
    """Journal d'audit des requêtes avec identifiant de corrélation.

    Un X-Request-ID entrant (posé par le reverse proxy ou le client) est
    réutilisé s'il est bien formé ; sinon un nouvel identifiant est généré.
    """

    def process_request(self, request):
        incoming = request.headers.get(REQUEST_ID_HEADER, '')
        request.request_id = (
            incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        )
        request._start_time = time.monotonic()

    def process_response(self, request, response):
        request_id = getattr(request, 'request_id', None) or uuid.uuid4().hex
        start = getattr(request, '_start_time', None)
        duration_ms = (time.monotonic() - start) * 1000 if start else 0.0

        user = getattr(request, 'user', None)
        username = (
            user.get_username()
            if user is not None and user.is_authenticated
            else 'anonymous'
        )

        if response.status_code >= 500:
            level = logging.ERROR
        elif response.status_code >= 400:
            level = logging.WARNING
        else:
            level = logging.INFO

        logger.log(
            level,
            'request_id=%s method=%s path=%s status=%s duration_ms=%.1f '
            'user=%s ip=%s',
            request_id,
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            username,
            get_client_ip(request),
        )

        response[REQUEST_ID_HEADER] = request_id
        return response


class SecurityHeadersMiddleware(MiddlewareMixin):
    """En-têtes de sécurité complémentaires à ceux de Django.

    Django fournit déjà X-Content-Type-Options, X-Frame-Options,
    Referrer-Policy et Cross-Origin-Opener-Policy (voir settings).
    """

    PERMISSIONS_POLICY = (
        'geolocation=(), camera=(), microphone=(), payment=(), usb=()'
    )

    def process_response(self, request, response):
        response.setdefault('Permissions-Policy', self.PERMISSIONS_POLICY)
        
        # CSP
        from django.conf import settings
        if hasattr(settings, 'SECURE_CSP'):
            csp_parts = []
            for directive, sources in settings.SECURE_CSP.items():
                csp_parts.append(f"{directive} {' '.join(sources)}")
            response.setdefault('Content-Security-Policy', '; '.join(csp_parts))

        # Les réponses de l'API (tokens, données médicales) ne doivent
        # jamais être stockées par un cache navigateur ou intermédiaire.
        if request.path.startswith('/api/') and not response.has_header(
            'Cache-Control'
        ):
            response['Cache-Control'] = 'no-store'
        return response
