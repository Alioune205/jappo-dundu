"""
Enregistrement des téléphones pour les notifications push.

POST /api/push/devices/             {"token", "platform"}  → 201 (nouveau) ou 200
POST /api/push/devices/unregister/  {"token"}              → 204

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDevice
from .services import is_valid_token


class DeviceSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
    platform = serializers.ChoiceField(choices=PushDevice.Platform.choices)

    def validate_token(self, value):
        if not is_valid_token(value):
            raise serializers.ValidationError("Jeton push Expo invalide.")
        return value


class UnregisterSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)


class DeviceRegisterView(APIView):
    """Enregistre (ou réactive) le téléphone de l'utilisateur connecté.

    Un jeton déjà connu change de propriétaire : c'est le même téléphone,
    utilisé par une autre personne après déconnexion.
    """

    def post(self, request):
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            device, created = PushDevice.objects.select_for_update().update_or_create(
                token=serializer.validated_data['token'],
                defaults={
                    'user': request.user,
                    'platform': serializer.validated_data['platform'],
                    'is_active': True,
                    'last_error': '',
                },
            )
        return Response(
            {'token': device.token, 'platform': device.platform, 'is_active': device.is_active},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DeviceUnregisterView(APIView):
    """Désactive le téléphone (déconnexion) : plus aucune notification pour ce compte."""

    def post(self, request):
        serializer = UnregisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.filter(token=serializer.validated_data['token'], user=request.user).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
