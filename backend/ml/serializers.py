"""
Sérialiseurs DRF de l'application ML de Jappo Dundu.

Auteur : El Hadji Massogui Diop
"""

from django.db import models
from rest_framework import serializers

from .constants import BLOOD_GROUPS, REGIONS
from .models import BloodStockRecord, MLModelMetadata, PredictionResult
from .services.predictor import MAX_DAYS_AHEAD


class BloodStockRecordSerializer(serializers.ModelSerializer):
    """Enregistrement de stock sanguin."""

    region_display = serializers.CharField(
        source='get_region_display', read_only=True
    )
    blood_group_display = serializers.CharField(
        source='get_blood_group_display', read_only=True
    )

    class Meta:
        model = BloodStockRecord
        fields = [
            'id',
            'center_name',
            'region',
            'region_display',
            'blood_group',
            'blood_group_display',
            'date',
            'units_available',
            'units_donated',
            'units_used',
            'units_expired',
            'source',
        ]
        read_only_fields = fields


class PredictionResultSerializer(serializers.ModelSerializer):
    """Prédiction de stock et niveau de risque."""

    region_display = serializers.CharField(
        source='get_region_display', read_only=True
    )
    blood_group_display = serializers.CharField(
        source='get_blood_group_display', read_only=True
    )
    risk_level_display = serializers.CharField(
        source='get_risk_level_display', read_only=True
    )

    class Meta:
        model = PredictionResult
        fields = [
            'id',
            'center_name',
            'region',
            'region_display',
            'blood_group',
            'blood_group_display',
            'prediction_date',
            'predicted_units',
            'lower_bound',
            'upper_bound',
            'days_of_supply',
            'risk_level',
            'risk_level_display',
            'confidence_score',
            'created_at',
            'model_version',
        ]
        read_only_fields = fields


class PredictionRequestSerializer(serializers.Serializer):
    """Paramètres d'une prédiction à la demande."""

    region = serializers.ChoiceField(
        choices=REGIONS,
        required=False,
        help_text="Filtrer par région (optionnel, toutes si non spécifié).",
    )
    blood_group = serializers.ChoiceField(
        choices=BLOOD_GROUPS,
        required=False,
        help_text="Filtrer par groupe sanguin (optionnel).",
    )
    days_ahead = serializers.IntegerField(
        min_value=1,
        max_value=MAX_DAYS_AHEAD,
        default=7,
        help_text=f"Nombre de jours à prédire (1 à {MAX_DAYS_AHEAD}, défaut : 7).",
    )


class MLModelMetadataSerializer(serializers.ModelSerializer):
    """Métadonnées et métriques du modèle ML."""

    class Meta:
        model = MLModelMetadata
        fields = [
            'id',
            'version',
            'algorithm',
            'trained_at',
            'training_samples',
            'mae',
            'rmse',
            'r2_score',
            'metrics',
            'is_active',
            'notes',
        ]
        read_only_fields = fields


class PredictionSummarySerializer(serializers.Serializer):
    """Synthèse des risques par région (tableau de bord)."""

    region = serializers.CharField()
    region_display = serializers.CharField()
    total_predictions = serializers.IntegerField()
    critical_count = serializers.IntegerField()
    warning_count = serializers.IntegerField()
    normal_count = serializers.IntegerField()


class BloodStockRecordWriteSerializer(serializers.Serializer):
    """Saisie ou mise à jour unitaire d'un stock de sang."""

    center_name = serializers.CharField(max_length=200, required=False)
    region = serializers.ChoiceField(choices=REGIONS, required=False)
    blood_group = serializers.ChoiceField(choices=BLOOD_GROUPS)
    date = serializers.DateField(required=False)
    units_available = serializers.IntegerField(min_value=0)
    units_donated = serializers.IntegerField(min_value=0, default=0, required=False)
    units_used = serializers.IntegerField(min_value=0, default=0, required=False)
    units_expired = serializers.IntegerField(min_value=0, default=0, required=False)


class BloodStockBatchItemSerializer(serializers.Serializer):
    """Ligne de stock par groupe sanguin dans une saisie groupée."""

    blood_group = serializers.ChoiceField(choices=BLOOD_GROUPS)
    units_available = serializers.IntegerField(min_value=0)
    units_donated = serializers.IntegerField(min_value=0, default=0, required=False)
    units_used = serializers.IntegerField(min_value=0, default=0, required=False)
    units_expired = serializers.IntegerField(min_value=0, default=0, required=False)


class BloodStockBatchSerializer(serializers.Serializer):
    """Saisie en lot (inventaire complet du centre) pour une date."""

    center_name = serializers.CharField(max_length=200, required=False)
    region = serializers.ChoiceField(choices=REGIONS, required=False)
    date = serializers.DateField(required=False)
    items = BloodStockBatchItemSerializer(many=True, allow_empty=False)


class BloodStockAdjustmentSerializer(serializers.Serializer):
    """Ajustement rapide de stock (entrées, sorties, péremptions ou inventaire)."""

    class AdjustmentType(models.TextChoices if hasattr(models, 'TextChoices') else object):
        ADD_DONATED = 'add_donated', 'Ajout de poches reçues (don)'
        USE = 'use', 'Prélèvement pour transfusion'
        EXPIRE = 'expire', 'Retrait de poches périmées'
        SET = 'set', 'Inventaire direct (remplacement du stock)'

    center_name = serializers.CharField(max_length=200, required=False)
    region = serializers.ChoiceField(choices=REGIONS, required=False)
    blood_group = serializers.ChoiceField(choices=BLOOD_GROUPS)
    date = serializers.DateField(required=False)
    adjustment_type = serializers.ChoiceField(
        choices=[
            ('add_donated', 'Ajout de poches reçues (don)'),
            ('use', 'Prélèvement pour transfusion'),
            ('expire', 'Retrait de poches périmées'),
            ('set', 'Inventaire direct (remplacement du stock)'),
        ]
    )
    units = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class BloodStockCurrentSummarySerializer(serializers.Serializer):
    """Synthèse temps réel du stock par groupe pour un centre."""

    center_name = serializers.CharField()
    region = serializers.CharField()
    region_display = serializers.CharField()
    as_of_date = serializers.DateField()
    total_units_available = serializers.IntegerField()
    critical_groups = serializers.ListField(child=serializers.CharField())
    warning_groups = serializers.ListField(child=serializers.CharField())
    stocks = serializers.ListField(child=serializers.DictField())

