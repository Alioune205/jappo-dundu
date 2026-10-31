"""
Vues de supervision de Jappo Dundu.

- GET /api/health/  : sonde de vivacité publique (voir HealthCheckMiddleware).
- GET /api/status/  : état détaillé des dépendances, réservé aux admins.

Auteur : El Hadji Massogui Diop
"""

import logging
import time
from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ml.constants import REGION_CODES
from users.filters import choice_param, int_param
from users.permissions import is_admin, user_facility

from . import audit, otp
from .kpis import network_kpis
from .middleware import health_payload
from .models import AuditEvent, EmergencyAccess, TwoFactor
from .permissions import IsAdmin
from .roles import Domain, manages

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


# =============================================================
# JOURNAL D'AUDIT, ACCÈS D'URGENCE, DOUBLE AUTHENTIFICATION
# =============================================================



class AuditLogView(APIView):
    """Journal d'audit (administrateur général) : GET /api/security/audit/ ?action= &user= &limit=200"""

    permission_classes = [IsAdmin]

    def get(self, request):
        events = AuditEvent.objects.select_related('user', 'facility')
        action = request.query_params.get('action')
        if action:
            events = events.filter(action__startswith=action)
        user_id = request.query_params.get('user')
        if user_id and user_id.isdigit():
            events = events.filter(user_id=int(user_id))
        try:
            limit = min(int(request.query_params.get('limit', 200)), 1000)
        except ValueError:
            limit = 200
        return Response(
            [
                {
                    'id': event.pk,
                    'created_at': event.created_at,
                    'action': event.action,
                    'user': None
                    if event.user is None
                    else {'id': event.user_id, 'full_name': event.user.get_full_name() or event.user.get_username()},
                    'facility': None if event.facility is None else {'id': event.facility_id, 'name': event.facility.name},
                    'target': f"{event.target_type} #{event.target_id}" if event.target_type else '',
                    'detail': event.detail,
                    'ip_address': event.ip_address,
                }
                for event in events[:limit]
            ]
        )


class EmergencyAccessInput(serializers.Serializer):
    facility_id = serializers.IntegerField()
    domain = serializers.ChoiceField(choices=[d.value for d in Domain])
    reason = serializers.CharField(min_length=10, max_length=255)


class EmergencyAccessView(APIView):
    """Accès d'urgence (« bris de glace »).

    GET  /api/security/emergency-access/   ses accès (tous pour l'administrateur général)
    POST /api/security/emergency-access/   {"facility_id", "domain", "reason"} : 60 min, journalisé
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        accesses = EmergencyAccess.objects.select_related('facility', 'user')
        if not request.user.is_staff:
            accesses = accesses.filter(user=request.user)
        return Response(
            [
                {
                    'id': access.pk,
                    'user': access.user.get_full_name() or access.user.get_username(),
                    'facility': {'id': access.facility_id, 'name': access.facility.name},
                    'domain': access.domain,
                    'reason': access.reason,
                    'created_at': access.created_at,
                    'expires_at': access.expires_at,
                    'active': access.is_active,
                }
                for access in accesses[:100]
            ]
        )

    def post(self, request):
        from users.models import HealthFacility

        serializer = EmergencyAccessInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not manages(request.user, data['domain']):
            raise PermissionDenied("Ce domaine ne relève pas de votre rôle.")
        facility = HealthFacility.objects.filter(pk=data['facility_id'], is_active=True).first()
        if facility is None:
            raise ValidationError({'facility_id': ["Établissement introuvable."]})
        minutes = getattr(settings, 'EMERGENCY_ACCESS_MINUTES', 60)
        access = EmergencyAccess.objects.create(
            user=request.user,
            facility=facility,
            domain=data['domain'],
            reason=data['reason'],
            expires_at=timezone.now() + timedelta(minutes=minutes),
        )
        audit.record(request, 'emergency_access.open', access, facility=facility, domain=data['domain'], reason=data['reason'])
        return Response({'id': access.pk, 'expires_at': access.expires_at}, status=201)


class TwoFactorView(APIView):
    """Double authentification du compte connecté.

    GET  /api/auth/2fa/            état
    POST /api/auth/2fa/setup/      nouveau secret + URI otpauth (à scanner)
    POST /api/auth/2fa/confirm/    {"code"} : active
    POST /api/auth/2fa/disable/    {"code", "password"} : désactive
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, step=None):
        two_factor = TwoFactor.objects.filter(user=request.user).first()
        return Response({'enabled': bool(two_factor and two_factor.enabled)})

    def post(self, request, step=None):
        user = request.user
        if step == 'setup':
            secret = otp.new_secret()
            TwoFactor.objects.update_or_create(user=user, defaults={'secret': secret, 'confirmed_at': None, 'last_used_step': 0})
            return Response({'secret': secret, 'otpauth_uri': otp.provisioning_uri(secret, user.get_username())})
        two_factor = TwoFactor.objects.filter(user=user).first()
        if two_factor is None:
            raise ValidationError({'code': ["Commencez par l'étape « setup »."]})
        found = otp.verify(two_factor.secret, request.data.get('code', ''), last_used_step=two_factor.last_used_step)
        if found is None:
            raise ValidationError({'code': ["Code invalide ou expiré."]})
        if step == 'confirm':
            two_factor.confirmed_at = timezone.now()
            two_factor.last_used_step = found
            two_factor.save()
            audit.record(request, 'two_factor.enabled', user)
            return Response({'enabled': True})
        if step == 'disable':
            if not user.check_password(request.data.get('password', '')):
                raise ValidationError({'password': ["Mot de passe incorrect."]})
            two_factor.delete()
            audit.record(request, 'two_factor.disabled', user)
            return Response({'enabled': False})
        raise ValidationError({'step': ["Étape inconnue."]})


class NetworkKpisView(APIView):
    """Indicateurs de pilotage et leurs objectifs : GET /api/supervision/kpis/ ?days=7 &region=dakar

    L'administrateur général choisit la région (tout le pays par défaut) ;
    un administrateur de domaine voit la région de son établissement.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        days = int_param(params, 'days', default=7, minimum=1, maximum=90)
        if is_admin(request.user):
            region = choice_param(params, 'region', REGION_CODES)
        else:
            if not any(manages(request.user, domain) for domain in Domain):
                raise PermissionDenied("Réservé aux administrateurs.")
            own = user_facility(request.user)
            region = own.region if own else None
            if region is None:
                raise PermissionDenied("Compte rattaché à aucun établissement.")
        return Response(network_kpis(days=days, region=region))
