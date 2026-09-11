"""
Configuration de l'interface d'administration pour l'application ML.

Auteur : El Hadji Massogui Diop
"""

from django.contrib import admin

from .models import BloodStockRecord, MLModelMetadata, PredictionResult


@admin.register(BloodStockRecord)
class BloodStockRecordAdmin(admin.ModelAdmin):
    """Administration des enregistrements de stock sanguin."""

    list_display = [
        'center_name',
        'region',
        'blood_group',
        'date',
        'units_available',
        'units_donated',
        'units_used',
        'units_expired',
    ]
    list_filter = ['region', 'blood_group', 'date']
    search_fields = ['center_name']
    ordering = ['-date']
    date_hierarchy = 'date'
    list_per_page = 50


@admin.register(PredictionResult)
class PredictionResultAdmin(admin.ModelAdmin):
    """Administration des résultats de prédiction."""

    list_display = [
        'center_name',
        'region',
        'blood_group',
        'prediction_date',
        'predicted_units',
        'risk_level',
        'confidence_score',
        'model_version',
        'created_at',
    ]
    list_filter = ['risk_level', 'region', 'blood_group', 'model_version']
    search_fields = ['center_name']
    ordering = ['-created_at']
    list_per_page = 50


@admin.register(MLModelMetadata)
class MLModelMetadataAdmin(admin.ModelAdmin):
    """Administration des métadonnées des modèles ML."""

    list_display = [
        'version',
        'algorithm',
        'trained_at',
        'training_samples',
        'mae',
        'rmse',
        'r2_score',
        'is_active',
    ]
    list_filter = ['is_active', 'algorithm']
    ordering = ['-trained_at']
