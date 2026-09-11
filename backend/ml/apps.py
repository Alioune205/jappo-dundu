from django.apps import AppConfig


class MlConfig(AppConfig):
    """Configuration de l'application ML.

    Gère la prédiction des pénuries de sang via des modèles
    de machine learning entraînés sur les données historiques
    de stock sanguin du Sénégal.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ml'
    verbose_name = 'Machine Learning & Prédictions'
