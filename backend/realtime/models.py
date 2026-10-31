"""
Alertes critiques à accuser réception.

Une alerte critique (mission critique ou SOS non pris en charge, pré-alerte
sans réponse, commande de poches critique non acceptée) doit être vue. Si
personne n'en accuse réception à temps, elle est relancée par SMS : d'abord
la ligne de garde de l'établissement, puis l'administrateur général
(realtime/escalation.py).

Auteur : El Hadji Massogui Diop
"""

from django.conf import settings
from django.db import models


class CriticalAlert(models.Model):
    class Kind(models.TextChoices):
        MISSION = 'mission', "Mission critique à prendre en charge"
        PREALERT = 'prealert', "Pré-alerte sans réponse"
        BLOOD_ORDER = 'blood_order', "Commande de poches critique"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    target_type = models.CharField(max_length=40)
    target_id = models.PositiveIntegerField()
    facility = models.ForeignKey(
        'users.HealthFacility', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        verbose_name="Établissement qui doit répondre",
    )
    region = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=120)
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    # 0 : aucune relance ; 1 : ligne de garde prévenue ; 2 : administrateur général prévenu.
    escalation_level = models.PositiveSmallIntegerField(default=0)
    escalated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Alerte critique"
        verbose_name_plural = "Alertes critiques"
        ordering = ['-created_at']
        indexes = [models.Index(fields=['acknowledged_at', 'created_at'], name='idx_critical_open')]
        constraints = [
            models.UniqueConstraint(
                fields=['kind', 'target_type', 'target_id'],
                condition=models.Q(acknowledged_at__isnull=True),
                name='uniq_open_critical_alert',
            )
        ]

    def __str__(self):
        return f"{self.title} ({'accusée' if self.acknowledged_at else 'en attente'})"
