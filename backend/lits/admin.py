"""
Administration Django de l'application Lits.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib import admin

from .models import BedCapacity, BedReservation


@admin.register(BedCapacity)
class BedCapacityAdmin(admin.ModelAdmin):
    list_display = [
        'facility',
        'category',
        'total_beds',
        'occupied_beds',
        'reserved_beds',
        'available_beds',
        'updated_at',
    ]
    list_filter = ['category', 'facility__region']
    search_fields = ['facility__name']
    autocomplete_fields = ['facility', 'updated_by']
    readonly_fields = ['reserved_beds', 'updated_at']
    list_select_related = ['facility']
    list_per_page = 50

    @admin.display(description="Lits disponibles")
    def available_beds(self, obj):
        return obj.available_beds


@admin.register(BedReservation)
class BedReservationAdmin(admin.ModelAdmin):
    """Consultation seule : les réservations passent par l'API (compteurs tenus à jour)."""

    list_display = ['capacity', 'status', 'mission', 'expires_at', 'created_by', 'created_at']
    list_filter = ['status', 'capacity__category', 'capacity__facility__region']
    search_fields = ['capacity__facility__name', 'reference']
    list_select_related = ['capacity__facility', 'mission', 'created_by']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
