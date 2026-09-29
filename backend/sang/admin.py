"""
Administration Django de l'application Sang.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib import admin

from .models import BloodRequest, Donation, Donor, DonorResponse


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'blood_group',
        'sex',
        'date_of_birth',
        'is_available',
        'last_donation_date',
        'location_updated_at',
    ]
    list_filter = ['blood_group', 'sex', 'is_available']
    search_fields = [
        'user__username',
        'user__first_name',
        'user__last_name',
        'user__profile__phone_number',
    ]
    autocomplete_fields = ['user']
    readonly_fields = ['location_updated_at', 'created_at', 'updated_at']
    list_select_related = ['user']
    list_per_page = 50


class DonorResponseInline(admin.TabularInline):
    model = DonorResponse
    extra = 0
    autocomplete_fields = ['donor']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(BloodRequest)
class BloodRequestAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'facility',
        'blood_group',
        'units_needed',
        'units_collected',
        'urgency',
        'status',
        'created_at',
    ]
    list_filter = ['status', 'urgency', 'blood_group', 'facility__region']
    search_fields = ['facility__name', 'notes']
    autocomplete_fields = ['facility', 'created_by']
    readonly_fields = ['created_at', 'updated_at', 'closed_at']
    list_select_related = ['facility']
    date_hierarchy = 'created_at'
    inlines = [DonorResponseInline]
    list_per_page = 50


@admin.register(DonorResponse)
class DonorResponseAdmin(admin.ModelAdmin):
    list_display = ['blood_request', 'donor', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['donor__user__username', 'blood_request__facility__name']
    autocomplete_fields = ['blood_request', 'donor']
    list_select_related = ['blood_request__facility', 'donor__user']


@admin.register(Donation)
class DonationAdmin(admin.ModelAdmin):
    list_display = ['donor', 'facility', 'donated_on', 'blood_request', 'recorded_by']
    list_filter = ['facility__region']
    search_fields = ['donor__user__username', 'donor__user__last_name', 'facility__name']
    autocomplete_fields = ['donor', 'facility', 'blood_request', 'response', 'recorded_by']
    date_hierarchy = 'donated_on'
    list_select_related = ['donor__user', 'facility', 'recorded_by']
    list_per_page = 50
