"""
Modèles de l'application Lits de Jappo Dundu.

- BedCapacity    : capacité en lits d'un service d'un établissement
  (installés, occupés, réservés, disponibles), tenue à jour par le personnel.
- BedReservation : lit bloqué pour un patient attendu, avec expiration.

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
    reserved_beds = models.PositiveSmallIntegerField(
        default=0,
        editable=False,
        verbose_name="Lits réservés",
        help_text="Réservations en cours (tenu à jour par le module, voir BedReservation).",
    )
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
            models.CheckConstraint(
                condition=Q(reserved_beds__lte=F('total_beds') - F('occupied_beds')),
                name='bed_capacity_reserved_lte_free',
                violation_error_message="Les lits réservés ne peuvent pas dépasser les lits libres.",
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
        """Lits ni occupés ni réservés : ceux qu'on peut encore attribuer."""
        return self.total_beds - self.occupied_beds - self.reserved_beds

    @property
    def occupancy_rate(self):
        """Taux d'occupation entre 0 et 1 (None si aucun lit installé)."""
        if not self.total_beds:
            return None
        return round(self.occupied_beds / self.total_beds, 4)


class BedReservation(models.Model):
    """Lit bloqué pour un patient attendu (mission SAMU, transfert, admission programmée).

    Une réservation active compte comme un lit indisponible
    (``BedCapacity.reserved_beds``) jusqu'à l'arrivée du patient, son
    annulation ou son expiration : un lit n'est jamais bloqué indéfiniment.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', "En cours"
        FULFILLED = 'fulfilled', "Patient admis"
        CANCELLED = 'cancelled', "Annulée"
        EXPIRED = 'expired', "Expirée"

    capacity = models.ForeignKey(
        BedCapacity,
        on_delete=models.PROTECT,
        related_name='reservations',
        verbose_name="Service",
    )
    mission = models.ForeignKey(
        'ambulances.Mission',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bed_reservations',
        verbose_name="Mission SAMU",
    )
    reference = models.CharField(
        max_length=120,
        blank=True,
        verbose_name="Référence",
        help_text="Repère interne (ex. « transfert Fann, bloc 2 ») ; jamais le nom du patient.",
    )
    notes = models.CharField(max_length=500, blank=True, verbose_name="Précisions")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE, verbose_name="Statut"
    )
    expires_at = models.DateTimeField(verbose_name="Expire le")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="Réservé par",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Réservé le")
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="Clôturée le")
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="Clôturée par",
    )
    closing_reason = models.CharField(max_length=200, blank=True, verbose_name="Motif de clôture")

    class Meta:
        verbose_name = "Réservation de lit"
        verbose_name_plural = "Réservations de lits"
        ordering = ['-created_at']
        constraints = [
            # Une mission ne bloque qu'un lit à la fois (réorientation = remplacement).
            models.UniqueConstraint(
                fields=['mission'],
                condition=Q(status='active'),
                name='uniq_active_bed_reservation_per_mission',
            ),
        ]
        indexes = [
            models.Index(fields=['status', 'expires_at'], name='idx_bed_resa_status_expiry'),
        ]

    def __str__(self):
        return f"{self.capacity.facility.name} — {self.capacity.get_category_display()} ({self.get_status_display()})"

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE
