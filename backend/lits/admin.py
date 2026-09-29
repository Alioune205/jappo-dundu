"""
Administration Django de l'application Lits.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib import admin

from .models import BedCapacity


@admin.register(BedCapacity)
class BedCapacityAdmin(admin.ModelAdmin):
    list_display = [
        'facility',
        'category',
        'total_beds',
        'occupied_beds',
        'available_beds',
        'updated_at',
    ]
    list_filter = ['category', 'facility__region']
    search_fields = ['facility__name']
    autocomplete_fields = ['facility', 'updated_by']
    readonly_fields = ['updated_at']
    list_select_related = ['facility']
    list_per_page = 50

    @admin.display(description="Lits disponibles")
    def available_beds(self, obj):
        return obj.available_beds
