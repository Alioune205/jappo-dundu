"""
Administration Django de l'application ML.

Auteur : El Hadji Massogui Diop
"""

from django.contrib import admin

from .models import BloodStockRecord, MLModelMetadata, PredictionResult


@admin.register(BloodStockRecord)
class BloodStockRecordAdmin(admin.ModelAdmin):
    """Historique des stocks (saisie manuelle possible)."""

    list_display = [
        'center_name',
        'region',
        'blood_group',
        'date',
        'units_available',
        'units_donated',
        'units_used',
        'units_expired',
        'source',
    ]
    list_filter = ['source', 'region', 'blood_group']
    search_fields = ['center_name']
    ordering = ['-date']
    date_hierarchy = 'date'
    list_per_page = 50


@admin.register(PredictionResult)
class PredictionResultAdmin(admin.ModelAdmin):
    """Prédictions (lecture seule : produites par le modèle)."""

    list_display = [
        'center_name',
        'region',
        'blood_group',
        'prediction_date',
        'predicted_units',
        'days_of_supply',
        'risk_level',
        'confidence_score',
        'model_version',
    ]
    list_filter = ['risk_level', 'region', 'blood_group', 'model_version']
    search_fields = ['center_name']
    ordering = ['prediction_date']
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(MLModelMetadata)
class MLModelMetadataAdmin(admin.ModelAdmin):
    """Registre des modèles : cocher « actif » bascule le modèle utilisé."""

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
    readonly_fields = [
        'version',
        'algorithm',
        'trained_at',
        'training_samples',
        'mae',
        'rmse',
        'r2_score',
        'metrics',
        'model_file_path',
    ]
