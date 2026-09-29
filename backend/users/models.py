"""
Modèles de l'application Users de Jappo Dundu.

- HealthFacility : établissement de santé (hôpital, centre de transfusion,
  service d'ambulances...) géolocalisé, auquel se rattachent les lits, les
  demandes de sang, les ambulances et le personnel.
- UserProfile    : informations complémentaires d'un compte (téléphone,
  région, établissement de rattachement).

Le modèle utilisateur reste ``django.contrib.auth.models.User`` et les
rôles restent portés par les groupes Django (voir ``security.roles``).

Auteur : Ibrahima Khalilou Diallo
"""

from django.conf import settings
from django.db import models
from django.db.models import F
from django.db.models.functions import Lower

from geo.fields import coordinates_constraint, latitude_field, longitude_field
from ml.constants import REGIONS

from .validators import validate_phone_number


class HealthFacility(models.Model):
    """Établissement de santé géolocalisé."""

    class FacilityType(models.TextChoices):
        HOSPITAL = 'hospital', "Hôpital"
        HEALTH_CENTER = 'health_center', "Centre de santé"
        CLINIC = 'clinic', 'Clinique'
        BLOOD_BANK = 'blood_bank', "Centre de transfusion sanguine"
        AMBULANCE_SERVICE = 'ambulance_service', "Service d'ambulances"

    name = models.CharField(max_length=200, verbose_name="Nom")
    facility_type = models.CharField(
        max_length=30,
        choices=FacilityType.choices,
        verbose_name="Type d'établissement",
    )
    region = models.CharField(max_length=50, choices=REGIONS, verbose_name="Région")
    city = models.CharField(max_length=100, verbose_name="Ville")
    address = models.CharField(max_length=255, blank=True, verbose_name="Adresse")
    phone_number = models.CharField(
        max_length=13,
        blank=True,
        validators=[validate_phone_number],
        verbose_name="Téléphone",
        help_text="Format international : +221XXXXXXXXX.",
    )
    latitude = latitude_field()
    longitude = longitude_field()
    is_active = models.BooleanField(
        default=True,
        verbose_name="Actif",
        help_text="Un établissement inactif n'apparaît plus dans les recherches.",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifié le")

    class Meta:
        verbose_name = "Établissement de santé"
        verbose_name_plural = "Établissements de santé"
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                Lower('name'),
                F('region'),
                name='uniq_facility_name_region',
                violation_error_message=("Un établissement porte déjà ce nom dans cette région."),
            ),
            coordinates_constraint('facility_coordinates_valid', nullable=False),
        ]
        indexes = [
            models.Index(
                fields=['region', 'facility_type'],
                name='idx_facility_region_type',
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_region_display()})"


class UserProfile(models.Model):
    """Profil complémentaire d'un compte utilisateur."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name="Utilisateur",
    )
    phone_number = models.CharField(
        max_length=13,
        null=True,
        blank=True,
        unique=True,
        validators=[validate_phone_number],
        verbose_name="Téléphone",
        help_text="Format international : +221XXXXXXXXX.",
    )
    region = models.CharField(
        max_length=50,
        choices=REGIONS,
        blank=True,
        verbose_name="Région de résidence",
        help_text="Utilisée pour cibler les alertes régionales.",
    )
    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_profiles',
        verbose_name="Établissement de rattachement",
        help_text="Obligatoire pour le personnel hospitalier.",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifié le")

    class Meta:
        verbose_name = "Profil utilisateur"
        verbose_name_plural = "Profils utilisateurs"

    def __str__(self):
        return f"Profil de {self.user.get_username()}"
