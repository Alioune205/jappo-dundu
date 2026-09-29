"""
Modèles de l'application Sang de Jappo Dundu.

- Donor         : profil donneur d'un citoyen (groupe, position, disponibilité)
- BloodRequest  : demande de sang émise par un établissement
- DonorResponse : réponse d'un donneur à une demande
- Donation      : don effectué (historique du donneur)

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from geo.fields import coordinates_constraint, latitude_field, longitude_field
from ml.constants import BLOOD_GROUPS
from users.models import HealthFacility

from . import eligibility

MAX_UNITS_PER_REQUEST = 50
MAX_SEARCH_RADIUS_KM = 200
DEFAULT_SEARCH_RADIUS_KM = 20


class DonorQuerySet(models.QuerySet):
    def eligible(self, today=None):
        """Donneurs pouvant donner à ``today`` (mêmes règles que ``eligibility``)."""
        today = today or timezone.localdate()
        born_on_or_before, born_after = eligibility.birth_date_bounds(today)
        interval_elapsed = Q(last_donation_date__isnull=True)
        for sex, days in eligibility.DONATION_INTERVAL_DAYS.items():
            interval_elapsed |= Q(sex=sex, last_donation_date__lte=today - timedelta(days=days))
        return self.filter(
            interval_elapsed,
            is_available=True,
            user__is_active=True,
            date_of_birth__lte=born_on_or_before,
            date_of_birth__gt=born_after,
        )


class Donor(models.Model):
    """Profil donneur (un par compte citoyen)."""

    class Sex(models.TextChoices):
        MALE = 'M', 'Homme'
        FEMALE = 'F', 'Femme'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='donor_profile',
        verbose_name="Utilisateur",
    )
    blood_group = models.CharField(
        max_length=3, choices=BLOOD_GROUPS, verbose_name="Groupe sanguin"
    )
    sex = models.CharField(
        max_length=1,
        choices=Sex.choices,
        verbose_name="Sexe",
        help_text="Détermine le délai minimal entre deux dons.",
    )
    date_of_birth = models.DateField(verbose_name="Date de naissance")
    is_available = models.BooleanField(
        default=True,
        verbose_name="Disponible",
        help_text="Le donneur accepte d'être sollicité pour des demandes urgentes.",
    )
    latitude = latitude_field(null=True)
    longitude = longitude_field(null=True)
    location_updated_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Position mise à jour le"
    )
    last_donation_date = models.DateField(
        null=True, blank=True, verbose_name="Date du dernier don"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifié le")

    objects = DonorQuerySet.as_manager()

    class Meta:
        verbose_name = "Donneur"
        verbose_name_plural = "Donneurs"
        ordering = ['-created_at']
        constraints = [
            coordinates_constraint('donor_coordinates_valid', nullable=True),
        ]
        indexes = [
            models.Index(fields=['blood_group', 'is_available'], name='idx_donor_group_available'),
        ]

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.get_username()} ({self.blood_group})"

    @property
    def has_location(self):
        return self.latitude is not None and self.longitude is not None

    def next_eligible_date(self):
        return eligibility.next_eligible_date(self.sex, self.last_donation_date)

    def ineligibility_reasons(self, today=None):
        return eligibility.ineligibility_reasons(self, today or timezone.localdate())

    def record_donation_date(self, donated_on):
        """Met à jour la date du dernier don (jamais vers le passé)."""
        if self.last_donation_date is None or donated_on > self.last_donation_date:
            self.last_donation_date = donated_on
            self.save(update_fields=['last_donation_date', 'updated_at'])


class BloodRequest(models.Model):
    """Demande de sang émise par un établissement de santé."""

    class Urgency(models.TextChoices):
        CRITICAL = 'critical', "Critique (pronostic vital engagé)"
        URGENT = 'urgent', 'Urgente'
        NORMAL = 'normal', 'Normale'

    class Status(models.TextChoices):
        OPEN = 'open', 'Ouverte'
        FULFILLED = 'fulfilled', 'Satisfaite'
        CANCELLED = 'cancelled', "Annulée"

    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.PROTECT,
        related_name='blood_requests',
        verbose_name="Établissement demandeur",
    )
    blood_group = models.CharField(
        max_length=3, choices=BLOOD_GROUPS, verbose_name="Groupe sanguin du receveur"
    )
    units_needed = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(MAX_UNITS_PER_REQUEST)],
        verbose_name="Poches nécessaires",
    )
    units_collected = models.PositiveSmallIntegerField(default=0, verbose_name="Poches collectées")
    urgency = models.CharField(
        max_length=10,
        choices=Urgency.choices,
        default=Urgency.URGENT,
        verbose_name="Urgence",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
        verbose_name="Statut",
    )
    notes = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Précisions",
        help_text="Contexte utile aux équipes, sans donnée identifiant le patient.",
    )
    needed_by = models.DateTimeField(null=True, blank=True, verbose_name="Nécessaire avant le")
    search_radius_km = models.PositiveSmallIntegerField(
        default=DEFAULT_SEARCH_RADIUS_KM,
        validators=[MinValueValidator(1), MaxValueValidator(MAX_SEARCH_RADIUS_KM)],
        verbose_name="Rayon de recherche (km)",
        help_text="Distance maximale entre l'établissement et les donneurs sollicités.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='blood_requests_created',
        verbose_name="Créée par",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créée le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifiée le")
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="Clôturée le")

    class Meta:
        verbose_name = "Demande de sang"
        verbose_name_plural = "Demandes de sang"
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=Q(units_needed__gte=1, units_needed__lte=MAX_UNITS_PER_REQUEST),
                name='blood_request_units_needed_range',
            ),
            models.CheckConstraint(
                condition=Q(units_collected__lte=F('units_needed')),
                name='blood_request_collected_lte_needed',
            ),
            models.CheckConstraint(
                condition=Q(search_radius_km__gte=1, search_radius_km__lte=MAX_SEARCH_RADIUS_KM),
                name='blood_request_radius_range',
            ),
        ]
        indexes = [
            models.Index(fields=['status', 'blood_group'], name='idx_bloodreq_status_group'),
            models.Index(fields=['facility', 'status'], name='idx_bloodreq_facility_status'),
        ]

    def __str__(self):
        return f"{self.blood_group} × {self.units_needed} — {self.facility.name} ({self.status})"

    @property
    def units_remaining(self):
        return max(0, self.units_needed - self.units_collected)

    @property
    def is_open(self):
        return self.status == self.Status.OPEN


class DonorResponse(models.Model):
    """Réponse d'un donneur à une demande de sang."""

    class Status(models.TextChoices):
        ACCEPTED = 'accepted', "Accepte de donner"
        DECLINED = 'declined', "Décline"
        CANCELLED = 'cancelled', "Désistement"
        DONATED = 'donated', "Don effectué"
        NO_SHOW = 'no_show', "Ne s'est pas présenté"

    # Statuts modifiables par le donneur ; les autres sont fixés par l'établissement.
    DONOR_STATUSES = (Status.ACCEPTED, Status.DECLINED, Status.CANCELLED)
    FINAL_STATUSES = (Status.DONATED, Status.NO_SHOW)

    blood_request = models.ForeignKey(
        BloodRequest,
        on_delete=models.CASCADE,
        related_name='responses',
        verbose_name="Demande",
    )
    donor = models.ForeignKey(
        Donor,
        on_delete=models.CASCADE,
        related_name='responses',
        verbose_name="Donneur",
    )
    status = models.CharField(max_length=10, choices=Status.choices, verbose_name="Statut")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Répondu le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifiée le")

    class Meta:
        verbose_name = "Réponse d'un donneur"
        verbose_name_plural = "Réponses des donneurs"
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['blood_request', 'donor'], name='uniq_response_request_donor'
            ),
        ]

    def __str__(self):
        return f"{self.donor} → demande {self.blood_request_id} : {self.status}"


class Donation(models.Model):
    """Don de sang effectué (lié ou non à une demande)."""

    donor = models.ForeignKey(
        Donor,
        on_delete=models.PROTECT,
        related_name='donations',
        verbose_name="Donneur",
    )
    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.PROTECT,
        related_name='donations',
        verbose_name="Lieu du don",
    )
    donated_on = models.DateField(verbose_name="Date du don")
    blood_request = models.ForeignKey(
        BloodRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='donations',
        verbose_name="Demande satisfaite",
    )
    response = models.OneToOneField(
        DonorResponse,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='donation',
        verbose_name="Réponse à l'origine du don",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='donations_recorded',
        verbose_name="Enregistré par",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Enregistré le")

    class Meta:
        verbose_name = "Don"
        verbose_name_plural = "Dons"
        ordering = ['-donated_on', '-id']
        indexes = [
            models.Index(fields=['donor', '-donated_on'], name='idx_donation_donor_date'),
        ]

    def __str__(self):
        return f"Don de {self.donor} le {self.donated_on:%d/%m/%Y}"
