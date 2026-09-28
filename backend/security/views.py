"""
Vues de supervision de Jappo Dundu.

- GET /api/health/  : sonde de vivacité publique (voir HealthCheckMiddleware).
- GET /api/status/  : état détaillé des dépendances, réservé aux admins.

Auteur : El Hadji Massogui Diop
"""

import logging
import time

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .middleware import health_payload
from .permissions import IsAdmin

logger = logging.getLogger('jappo_dundu.security')


def health_check(request):
    """Sonde de vivacité : l'application répond (aucune dépendance testée).

    Normalement servie par HealthCheckMiddleware ; cette vue garantit que la
    route existe dans l'URLconf (reverse(), APPEND_SLASH).
    """
    return JsonResponse(health_payload())


def _timed(name, check):
    """Exécute une vérification et mesure sa latence, sans fuite d'erreur."""
    start = time.monotonic()
    try:
        result = check()
    except Exception as exc:  # noqa: BLE001 — toute panne = service down
        logger.exception("Vérification de dépendance échouée : %s", name)
        return {'status': 'down', 'error': type(exc).__name__}
    result.setdefault('status', 'up')
    result['latency_ms'] = round((time.monotonic() - start) * 1000, 2)
    return result


def check_database():
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return {'engine': connection.vendor}


def check_channel_layer():
    backend = settings.CHANNEL_LAYERS['default']['BACKEND']
    if backend.endswith('InMemoryChannelLayer'):
        return {'backend': 'in-memory'}

    import redis

    client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
    try:
        client.ping()
    finally:
        client.close()
    return {'backend': 'redis'}


def check_ml_model():
    from ml.services.registry import active_model_status

    return active_model_status()


class SystemStatusView(APIView):
    """État détaillé des dépendances (base, Redis, modèle ML).

    Réservé aux administrateurs : ces informations décrivent
    l'infrastructure et n'ont pas à être publiques.
    Retourne 503 si une dépendance critique (base, channel layer) est down.
    """

    permission_classes = [IsAdmin]
    CRITICAL_CHECKS = ('database', 'channel_layer')

    def get(self, request):
        checks = {
            'database': _timed('database', check_database),
            'channel_layer': _timed('channel_layer', check_channel_layer),
            'ml_model': _timed('ml_model', check_ml_model),
        }
        healthy = all(
            checks[name]['status'] == 'up' for name in self.CRITICAL_CHECKS
        )
        return Response(
            {
                'status': 'healthy' if healthy else 'degraded',
                'service': 'Jappo Dundu API',
                'checks': checks,
            },
            status=(
                status.HTTP_200_OK
                if healthy
                else status.HTTP_503_SERVICE_UNAVAILABLE
            ),
        )
