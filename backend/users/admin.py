"""
Administration Django de l'application Users.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import HealthFacility, UserProfile

User = get_user_model()


@admin.register(HealthFacility)
class HealthFacilityAdmin(admin.ModelAdmin):
    """Établissements : désactiver plutôt que supprimer (historique conservé)."""

    list_display = [
        'name',
        'facility_type',
        'region',
        'city',
        'phone_number',
        'is_active',
    ]
    list_filter = ['facility_type', 'region', 'is_active']
    search_fields = ['name', 'city', 'address']
    ordering = ['name']
    readonly_fields = ['created_at', 'updated_at']
    list_per_page = 50


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    fk_name = 'user'
    autocomplete_fields = ['facility']
    verbose_name_plural = "Profil"


# Le profil s'édite directement dans la fiche utilisateur.
admin.site.unregister(User)


@admin.register(User)
class JappoDunduUserAdmin(UserAdmin):
    inlines = [UserProfileInline]
    list_select_related = ['profile__facility']
    search_fields = [*UserAdmin.search_fields, 'profile__phone_number']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'phone_number', 'region', 'facility']
    list_filter = ['region']
    search_fields = ['user__username', 'user__last_name', 'phone_number']
    autocomplete_fields = ['user', 'facility']
    list_select_related = ['user', 'facility']
