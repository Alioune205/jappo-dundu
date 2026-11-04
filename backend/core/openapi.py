"""
Schémas OpenAPI partagés (drf-spectacular).

Décrivent, pour Swagger, les réponses des vues ``APIView`` qui renvoient un
dictionnaire construit à la main plutôt qu'un sérialiseur. Purement
documentaire : aucun effet sur le comportement de l'API.

Auteur : El Hadji Massogui Diop
"""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, inline_serializer
from rest_framework import serializers

DetailResponse = inline_serializer(
    'DetailResponse',
    fields={'detail': serializers.CharField(help_text="Message lisible par l'utilisateur.")},
)

TokenPairResponse = inline_serializer(
    'TokenPairResponse',
    fields={
        'detail': serializers.CharField(required=False),
        'access': serializers.CharField(help_text="Jeton d'accès JWT (courte durée)."),
        'refresh': serializers.CharField(help_text="Jeton de rafraîchissement JWT."),
    },
)


class CriticalAlertSerializer(serializers.Serializer):
    """Alerte critique, telle que diffusée en temps réel (voir realtime.escalation)."""

    event = serializers.CharField()
    critical_alert_id = serializers.IntegerField()
    kind = serializers.CharField()
    title = serializers.CharField()
    message = serializers.CharField()
    acknowledged = serializers.BooleanField()
    facility_id = serializers.IntegerField(allow_null=True)
    created_at = serializers.DateTimeField(required=False)


def json_object(description):
    """Réponse JSON libre (structure décrite en toutes lettres)."""
    return OpenApiResponse(response=OpenApiTypes.OBJECT, description=description)
