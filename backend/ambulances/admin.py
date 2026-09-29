"""
Administration Django de l'application Ambulances.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib import admin

from .models import Ambulance, Mission


@admin.register(Ambulance)
class AmbulanceAdmin(admin.ModelAdmin):
    list_display = [
        'plate_number',
        'facility',
        'ambulance_type',
        'status',
        'driver',
        'location_updated_at',
    ]
    list_filter = ['status', 'ambulance_type', 'facility__region']
    search_fields = ['plate_number', 'facility__name', 'driver__username']
    autocomplete_fields = ['facility', 'driver']
    readonly_fields = ['location_updated_at', 'created_at', 'updated_at']
    list_select_related = ['facility', 'driver']


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    """Missions : le cycle de vie passe par l'API (affectation, statuts)."""

    list_display = [
        'id',
        'priority',
        'status',
        'region',
        'ambulance',
        'destination',
        'created_at',
    ]
    list_filter = ['status', 'priority', 'region']
    search_fields = ['description', 'pickup_address', 'ambulance__plate_number']
    autocomplete_fields = ['ambulance', 'destination', 'created_by']
    readonly_fields = [
        'status',
        'created_at',
        'updated_at',
        'assigned_at',
        'on_site_at',
        'transporting_at',
        'completed_at',
        'cancelled_at',
    ]
    list_select_related = ['ambulance', 'destination']
    date_hierarchy = 'created_at'
    list_per_page = 50
