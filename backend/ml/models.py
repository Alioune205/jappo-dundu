"""
Modèles Django de l'application ML de Jappo Dundu.

- BloodStockRecord : historique quotidien des stocks (données d'entraînement)
- PredictionResult : prédictions de stock et niveau de risque de pénurie
- MLModelMetadata  : registre des modèles entraînés (un seul actif)

Auteur : El Hadji Massogui Diop
"""

from django.core.validators import MinValueValidator
from django.db import models, transaction

from .constants import BLOOD_GROUPS, REGIONS


class BloodStockRecord(models.Model):
    """Stock d'un groupe sanguin dans un centre de transfusion, à une date.

    Identité comptable attendue d'un jour à l'autre :
    stock(j) = stock(j-1) + dons(j) - utilisations(j) - péremptions(j).
    """

    # Conservés comme attributs de classe pour la compatibilité.
    BLOOD_GROUPS = BLOOD_GROUPS
    REGIONS = REGIONS

    class Source(models.TextChoices):
        SYNTHETIC = 'synthetic', 'Synthétique (simulation)'
        IMPORT = 'import', 'Import de fichier'
        MANUAL = 'manual', 'Saisie manuelle'

    center_name = models.CharField(
        max_length=200,
        verbose_name="Nom du centre de transfusion",
        help_text="Nom complet du centre de transfusion sanguine.",
    )
    region = models.CharField(
        max_length=50,
        choices=REGIONS,
        verbose_name="Région",
        help_text="Région administrative du Sénégal.",
    )
    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUPS,
        verbose_name="Groupe sanguin",
    )
    date = models.DateField(
        verbose_name="Date",
        help_text="Date de l'enregistrement du stock.",
    )
    units_available = models.PositiveIntegerField(
        verbose_name="Unités disponibles",
        help_text="Nombre de poches disponibles en fin de journée.",
    )
    units_donated = models.PositiveIntegerField(
        default=0,
        verbose_name="Unités reçues (dons)",
        help_text="Nombre de poches reçues par don ce jour.",
    )
    units_used = models.PositiveIntegerField(
        default=0,
        verbose_name="Unités utilisées",
        help_text="Nombre de poches utilisées (transfusions) ce jour.",
    )
    units_expired = models.PositiveIntegerField(
        default=0,
        verbose_name="Unités périmées",
        help_text="Nombre de poches périmées retirées ce jour.",
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        verbose_name="Source",
        help_text="Origine de la donnée (simulation, import, saisie).",
    )

    class Meta:
        verbose_name = "Enregistrement de stock sanguin"
        verbose_name_plural = "Enregistrements de stock sanguin"
        ordering = ['-date', 'region', 'blood_group']
        constraints = [
            models.UniqueConstraint(
                fields=['center_name', 'blood_group', 'date'],
                name='uniq_stock_center_group_date',
            ),
        ]
        indexes = [
            models.Index(
                fields=['region', 'blood_group', 'date'],
                name='idx_stock_region_group_date',
            ),
            models.Index(
                fields=['date'],
                name='idx_stock_date',
            ),
        ]

    def __str__(self):
        return (
            f"{self.center_name} — {self.blood_group} — "
            f"{self.date} — {self.units_available} unités"
        )


class PredictionResult(models.Model):
    """Prédiction du stock d'un centre/groupe sanguin pour une date future.

    Une seule prédiction courante par (centre, groupe, date) : une nouvelle
    exécution remplace la précédente.
    """

    RISK_LEVELS = [
        ('CRITICAL', 'Critique — Pénurie imminente'),
        ('WARNING', 'Attention — Stock bas'),
        ('NORMAL', 'Normal — Stock suffisant'),
    ]

    center_name = models.CharField(
        max_length=200,
        verbose_name="Centre de transfusion",
    )
    region = models.CharField(
        max_length=50,
        choices=REGIONS,
        verbose_name="Région",
    )
    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUPS,
        verbose_name="Groupe sanguin",
    )
    prediction_date = models.DateField(
        verbose_name="Date prédite",
        help_text="La date pour laquelle la prédiction est faite.",
    )
    predicted_units = models.FloatField(
        verbose_name="Unités prédites",
        validators=[MinValueValidator(0)],
        help_text="Stock prévu (poches) pour cette date.",
    )
    lower_bound = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Borne basse (P10)",
        help_text="Stock sous lequel la valeur réelle a 10 % de chances d'être.",
    )
    upper_bound = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Borne haute (P90)",
        help_text="Stock au-dessus duquel la valeur réelle a 10 % de chances d'être.",
    )
    days_of_supply = models.FloatField(
        null=True,
        blank=True,
        verbose_name="Jours de stock",
        help_text="Stock prévu divisé par la consommation quotidienne moyenne.",
    )
    risk_level = models.CharField(
        max_length=10,
        choices=RISK_LEVELS,
        verbose_name="Niveau de risque",
    )
    confidence_score = models.FloatField(
        default=0.0,
        verbose_name="Score de confiance",
        help_text="Probabilité estimée que le niveau de risque soit correct (0 à 1).",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Date de création",
    )
    model_version = models.CharField(
        max_length=50,
        default='1.0.0',
        verbose_name="Version du modèle",
    )

    class Meta:
        verbose_name = "Prédiction"
        verbose_name_plural = "Prédictions"
        ordering = ['prediction_date', 'risk_level']
        constraints = [
            models.UniqueConstraint(
                fields=['center_name', 'blood_group', 'prediction_date'],
                name='uniq_prediction_center_group_date',
            ),
        ]
        indexes = [
            models.Index(
                fields=['region', 'blood_group', 'prediction_date'],
                name='idx_pred_region_group_date',
            ),
            models.Index(
                fields=['risk_level', 'prediction_date'],
                name='idx_pred_risk_date',
            ),
        ]

    def __str__(self):
        return (
            f"Prédiction {self.center_name} — {self.blood_group} — "
            f"{self.prediction_date} — {self.risk_level}"
        )


class MLModelMetadata(models.Model):
    """Registre des modèles entraînés : métriques et fichier associé.

    Un seul modèle peut être actif (garanti en base par une contrainte).
    ``model_file_path`` contient le nom du fichier dans ``ML_MODEL_DIR``.
    """

    version = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Version",
    )
    algorithm = models.CharField(
        max_length=100,
        default='HistGradientBoostingRegressor',
        verbose_name="Algorithme",
    )
    trained_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Date d'entraînement",
    )
    training_samples = models.PositiveIntegerField(
        default=0,
        verbose_name="Nombre d'échantillons d'entraînement",
    )
    mae = models.FloatField(
        default=0.0,
        verbose_name="MAE (Mean Absolute Error)",
    )
    rmse = models.FloatField(
        default=0.0,
        verbose_name="RMSE (Root Mean Squared Error)",
    )
    r2_score = models.FloatField(
        default=0.0,
        verbose_name="R² Score",
    )
    metrics = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Métriques détaillées",
        help_text="Évaluation sur période de test (baseline, couverture, alertes).",
    )
    model_file_path = models.CharField(
        max_length=500,
        verbose_name="Fichier du modèle",
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Modèle actif",
        help_text="Indique si c'est le modèle utilisé pour les prédictions.",
    )
    notes = models.TextField(
        blank=True,
        default='',
        verbose_name="Notes",
    )

    class Meta:
        verbose_name = "Métadonnées du modèle ML"
        verbose_name_plural = "Métadonnées des modèles ML"
        ordering = ['-trained_at']
        constraints = [
            models.UniqueConstraint(
                fields=['is_active'],
                condition=models.Q(is_active=True),
                name='uniq_active_ml_model',
            ),
        ]

    def __str__(self):
        return (
            f"Modèle v{self.version} — R²={self.r2_score:.3f} — "
            f"{'Actif' if self.is_active else 'Inactif'}"
        )

    def save(self, *args, **kwargs):
        """Désactive les autres modèles si celui-ci est activé (atomique)."""
        with transaction.atomic():
            if self.is_active:
                MLModelMetadata.objects.filter(is_active=True).exclude(
                    pk=self.pk
                ).update(is_active=False)
            super().save(*args, **kwargs)
