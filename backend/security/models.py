"""
Modèles de l'application Security.

- AuditEvent      : journal d'audit consultable (qui a vu ou fait quoi, quand).
- EmergencyAccess : accès d'urgence (« bris de glace ») limité dans le temps.
- TwoFactor       : double authentification (codes TOTP à 6 chiffres).

Auteur : El Hadji Massogui Diop
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    """Action sensible tracée : consultation de données personnelles, accès d'urgence, rôles…"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    action = models.CharField(max_length=60, db_index=True, verbose_name="Action")
    target_type = models.CharField(max_length=40, blank=True, verbose_name="Objet")
    target_id = models.CharField(max_length=40, blank=True, verbose_name="Identifiant")
    facility = models.ForeignKey(
        'users.HealthFacility', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Événement d'audit"
        verbose_name_plural = "Journal d'audit"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.user} {self.action}"


class EmergencyAccess(models.Model):
    """Accès d'urgence : un administrateur de domaine agit pour un autre établissement.

    Motif obligatoire, durée limitée (``EMERGENCY_ACCESS_MINUTES``), journalisé
    et visible par l'administrateur général. À n'utiliser que si la vie d'un
    patient en dépend et que l'établissement concerné ne répond pas.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='emergency_accesses')
    facility = models.ForeignKey('users.HealthFacility', on_delete=models.CASCADE, related_name='+')
    domain = models.CharField(max_length=20, verbose_name="Domaine")
    reason = models.CharField(max_length=255, verbose_name="Motif")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Accès d'urgence"
        verbose_name_plural = "Accès d'urgence"
        ordering = ['-created_at']

    @property
    def is_active(self):
        return self.revoked_at is None and self.expires_at > timezone.now()


class TwoFactor(models.Model):
    """Double authentification d'un compte (application d'authentification, TOTP)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='two_factor')
    secret = models.CharField(max_length=64)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(default=0)

    class Meta:
        verbose_name = "Double authentification"
        verbose_name_plural = "Doubles authentifications"

    @property
    def enabled(self):
        return self.confirmed_at is not None
