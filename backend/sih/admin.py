"""
Administration Django pour le module SIH.
"""

from django.contrib import admin, messages
from .models import HospitalApiKey, HospitalSyncLog


@admin.register(HospitalApiKey)
class HospitalApiKeyAdmin(admin.ModelAdmin):
    list_display = ['name', 'facility', 'key_prefix', 'allow_beds', 'allow_blood', 'is_active', 'created_at', 'last_used_at']
    list_filter = ['is_active', 'allow_beds', 'allow_blood', 'facility__region']
    search_fields = ['name', 'facility__name', 'key_prefix']
    readonly_fields = ['key_prefix', 'created_at', 'last_used_at']

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.key:
            # Seule occasion de lire la clé : elle n'est stockée que hachée.
            messages.warning(request, f"Clé générée (copiez-la maintenant, elle ne sera plus affichée) : {obj.key}")


@admin.register(HospitalSyncLog)
class HospitalSyncLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'facility', 'sync_type', 'status', 'items_count', 'duration_ms', 'ip_address']
    list_filter = ['sync_type', 'status', 'facility__region']
    search_fields = ['facility__name', 'error_message']
    readonly_fields = [
        'facility',
        'api_key',
        'sync_type',
        'status',
        'items_count',
        'details',
        'error_message',
        'ip_address',
        'duration_ms',
        'created_at',
    ]
