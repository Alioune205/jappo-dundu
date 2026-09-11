"""
Vues de monitoring et de santé du système pour Jappo Dundu.

Fournit des endpoints publics pour vérifier l'état de l'API,
de la base de données et des services dépendants.

Auteur : El Hadji Massogui Diop
"""

import time

from django.db import connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Endpoint de vérification de santé de l'API.

    Retourne un statut 200 si l'API est opérationnelle.
    Utilisé par Docker, les load balancers et le monitoring.

    GET /api/health/
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        return Response(
            {
                'status': 'healthy',
                'service': 'Jappo Dundu API',
                'version': '1.0.0',
            },
            status=status.HTTP_200_OK,
        )


class SystemStatusView(APIView):
    """Endpoint de statut détaillé du système.

    Vérifie la connectivité avec la base de données et
    retourne des informations sur l'état des dépendances.

    GET /api/status/
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        checks = {
            'api': self._check_api(),
            'database': self._check_database(),
            'redis': self._check_redis(),
        }

        all_healthy = all(
            check['status'] == 'up' for check in checks.values()
        )

        return Response(
            {
                'status': 'healthy' if all_healthy else 'degraded',
                'checks': checks,
            },
            status=(
                status.HTTP_200_OK
                if all_healthy
                else status.HTTP_503_SERVICE_UNAVAILABLE
            ),
        )

    @staticmethod
    def _check_api():
        """Vérifie que l'API est opérationnelle."""
        return {'status': 'up', 'message': 'API fonctionnelle'}

    @staticmethod
    def _check_database():
        """Vérifie la connexion à la base de données PostgreSQL."""
        try:
            start = time.monotonic()
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            return {
                'status': 'up',
                'latency_ms': latency_ms,
                'message': 'Base de données connectée',
            }
        except Exception as exc:
            return {
                'status': 'down',
                'message': f'Erreur de connexion : {exc}',
            }

    @staticmethod
    def _check_redis():
        """Vérifie la connexion à Redis (WebSockets / cache)."""
        try:
            from django.conf import settings

            channel_layers = getattr(settings, 'CHANNEL_LAYERS', {})
            if not channel_layers:
                return {
                    'status': 'not_configured',
                    'message': 'Redis non configuré',
                }

            import redis

            redis_url = (
                channel_layers.get('default', {})
                .get('CONFIG', {})
                .get('hosts', [('redis', 6379)])[0]
            )

            if isinstance(redis_url, tuple):
                host, port = redis_url
                r = redis.Redis(host=host, port=port, socket_timeout=2)
            else:
                r = redis.from_url(str(redis_url), socket_timeout=2)

            start = time.monotonic()
            r.ping()
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            return {
                'status': 'up',
                'latency_ms': latency_ms,
                'message': 'Redis connecté',
            }
        except ImportError:
            return {
                'status': 'not_available',
                'message': 'Module redis non installé',
            }
        except Exception as exc:
            return {
                'status': 'down',
                'message': f'Erreur de connexion Redis : {exc}',
            }
