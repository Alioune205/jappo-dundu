"""
Services ML de Jappo Dundu.

- data_generator   : simulation de l'historique des stocks
- importer         : import CSV de l'historique réel
- forecasting      : features partagées entraînement / prédiction
- trainer          : entraînement et évaluation
- predictor        : prédiction et enregistrement
- registry         : stockage et chargement des modèles
- risk             : niveaux de risque et confiance
- notifications    : diffusion temps réel des résultats

Auteur : El Hadji Massogui Diop
"""

from .data_generator import BloodDataGenerator
from .predictor import BloodShortagePredictor
from .registry import ModelNotAvailableError
from .trainer import BloodShortageTrainer

__all__ = [
    'BloodDataGenerator',
    'BloodShortagePredictor',
    'BloodShortageTrainer',
    'ModelNotAvailableError',
]
