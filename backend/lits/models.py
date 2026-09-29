"""
Modèles de l'application Lits de Jappo Dundu.

- BedCapacity : capacité en lits d'un service d'un établissement
  (total, occupés, disponibles), tenue à jour par le personnel.

Auteur : Ibrahima Khalilou Diallo
"""

from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models import F, Q

from users.models import HealthFacility

MAX_BEDS_PER_SERVICE = 2000

# Établissements disposant de lits d'hospitalisation.
BED_FACILITY_TYPES = (
    HealthFacility.FacilityType.HOSPITAL,
    HealthFacility.FacilityType.HEALTH_CENTER,
    HealthFacility.FacilityType.CLINIC,
)


class BedCapacity(models.Model):
    """Lits d'un service (catégorie) dans un établissement."""

    class Category(models.TextChoices):
        EMERGENCY = 'emergency', 'Urgences'
        INTENSIVE_CARE = 'intensive_care', "Réanimation / soins intensifs"
        SURGERY = 'surgery', 'Chirurgie'
        INTERNAL_MEDICINE = 'internal_medicine', "Médecine"
        MATERNITY = 'maternity', "Maternité"
        PEDIATRICS = 'pediatrics', "Pédiatrie"
        NEONATOLOGY = 'neonatology', "Néonatologie"

    # Services vitaux : leur saturation déclenche une alerte temps réel.
    CRITICAL_CATEGORIES = frozenset(
        {
            Category.EMERGENCY,
            Category.INTENSIVE_CARE,
            Category.NEONATOLOGY,
        }
    )

    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.PROTECT,
        related_name='bed_capacities',
        verbose_name="Établissement",
    )
    category = models.CharField(max_length=30, choices=Category.choices, verbose_name="Service")
    total_beds = models.PositiveSmallIntegerField(
        validators=[MaxValueValidator(MAX_BEDS_PER_SERVICE)],
        verbose_name="Lits installés",
    )
    occupied_beds = models.PositiveSmallIntegerField(default=0, verbose_name="Lits occupés")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Mis à jour le")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="Mis à jour par",
    )

    class Meta:
        verbose_name = "Capacité en lits"
        verbose_name_plural = "Capacités en lits"
        ordering = ['facility__name', 'category']
        constraints = [
            models.UniqueConstraint(
                fields=['facility', 'category'],
                name='uniq_bed_capacity_facility_category',
                violation_error_message="Ce service existe déjà pour cet établissement.",
            ),
            models.CheckConstraint(
                condition=Q(occupied_beds__lte=F('total_beds')),
                name='bed_capacity_occupied_lte_total',
                violation_error_message=(
                    "Les lits occupés ne peuvent pas dépasser les lits installés."
                ),
            ),
            models.CheckConstraint(
                condition=Q(total_beds__lte=MAX_BEDS_PER_SERVICE),
                name='bed_capacity_total_max',
            ),
        ]
        indexes = [
            models.Index(fields=['category'], name='idx_bed_capacity_category'),
        ]

    def __str__(self):
        return (
            f"{self.facility.name} — {self.get_category_display()} : "
            f"{self.available_beds}/{self.total_beds} disponibles"
        )

    @property
    def available_beds(self):
        return self.total_beds - self.occupied_beds

    @property
    def occupancy_rate(self):
        """Taux d'occupation entre 0 et 1 (None si aucun lit installé)."""
        if not self.total_beds:
            return None
        return round(self.occupied_beds / self.total_beds, 4)
