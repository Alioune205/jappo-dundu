"""
Sérialiseurs pour l'API SIH (Système d'Information Hospitalier).

Auteur : Pape Alioune Sene
"""

from django.utils import timezone
from rest_framework import serializers

from lits.models import BedCapacity
from ml.constants import BLOOD_GROUP_CODES
from .models import HospitalApiKey, HospitalSyncLog


class HospitalApiKeySerializer(serializers.ModelSerializer):
    """Représentation d'une clé API SIH."""

    facility_name = serializers.CharField(source='facility.name', read_only=True)

    class Meta:
        model = HospitalApiKey
        fields = [
            'id',
            'facility',
            'facility_name',
            'name',
            'key_prefix',
            'allow_beds',
            'allow_blood',
            'is_active',
            'created_at',
            'last_used_at',
        ]
        read_only_fields = fields


class HospitalApiKeyCreateSerializer(serializers.ModelSerializer):
    """Création d'une nouvelle clé d'accès SIH.

    La réponse contient la clé en clair (``key``) : c'est la seule fois où elle
    est lisible, seule son empreinte est conservée.
    """

    facility_id = serializers.IntegerField(required=False, write_only=True)
    allow_beds = serializers.BooleanField(required=False, default=None, allow_null=True)
    allow_blood = serializers.BooleanField(required=False, default=None, allow_null=True)
    key = serializers.CharField(read_only=True)

    class Meta:
        model = HospitalApiKey
        fields = ['id', 'name', 'facility_id', 'allow_beds', 'allow_blood', 'key', 'key_prefix']
        read_only_fields = ['id', 'key', 'key_prefix']


class BedSyncItemSerializer(serializers.Serializer):
    """Capacité d'un service dans le flux de synchronisation des lits."""

    category = serializers.ChoiceField(choices=BedCapacity.Category.choices)
    total_beds = serializers.IntegerField(min_value=0, max_value=2000)
    occupied_beds = serializers.IntegerField(min_value=0, default=0)

    def validate(self, attrs):
        if attrs['occupied_beds'] > attrs['total_beds']:
            raise serializers.ValidationError(
                {"occupied_beds": "Le nombre de lits occupés ne peut pas dépasser les lits installés."}
            )
        return attrs


class BedSyncBatchSerializer(serializers.Serializer):
    """Synchronisation globale / batch des lits par le SIH."""

    services = serializers.ListField(
        child=BedSyncItemSerializer(),
        allow_empty=False,
        help_text="Liste des capacités par service à mettre à jour.",
    )


class BedADTEventSerializer(serializers.Serializer):
    """Événement ADT (Admission / Décharge) envoyé en temps réel par le SIH."""

    ACTION_ADMIT = 'admit'
    ACTION_DISCHARGE = 'discharge'
    ACTIONS = [ACTION_ADMIT, ACTION_DISCHARGE]

    category = serializers.ChoiceField(choices=BedCapacity.Category.choices)
    action = serializers.ChoiceField(choices=ACTIONS)
    delta = serializers.IntegerField(min_value=1, default=1)
    patient_ref = serializers.CharField(max_length=100, required=False, allow_blank=True)


class BloodStockSyncItemSerializer(serializers.Serializer):
    """Stock d'un groupe sanguin pour la synchronisation SIH."""

    blood_group = serializers.ChoiceField(choices=BLOOD_GROUP_CODES)
    units_available = serializers.IntegerField(min_value=0)
    units_donated = serializers.IntegerField(min_value=0, default=0)
    units_used = serializers.IntegerField(min_value=0, default=0)
    units_expired = serializers.IntegerField(min_value=0, default=0)


class BloodStockSyncBatchSerializer(serializers.Serializer):
    """Synchronisation du stock de sang par le SIH."""

    date = serializers.DateField(required=False, default=timezone.localdate)
    stocks = serializers.ListField(
        child=BloodStockSyncItemSerializer(),
        allow_empty=False,
        help_text="Liste des niveaux de stock par groupe sanguin.",
    )

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("La date ne peut pas être dans le futur.")
        return value


class HospitalSyncLogSerializer(serializers.ModelSerializer):
    """Journal de synchronisation SIH."""

    facility_name = serializers.CharField(source='facility.name', read_only=True)
    sync_type_display = serializers.CharField(source='get_sync_type_display', read_only=True)

    class Meta:
        model = HospitalSyncLog
        fields = [
            'id',
            'facility',
            'facility_name',
            'sync_type',
            'sync_type_display',
            'status',
            'items_count',
            'details',
            'error_message',
            'duration_ms',
            'created_at',
        ]
        read_only_fields = fields
