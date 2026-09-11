"""
Tests de l'application ML.

Couvre :
- La génération de données synthétiques
- Le feature engineering
- L'entraînement du modèle
- Les prédictions
- Les endpoints API
- Les modèles Django

Auteur : El Hadji Massogui Diop
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import BloodStockRecord, MLModelMetadata, PredictionResult
from .services.data_generator import BloodDataGenerator

User = get_user_model()


class BloodDataGeneratorTestCase(TestCase):
    """Tests du générateur de données synthétiques."""

    def test_generate_returns_dataframe(self):
        """Le générateur retourne un DataFrame non vide."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=30)
        self.assertGreater(len(df), 0)

    def test_generate_has_correct_columns(self):
        """Le DataFrame généré contient toutes les colonnes requises."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=7)
        expected_columns = {
            'center_name', 'region', 'blood_group', 'date',
            'units_available', 'units_donated', 'units_used',
            'units_expired',
        }
        self.assertTrue(expected_columns.issubset(set(df.columns)))

    def test_generate_all_regions_present(self):
        """Toutes les 14 régions du Sénégal sont représentées."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=7)
        self.assertEqual(df['region'].nunique(), 14)

    def test_generate_all_blood_groups_present(self):
        """Les 8 groupes sanguins sont représentés."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=7)
        self.assertEqual(df['blood_group'].nunique(), 8)

    def test_generate_no_negative_values(self):
        """Aucune valeur de stock n'est négative."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=30)
        self.assertTrue((df['units_available'] >= 0).all())
        self.assertTrue((df['units_donated'] >= 0).all())
        self.assertTrue((df['units_used'] >= 0).all())
        self.assertTrue((df['units_expired'] >= 0).all())

    def test_generate_reproducible_with_seed(self):
        """Le même seed produit les mêmes données."""
        gen1 = BloodDataGenerator(seed=123)
        gen2 = BloodDataGenerator(seed=123)
        df1 = gen1.generate(days=7)
        df2 = gen2.generate(days=7)
        self.assertTrue(df1.equals(df2))

    def test_save_to_db(self):
        """Les données sont correctement sauvegardées en base."""
        generator = BloodDataGenerator(seed=42)
        df = generator.generate(days=3)
        count = generator.save_to_db(df)
        self.assertEqual(count, len(df))
        self.assertEqual(BloodStockRecord.objects.count(), len(df))


class BloodStockRecordModelTestCase(TestCase):
    """Tests du modèle BloodStockRecord."""

    def test_create_record(self):
        """Un enregistrement de stock peut être créé."""
        record = BloodStockRecord.objects.create(
            center_name='CNTS Dakar',
            region='dakar',
            blood_group='O+',
            date=date.today(),
            units_available=50,
            units_donated=10,
            units_used=5,
            units_expired=1,
        )
        self.assertEqual(record.center_name, 'CNTS Dakar')
        self.assertEqual(record.units_available, 50)

    def test_unique_constraint(self):
        """La contrainte d'unicité (center, blood_group, date) fonctionne."""
        BloodStockRecord.objects.create(
            center_name='CNTS Dakar',
            region='dakar',
            blood_group='O+',
            date=date.today(),
            units_available=50,
        )
        with self.assertRaises(Exception):
            BloodStockRecord.objects.create(
                center_name='CNTS Dakar',
                region='dakar',
                blood_group='O+',
                date=date.today(),
                units_available=60,
            )

    def test_str_representation(self):
        """La représentation string est correcte."""
        record = BloodStockRecord(
            center_name='CTS Thiès',
            blood_group='A+',
            date=date(2025, 1, 15),
            units_available=30,
        )
        self.assertIn('CTS Thiès', str(record))
        self.assertIn('A+', str(record))


class PredictionResultModelTestCase(TestCase):
    """Tests du modèle PredictionResult."""

    def test_create_prediction(self):
        """Une prédiction peut être créée."""
        prediction = PredictionResult.objects.create(
            center_name='CNTS Dakar',
            region='dakar',
            blood_group='O+',
            prediction_date=date.today() + timedelta(days=3),
            predicted_units=12.5,
            risk_level='WARNING',
            confidence_score=0.85,
            model_version='1.0.0',
        )
        self.assertEqual(prediction.risk_level, 'WARNING')
        self.assertEqual(prediction.predicted_units, 12.5)


class MLModelMetadataTestCase(TestCase):
    """Tests du modèle MLModelMetadata."""

    def test_create_model_metadata(self):
        """Les métadonnées du modèle peuvent être créées."""
        metadata = MLModelMetadata.objects.create(
            version='1.0.0',
            algorithm='RandomForestRegressor',
            training_samples=10000,
            mae=2.5,
            rmse=3.2,
            r2_score=0.92,
            model_file_path='/path/to/model.pkl',
            is_active=True,
        )
        self.assertTrue(metadata.is_active)

    def test_only_one_active_model(self):
        """Un seul modèle peut être actif à la fois."""
        MLModelMetadata.objects.create(
            version='1.0.0',
            training_samples=10000,
            mae=2.5,
            rmse=3.2,
            r2_score=0.90,
            model_file_path='/path/to/model_v1.pkl',
            is_active=True,
        )
        MLModelMetadata.objects.create(
            version='2.0.0',
            training_samples=15000,
            mae=2.0,
            rmse=2.8,
            r2_score=0.95,
            model_file_path='/path/to/model_v2.pkl',
            is_active=True,
        )
        # Seul le dernier doit être actif
        active_count = MLModelMetadata.objects.filter(is_active=True).count()
        self.assertEqual(active_count, 1)
        active_model = MLModelMetadata.objects.get(is_active=True)
        self.assertEqual(active_model.version, '2.0.0')


class MLAPITestCase(TestCase):
    """Tests des endpoints API ML."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='TestPass123!',
        )
        self.client.force_authenticate(user=self.user)

        # Créer des prédictions de test
        PredictionResult.objects.create(
            center_name='CNTS Dakar',
            region='dakar',
            blood_group='O+',
            prediction_date=date.today() + timedelta(days=1),
            predicted_units=3.0,
            risk_level='CRITICAL',
            confidence_score=0.9,
            model_version='test',
        )
        PredictionResult.objects.create(
            center_name='CTS Thiès',
            region='thies',
            blood_group='A+',
            prediction_date=date.today() + timedelta(days=1),
            predicted_units=25.0,
            risk_level='NORMAL',
            confidence_score=0.85,
            model_version='test',
        )

    def test_predictions_list(self):
        """L'endpoint de listing des prédictions retourne 200."""
        response = self.client.get('/api/ml/predictions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_predictions_filter_by_region(self):
        """Les prédictions peuvent être filtrées par région."""
        response = self.client.get('/api/ml/predictions/?region=dakar')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for pred in response.data.get('results', response.data):
            self.assertEqual(pred['region'], 'dakar')

    def test_predictions_filter_by_risk(self):
        """Les prédictions peuvent être filtrées par niveau de risque."""
        response = self.client.get(
            '/api/ml/predictions/?risk_level=CRITICAL'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_predictions_summary(self):
        """Le résumé par région fonctionne."""
        response = self.client.get('/api/ml/predictions/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_model_info_no_model(self):
        """Sans modèle entraîné, retourne 404."""
        response = self.client.get('/api/ml/model-info/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_model_info_with_model(self):
        """Avec un modèle actif, retourne 200."""
        MLModelMetadata.objects.create(
            version='test-1.0',
            training_samples=1000,
            mae=2.0,
            rmse=3.0,
            r2_score=0.9,
            model_file_path='test.pkl',
            is_active=True,
        )
        response = self.client.get('/api/ml/model-info/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'active')

    def test_unauthenticated_access_denied(self):
        """Les requêtes non authentifiées sont rejetées."""
        self.client.logout()
        response = self.client.get('/api/ml/predictions/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_stocks_list(self):
        """L'endpoint de listing des stocks retourne 200."""
        BloodStockRecord.objects.create(
            center_name='CNTS Dakar',
            region='dakar',
            blood_group='O+',
            date=date.today(),
            units_available=50,
        )
        response = self.client.get('/api/ml/stocks/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
