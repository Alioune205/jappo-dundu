"""
Modèles de l'application Ambulances de Jappo Dundu.

- Ambulance : véhicule rattaché à un établissement, géolocalisé, avec son
  conducteur et sa disponibilité.
- Mission   : intervention d'urgence, du signalement à l'arrivée du patient
  dans l'établissement de destination (cycle de vie contrôlé).

Auteur : Ibrahima Khalilou Diallo
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from geo.fields import coordinates_constraint, latitude_field, longitude_field
from ml.constants import REGIONS
from users.models import HealthFacility
from users.validators import validate_phone_number


class Ambulance(models.Model):
    """Ambulance d'un établissement ou d'un service d'ambulances."""

    class AmbulanceType(models.TextChoices):
        BASIC = 'basic', "Ambulance de transport"
        MEDICALIZED = 'medicalized', "Ambulance médicalisée (SMUR)"

    class Status(models.TextChoices):
        AVAILABLE = 'available', 'Disponible'
        ON_MISSION = 'on_mission', "En mission"
        OUT_OF_SERVICE = 'out_of_service', "Hors service"

    plate_number = models.CharField(
        max_length=20,
        unique=True,
        verbose_name="Immatriculation",
        help_text="Enregistrée en majuscules, ex. DK-1234-AB.",
    )
    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.PROTECT,
        related_name='ambulances',
        verbose_name="Établissement de rattachement",
    )
    ambulance_type = models.CharField(
        max_length=20,
        choices=AmbulanceType.choices,
        default=AmbulanceType.BASIC,
        verbose_name="Type",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE,
        verbose_name="Statut",
    )
    driver = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ambulance',
        verbose_name="Conducteur",
    )
    latitude = latitude_field(null=True)
    longitude = longitude_field(null=True)
    location_updated_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Position mise à jour le"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créée le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifiée le")

    class Meta:
        verbose_name = "Ambulance"
        verbose_name_plural = "Ambulances"
        ordering = ['plate_number']
        constraints = [
            coordinates_constraint('ambulance_coordinates_valid', nullable=True),
        ]
        indexes = [
            models.Index(fields=['status', 'ambulance_type'], name='idx_ambulance_status_type'),
        ]

    def __str__(self):
        return f"{self.plate_number} ({self.get_status_display()})"


class Mission(models.Model):
    """Intervention d'urgence d'une ambulance."""

    class Priority(models.TextChoices):
        CRITICAL = 'critical', "Critique (pronostic vital engagé)"
        URGENT = 'urgent', 'Urgente'
        NORMAL = 'normal', 'Normale'

    class Status(models.TextChoices):
        PENDING = 'pending', "En attente d'une ambulance"
        ASSIGNED = 'assigned', "Ambulance en route"
        ON_SITE = 'on_site', "Ambulance sur place"
        TRANSPORTING = 'transporting', "Transport du patient"
        COMPLETED = 'completed', "Terminée"
        CANCELLED = 'cancelled', "Annulée"

    # Une ambulance mobilisée par une mission dans l'un de ces statuts.
    ACTIVE_STATUSES = (Status.ASSIGNED, Status.ON_SITE, Status.TRANSPORTING)
    FINAL_STATUSES = (Status.COMPLETED, Status.CANCELLED)

    # Cycle de vie : statut courant -> statuts atteignables.
    TRANSITIONS = {
        Status.PENDING: frozenset({Status.ASSIGNED, Status.CANCELLED}),
        Status.ASSIGNED: frozenset({Status.ON_SITE, Status.CANCELLED}),
        Status.ON_SITE: frozenset({Status.TRANSPORTING, Status.COMPLETED, Status.CANCELLED}),
        Status.TRANSPORTING: frozenset({Status.COMPLETED}),
        Status.COMPLETED: frozenset(),
        Status.CANCELLED: frozenset(),
    }

    # Horodatage renseigné à l'entrée dans chaque statut.
    TIMESTAMP_FIELDS = {
        Status.ASSIGNED: 'assigned_at',
        Status.ON_SITE: 'on_site_at',
        Status.TRANSPORTING: 'transporting_at',
        Status.COMPLETED: 'completed_at',
        Status.CANCELLED: 'cancelled_at',
    }

    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.URGENT,
        verbose_name="Priorité",
    )
    description = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Nature de l'urgence",
    )
    pickup_address = models.CharField(
        max_length=255, blank=True, verbose_name="Lieu d'intervention"
    )
    pickup_latitude = latitude_field(verbose_name="Latitude du lieu d'intervention")
    pickup_longitude = longitude_field(verbose_name="Longitude du lieu d'intervention")
    region = models.CharField(max_length=50, choices=REGIONS, verbose_name="Région")
    caller_phone = models.CharField(
        max_length=13,
        blank=True,
        validators=[validate_phone_number],
        verbose_name="Téléphone de l'appelant",
    )
    ambulance = models.ForeignKey(
        Ambulance,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='missions',
        verbose_name="Ambulance",
    )
    destination = models.ForeignKey(
        HealthFacility,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='incoming_missions',
        verbose_name="Établissement de destination",
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name="Statut",
    )
    cancellation_reason = models.CharField(
        max_length=255, blank=True, verbose_name="Motif d'annulation"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='missions_created',
        verbose_name="Créée par",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Signalée le")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Modifiée le")
    assigned_at = models.DateTimeField(null=True, blank=True, verbose_name="Affectée le")
    on_site_at = models.DateTimeField(null=True, blank=True, verbose_name="Arrivée sur place le")
    transporting_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Départ vers l'établissement le"
    )
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Terminée le")
    cancelled_at = models.DateTimeField(null=True, blank=True, verbose_name="Annulée le")

    class Meta:
        verbose_name = "Mission"
        verbose_name_plural = "Missions"
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['ambulance'],
                condition=Q(status__in=['assigned', 'on_site', 'transporting']),
                name='uniq_active_mission_per_ambulance',
                violation_error_message="Cette ambulance est déjà engagée sur une mission.",
            ),
            coordinates_constraint(
                'mission_pickup_coordinates_valid',
                latitude='pickup_latitude',
                longitude='pickup_longitude',
                nullable=False,
            ),
        ]
        indexes = [
            models.Index(fields=['status', 'priority'], name='idx_mission_status_priority'),
            models.Index(fields=['region', 'status'], name='idx_mission_region_status'),
        ]

    def __str__(self):
        return f"Mission {self.pk} — {self.get_priority_display()} — {self.get_status_display()}"

    @property
    def is_active(self):
        return self.status in self.ACTIVE_STATUSES

    @property
    def is_final(self):
        return self.status in self.FINAL_STATUSES

    def can_transition_to(self, status):
        return status in self.TRANSITIONS[self.status]
