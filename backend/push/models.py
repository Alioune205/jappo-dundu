"""
Téléphones enregistrés pour les notifications push.

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.conf import settings
from django.db import models


class PushDevice(models.Model):
    """Jeton push Expo d'un téléphone (un compte peut en avoir plusieurs)."""

    class Platform(models.TextChoices):
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'
        WEB = 'web', 'Web'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='push_devices',
        verbose_name="Utilisateur",
    )
    token = models.CharField(
        max_length=255,
        unique=True,
        verbose_name="Jeton push",
        help_text="Jeton Expo, ex. ExponentPushToken[xxxxxxxx].",
    )
    platform = models.CharField(max_length=10, choices=Platform.choices, verbose_name="Plateforme")
    is_active = models.BooleanField(
        default=True,
        verbose_name="Actif",
        help_text="Désactivé à la déconnexion ou quand le service push signale l'application désinstallée.",
    )
    last_error = models.CharField(max_length=100, blank=True, verbose_name="Dernière erreur")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Enregistré le")
    last_seen_at = models.DateTimeField(auto_now=True, verbose_name="Vu le")

    class Meta:
        verbose_name = "Téléphone (push)"
        verbose_name_plural = "Téléphones (push)"
        ordering = ['-last_seen_at']
        indexes = [models.Index(fields=['user', 'is_active'], name='idx_push_user_active')]

    def __str__(self):
        return f"{self.get_platform_display()} — {self.user}"
