"""
Sérialiseurs DRF pour l'application ML de Jappo Dundu.

Auteur : El Hadji Massogui Diop
"""

from rest_framework import serializers

from .models import BloodStockRecord, MLModelMetadata, PredictionResult


class BloodStockRecordSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les enregistrements de stock sanguin."""

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
        ]
        read_only_fields = ['id']


class PredictionResultSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les résultats de prédiction."""

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
            'risk_level',
            'risk_level_display',
            'confidence_score',
            'created_at',
            'model_version',
        ]
        read_only_fields = [
            'id',
            'created_at',
        ]


class PredictionRequestSerializer(serializers.Serializer):
    """Sérialiseur pour les requêtes de prédiction à la demande."""

    region = serializers.ChoiceField(
        choices=BloodStockRecord.REGIONS,
        required=False,
        help_text="Filtrer par région (optionnel, toutes si non spécifié).",
    )
    blood_group = serializers.ChoiceField(
        choices=BloodStockRecord.BLOOD_GROUPS,
        required=False,
        help_text="Filtrer par groupe sanguin (optionnel).",
    )
    days_ahead = serializers.IntegerField(
        min_value=1,
        max_value=30,
        default=7,
        help_text="Nombre de jours à prédire (1 à 30, défaut : 7).",
    )


class MLModelMetadataSerializer(serializers.ModelSerializer):
    """Sérialiseur pour les métadonnées du modèle ML."""

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
            'is_active',
            'notes',
        ]
        read_only_fields = ['id', 'trained_at']


class PredictionSummarySerializer(serializers.Serializer):
    """Sérialiseur pour le résumé des prédictions (dashboard)."""

    region = serializers.CharField()
    region_display = serializers.CharField()
    total_predictions = serializers.IntegerField()
    critical_count = serializers.IntegerField()
    warning_count = serializers.IntegerField()
    normal_count = serializers.IntegerField()
