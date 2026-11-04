"""
Émission des tickets de connexion WebSocket (voir tickets.py).

Auteur : El Hadji Massogui Diop
"""

from django.db.models import Q
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.openapi import CriticalAlertSerializer
from security.permissions import NotSupervisor
from users.permissions import is_admin, user_facility

from .escalation import acknowledge, payload
from .models import CriticalAlert
from .tickets import issue_ticket


class WebSocketTicketView(APIView):
    """POST /api/realtime/ticket/ → ticket WebSocket à usage unique (JWT requis)."""

    @extend_schema(
        summary="Obtenir un ticket de connexion WebSocket (usage unique)",
        request=None,
        responses={
            201: inline_serializer(
                'WebSocketTicket',
                fields={'ticket': serializers.CharField(), 'expires_in': serializers.IntegerField(help_text="Secondes.")},
            ),
        },
    )
    def post(self, request):
        ticket, ttl = issue_ticket(request.user)
        return Response({'ticket': ticket, 'expires_in': ttl}, status=201)


class CriticalAlertListView(APIView):
    """Alertes critiques ouvertes : GET /api/realtime/critical-alerts/

    L'administrateur général les voit toutes ; les autres, celles de leur
    établissement et de leur région.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Alertes critiques non acquittées", responses=CriticalAlertSerializer(many=True))
    def get(self, request):
        alerts = CriticalAlert.objects.filter(acknowledged_at__isnull=True)
        if not is_admin(request.user):
            own = user_facility(request.user)
            if own is None:
                return Response([])
            alerts = alerts.filter(Q(facility_id=own.pk) | Q(facility__isnull=True, region=own.region))
        return Response([{**payload(alert), 'created_at': alert.created_at} for alert in alerts[:50]])


class CriticalAlertAckView(APIView):
    """Accusé de réception : POST /api/realtime/critical-alerts/<id>/ack/

    Réservé à l'établissement qui doit agir. L'administrateur général voit et
    reçoit toutes les alertes mais n'en accuse pas réception (403) : sinon
    l'alerte paraîtrait prise en charge et sa relance par SMS s'arrêterait
    alors que personne n'a affecté d'ambulance ni répondu.
    """

    permission_classes = [IsAuthenticated, NotSupervisor]

    @extend_schema(summary="Acquitter une alerte critique", request=None, responses=CriticalAlertSerializer)
    def post(self, request, pk):
        alert = CriticalAlert.objects.filter(pk=pk).first()
        own = user_facility(request.user)
        allowed = alert is not None and (
            own is not None and (alert.facility_id == own.pk or (alert.facility_id is None and alert.region == own.region))
        )
        if not allowed:
            raise NotFound("Alerte introuvable.")
        return Response(payload(acknowledge(alert, request.user)))
