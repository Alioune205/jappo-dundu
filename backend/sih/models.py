"""
Modèles de l'application SIH (Système d'Information Hospitalier).

- HospitalApiKey  : Clés d'API sécurisées pour l'authentification M2M des progiciels hospitaliers.
- HospitalSyncLog : Traçabilité et audit des synchronisations automatisées (lits et sang).

Auteur : Pape Alioune Sene
"""

import hashlib
import secrets

from django.db import models
from users.models import HealthFacility

KEY_PREFIX_LENGTH = 12


def generate_sih_api_key():
    """Génère une clé d'API unique préfixée pour l'authentification SIH."""
    return f"jd_sih_{secrets.token_urlsafe(32)}"


def hash_api_key(raw_key):
    """Empreinte SHA-256 d'une clé : seule l'empreinte est stockée.

    Une clé de 256 bits aléatoires n'a pas besoin d'un hachage lent (pas de
    dictionnaire possible) ; SHA-256 permet une recherche indexée.
    """
    return hashlib.sha256(raw_key.encode()).hexdigest()


class HospitalApiKey(models.Model):
    """Clé d'accès API pour le progiciel SIH d'un établissement de santé.

    La clé en clair n'est jamais enregistrée : elle n'est disponible que sur
    l'instance qui vient d'être créée (attribut ``key``), pour être montrée
    une seule fois à son créateur.
    """

    # Clé en clair, présente uniquement juste après la création.
    key = None

    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.CASCADE,
        related_name='sih_api_keys',
        verbose_name="Établissement de santé",
    )
    name = models.CharField(
        max_length=100,
        default="Connecteur SIH",
        verbose_name="Nom de l'intégration",
        help_text="Nom du progiciel connecté (ex: OpenMRS, GNU Health, ERP Interne).",
    )
    key_prefix = models.CharField(
        max_length=KEY_PREFIX_LENGTH,
        editable=False,
        verbose_name="Début de la clé",
        help_text="Permet d'identifier la clé sans la révéler.",
    )
    key_hash = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        verbose_name="Empreinte de la clé",
    )
    allow_beds = models.BooleanField(
        default=True,
        verbose_name="Synchronisation des lits",
        help_text="La clé peut mettre à jour les lits de l'établissement.",
    )
    allow_blood = models.BooleanField(
        default=True,
        verbose_name="Synchronisation des stocks de sang",
        help_text="La clé peut mettre à jour les stocks de sang de l'établissement.",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Actif",
        help_text="Désactiver révoque immédiatement l'accès pour ce connecteur.",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créée le")
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Dernière utilisation",
    )

    class Meta:
        verbose_name = "Clé API SIH"
        verbose_name_plural = "Clés API SIH"
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.key_hash:
            self.key = generate_sih_api_key()
            self.key_hash = hash_api_key(self.key)
            self.key_prefix = self.key[:KEY_PREFIX_LENGTH]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.facility.name} — {self.name} ({self.key_prefix}…)"


class HospitalSyncLog(models.Model):
    """Journal d'audit des flux d'interopérabilité SIH."""

    class SyncType(models.TextChoices):
        BEDS_SYNC = 'beds_sync', 'Synchronisation globale des lits'
        BEDS_EVENT = 'beds_event', 'Événement ADT de lit'
        BLOOD_SYNC = 'blood_sync', 'Synchronisation stocks sanguins'

    class Status(models.TextChoices):
        SUCCESS = 'success', 'Succès'
        ERROR = 'error', 'Erreur'

    facility = models.ForeignKey(
        HealthFacility,
        on_delete=models.CASCADE,
        related_name='sih_sync_logs',
        verbose_name="Établissement",
    )
    api_key = models.ForeignKey(
        HospitalApiKey,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sync_logs',
        verbose_name="Clé API utilisée",
    )
    sync_type = models.CharField(
        max_length=30,
        choices=SyncType.choices,
        verbose_name="Type de flux",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUCCESS,
        verbose_name="Statut",
    )
    items_count = models.PositiveIntegerField(
        default=0,
        verbose_name="Nombre d'éléments synchronisés",
    )
    details = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Détails du résultat",
    )
    error_message = models.TextField(
        blank=True,
        verbose_name="Message d'erreur",
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        verbose_name="Adresse IP",
    )
    duration_ms = models.FloatField(
        default=0.0,
        verbose_name="Durée d'exécution (ms)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Horodatage",
    )

    class Meta:
        verbose_name = "Journal de synchronisation SIH"
        verbose_name_plural = "Journaux de synchronisation SIH"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['facility', '-created_at'], name='idx_sih_fac_created'),
            models.Index(fields=['sync_type', 'status'], name='idx_sih_type_status'),
        ]

    def __str__(self):
        return f"[{self.created_at:%d/%m/%Y %H:%M}] {self.facility.name} - {self.get_sync_type_display()} ({self.status})"
