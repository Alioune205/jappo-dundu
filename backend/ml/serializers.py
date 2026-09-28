"""
Sérialiseurs DRF de l'application ML de Jappo Dundu.

Auteur : El Hadji Massogui Diop
"""

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
