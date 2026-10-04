"""
Modèles de l'application Identity.

- SocialAccount     : compte Google, Facebook ou Apple lié à un utilisateur ;
- PasswordResetCode : code à usage unique pour réinitialiser un mot de passe
  (seule son empreinte est stockée).

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class SocialAccount(models.Model):
    """Identité externe (« sub » du fournisseur) rattachée à un compte."""

    class Provider(models.TextChoices):
        GOOGLE = 'google', 'Google'
        FACEBOOK = 'facebook', 'Facebook'
        APPLE = 'apple', 'Apple'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='social_accounts',
        verbose_name="Utilisateur",
    )
    provider = models.CharField(max_length=16, choices=Provider.choices, verbose_name="Fournisseur")
    uid = models.CharField(max_length=255, verbose_name="Identifiant chez le fournisseur")
    email = models.EmailField(blank=True, verbose_name="E-mail communiqué")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Lié le")
    last_login_at = models.DateTimeField(default=timezone.now, verbose_name="Dernière connexion")

    class Meta:
        verbose_name = "Compte social"
        verbose_name_plural = "Comptes sociaux"
        constraints = [
            models.UniqueConstraint(fields=['provider', 'uid'], name='uniq_social_provider_uid'),
        ]

    def __str__(self):
        return f"{self.get_provider_display()} · {self.user}"


class PasswordResetCode(models.Model):
    """Code de réinitialisation : 6 chiffres, 15 minutes, 5 essais."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='password_reset_codes',
        verbose_name="Utilisateur",
    )
    code_hash = models.CharField(max_length=64, verbose_name="Empreinte du code")
    channels = models.CharField(max_length=32, blank=True, verbose_name="Canaux d'envoi")
    attempts = models.PositiveSmallIntegerField(default=0, verbose_name="Essais")
    expires_at = models.DateTimeField(verbose_name="Expire le")
    used_at = models.DateTimeField(null=True, blank=True, verbose_name="Utilisé le")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Créé le")

    class Meta:
        verbose_name = "Code de réinitialisation"
        verbose_name_plural = "Codes de réinitialisation"
        indexes = [models.Index(fields=['user', '-created_at'], name='idx_reset_user_recent')]

    @property
    def is_usable(self):
        return self.used_at is None and self.expires_at > timezone.now()
