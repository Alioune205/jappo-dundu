"""
Outils partagés par les tests ML.

Auteur : El Hadji Massogui Diop
"""

import shutil
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from django.utils import timezone

from ml.services import registry
from ml.services.data_generator import CENTER_CATALOG, BloodDataGenerator
from ml.services.trainer import BloodShortageTrainer

# Deux centres (Dakar, Thiès) × 8 groupes = 16 séries : rapide et suffisant.
TEST_CENTERS = (CENTER_CATALOG[0], CENTER_CATALOG[3])
TEST_SERIES = len(TEST_CENTERS) * 8


def small_history(days=200, end_date=None, seed=7):
    """Historique simulé court, se terminant aujourd'hui par défaut."""
    return BloodDataGenerator(seed=seed, centers=TEST_CENTERS).generate(
        end_date=end_date or timezone.localdate(), days=days
    )


class TemporaryModelDirMixin:
    """ML_MODEL_DIR pointe vers un dossier temporaire propre à la classe."""

    @classmethod
    def setUpClass(cls):
        cls.model_dir = Path(tempfile.mkdtemp(prefix='jappo-ml-'))
        cls._model_dir_override = override_settings(ML_MODEL_DIR=cls.model_dir)
        cls._model_dir_override.enable()
        registry.clear_cache()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._model_dir_override.disable()
        registry.clear_cache()
        shutil.rmtree(cls.model_dir, ignore_errors=True)


class TrainedModelTestCase(TemporaryModelDirMixin, TestCase):
    """Historique en base et modèle entraîné, sauvegardé et actif."""

    @classmethod
    def setUpTestData(cls):
        history = small_history()
        BloodDataGenerator.save_to_db(history)
        trainer = BloodShortageTrainer(max_iter=40, seed=1)
        cls.metrics = trainer.train(history)
        cls.model = trainer.save_model(version='test-1')
        cls.today = timezone.localdate()
