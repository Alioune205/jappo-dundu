from django.contrib import admin

from .models import PushDevice


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ['user', 'platform', 'is_active', 'last_error', 'last_seen_at']
    list_filter = ['platform', 'is_active']
    search_fields = ['user__username', 'user__email']
    raw_id_fields = ['user']
    readonly_fields = ['token', 'created_at', 'last_seen_at']
