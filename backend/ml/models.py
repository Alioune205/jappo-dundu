"""
Modèles Django pour l'application ML de Jappo Dundu.

Stocke les données nécessaires au système de prédiction des pénuries
de sang : historique des stocks, résultats des prédictions et
métadonnées des modèles entraînés.

Auteur : El Hadji Massogui Diop
"""

from django.db import models
from django.core.validators import MinValueValidator


class BloodStockRecord(models.Model):
    """Enregistrement quotidien du stock de sang d'un centre.

    Chaque ligne représente le stock d'un groupe sanguin
    dans un centre de transfusion à une date donnée.
    Ces données servent à entraîner le modèle de prédiction.
    """

    BLOOD_GROUPS = [
        ('A+', 'A Positif'),
        ('A-', 'A Négatif'),
        ('B+', 'B Positif'),
        ('B-', 'B Négatif'),
        ('AB+', 'AB Positif'),
        ('AB-', 'AB Négatif'),
        ('O+', 'O Positif'),
        ('O-', 'O Négatif'),
    ]

    REGIONS = [
        ('dakar', 'Dakar'),
        ('thies', 'Thiès'),
        ('saint_louis', 'Saint-Louis'),
        ('kaolack', 'Kaolack'),
        ('ziguinchor', 'Ziguinchor'),
        ('tambacounda', 'Tambacounda'),
        ('louga', 'Louga'),
        ('fatick', 'Fatick'),
        ('kolda', 'Kolda'),
        ('matam', 'Matam'),
        ('kaffrine', 'Kaffrine'),
        ('kedougou', 'Kédougou'),
        ('sedhiou', 'Sédhiou'),
        ('diourbel', 'Diourbel'),
    ]

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
        help_text="Nombre de poches de sang disponibles.",
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

    class Meta:
        verbose_name = "Enregistrement de stock sanguin"
        verbose_name_plural = "Enregistrements de stock sanguin"
        ordering = ['-date', 'region', 'blood_group']
        unique_together = ['center_name', 'blood_group', 'date']
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
    """Résultat d'une prédiction de stock de sang.

    Stocke les prédictions générées par le modèle ML pour
    chaque centre, groupe sanguin et date future.
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
        choices=BloodStockRecord.REGIONS,
        verbose_name="Région",
    )
    blood_group = models.CharField(
        max_length=3,
        choices=BloodStockRecord.BLOOD_GROUPS,
        verbose_name="Groupe sanguin",
    )
    prediction_date = models.DateField(
        verbose_name="Date prédite",
        help_text="La date pour laquelle la prédiction est faite.",
    )
    predicted_units = models.FloatField(
        verbose_name="Unités prédites",
        validators=[MinValueValidator(0)],
        help_text="Nombre d'unités de sang prédit pour cette date.",
    )
    risk_level = models.CharField(
        max_length=10,
        choices=RISK_LEVELS,
        verbose_name="Niveau de risque",
    )
    confidence_score = models.FloatField(
        default=0.0,
        verbose_name="Score de confiance",
        help_text="Confiance du modèle dans cette prédiction (0 à 1).",
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
        ordering = ['-created_at', 'risk_level']
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
    """Métadonnées du modèle ML entraîné.

    Garde une trace de chaque version du modèle entraîné,
    avec ses métriques de performance et son chemin de stockage.
    """

    version = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Version",
    )
    algorithm = models.CharField(
        max_length=100,
        default='RandomForestRegressor',
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
    model_file_path = models.CharField(
        max_length=500,
        verbose_name="Chemin du fichier modèle",
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

    def __str__(self):
        return (
            f"Modèle v{self.version} — R²={self.r2_score:.3f} — "
            f"{'Actif' if self.is_active else 'Inactif'}"
        )

    def save(self, *args, **kwargs):
        """Désactive les autres modèles si celui-ci est activé."""
        if self.is_active:
            MLModelMetadata.objects.filter(is_active=True).exclude(
                pk=self.pk
            ).update(is_active=False)
        super().save(*args, **kwargs)
