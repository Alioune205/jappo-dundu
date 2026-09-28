"""
Tests de l'entraînement, du registre des modèles, de la prédiction, du
risque et des notifications.

Auteur : El Hadji Massogui Diop
"""

from datetime import timedelta
from unittest import mock

import joblib
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase, override_settings

from ml.models import MLModelMetadata, PredictionResult
from ml.services import registry, risk
from ml.services.notifications import critical_items_by_region
from ml.services.predictor import BloodShortagePredictor
from ml.services.registry import ModelNotAvailableError
from ml.services.trainer import BloodShortageTrainer

from .helpers import TEST_SERIES, TemporaryModelDirMixin, TrainedModelTestCase, small_history


class TrainingTests(TrainedModelTestCase):

    def test_metrics_are_complete_and_consistent(self):
        for key in ('mae', 'rmse', 'r2_score', 'baseline_mae', 'skill_vs_baseline',
                    'interval_coverage', 'risk_accuracy', 'baseline_risk_accuracy',
                    'critical_recall', 'baseline_critical_recall', 'critical_precision',
                    'by_horizon', 'training_samples', 'test_samples',
                    'calibration_samples', 'interval_adjustment',
                    'interval_coverage_uncalibrated'):
            self.assertIn(key, self.metrics)
        self.assertGreater(self.metrics['baseline_mae'], 0)
        self.assertTrue(0 <= self.metrics['interval_coverage'] <= 1)
        self.assertEqual(self.metrics['series'], TEST_SERIES)
        self.assertEqual(set(self.metrics['by_horizon']), {'1-3', '4-7', '8-14', '15-30'})

    def test_test_period_follows_training_period(self):
        self.assertGreater(self.metrics['test_period_start'], self.metrics['data_start'])
        self.assertLess(self.metrics['test_period_start'], self.metrics['data_end'])

    def test_model_is_registered_and_active(self):
        self.assertTrue(self.model.is_active)
        self.assertEqual(self.model.model_file_path, 'blood_shortage_vtest-1.joblib')
        self.assertTrue((self.model_dir / self.model.model_file_path).is_file())
        self.assertEqual(self.model.metrics['mae'], self.metrics['mae'])

    def test_bundle_content(self):
        bundle = registry.load_active_bundle()
        self.assertEqual(bundle['format_version'], registry.MODEL_FORMAT_VERSION)
        self.assertEqual(set(bundle['models']), {'point', 'lower', 'upper'})
        self.assertEqual(bundle['version'], 'test-1')
        self.assertEqual(
            round(bundle['interval_adjustment'], 4), self.metrics['interval_adjustment']
        )

    def test_version_rules(self):
        trainer = BloodShortageTrainer()
        trainer.models = {'point': None}
        with self.assertRaises(ValueError):
            trainer.save_model(version='test-1')  # déjà utilisée
        with self.assertRaises(ValueError):
            trainer.save_model(version='../../evil')

    def test_short_history_is_refused(self):
        with self.assertRaisesMessage(ValueError, 'Historique insuffisant'):
            BloodShortageTrainer(max_iter=10).train(small_history(days=60))

    def test_only_one_active_model(self):
        MLModelMetadata.objects.create(version='test-2', model_file_path='x.joblib')
        self.assertEqual(MLModelMetadata.objects.filter(is_active=True).count(), 1)
        self.assertEqual(MLModelMetadata.objects.get(is_active=True).version, 'test-2')

    def test_database_enforces_single_active_model(self):
        MLModelMetadata.objects.create(version='test-2', model_file_path='x.joblib', is_active=False)
        with self.assertRaises(IntegrityError), transaction.atomic():
            MLModelMetadata.objects.filter(version='test-2').update(is_active=True)


class RegistryTests(TrainedModelTestCase):

    def test_bundle_is_cached(self):
        self.assertIs(registry.load_active_bundle(), registry.load_active_bundle())

    def test_model_path_stays_inside_model_dir(self):
        for stored in ('../../etc/passwd', r'C:\Users\x\blood.joblib', '/abs/path/m.joblib'):
            resolved = registry.resolve_model_path(stored)
            self.assertEqual(resolved.parent, self.model_dir)

    def test_no_active_model(self):
        MLModelMetadata.objects.update(is_active=False)
        with self.assertRaises(ModelNotAvailableError):
            registry.load_active_bundle()
        self.assertEqual(registry.active_model_status(), {'status': 'not_trained'})

    def test_missing_model_file(self):
        MLModelMetadata.objects.filter(pk=self.model.pk).update(model_file_path='absent.joblib')
        with self.assertRaises(ModelNotAvailableError):
            registry.load_active_bundle()
        self.assertEqual(registry.active_model_status()['status'], 'missing_file')

    def test_obsolete_model_format_is_refused(self):
        joblib.dump({'model': 'random-forest-v1'}, self.model_dir / 'old.pkl')
        MLModelMetadata.objects.filter(pk=self.model.pk).update(model_file_path='old.pkl')
        with self.assertRaisesMessage(ModelNotAvailableError, 'format obsolète'):
            registry.load_active_bundle()


class PredictionTests(TrainedModelTestCase):

    def test_predictions_are_complete_and_coherent(self):
        run = BloodShortagePredictor().predict(days_ahead=7)
        self.assertEqual(run.count, TEST_SERIES * 7)
        self.assertEqual(run.skipped_series, 0)
        self.assertEqual(run.model_version, 'test-1')
        dates = {p['prediction_date'] for p in run.predictions}
        self.assertEqual(dates, {self.today + timedelta(days=d) for d in range(1, 8)})
        for p in run.predictions:
            self.assertLessEqual(p['lower_bound'], p['predicted_units'])
            self.assertLessEqual(p['predicted_units'], p['upper_bound'])
            self.assertGreaterEqual(p['lower_bound'], 0)
            self.assertIn(p['risk_level'], risk.RISK_LEVELS)
            self.assertTrue(0 <= p['confidence_score'] <= 1)
            self.assertGreaterEqual(p['days_of_supply'], 0)
        self.assertEqual(sum(run.risk_summary().values()), run.count)

    def test_filters(self):
        run = BloodShortagePredictor().predict(region='thies', blood_group='O+', days_ahead=3)
        self.assertEqual(run.count, 3)
        self.assertTrue(all(p['region'] == 'thies' for p in run.predictions))

    def test_invalid_horizon(self):
        for days in (0, 31):
            with self.assertRaises(ValueError):
                BloodShortagePredictor().predict(days_ahead=days)

    def test_stale_data_produces_no_prediction(self):
        run = BloodShortagePredictor(today=self.today + timedelta(days=40)).predict()
        self.assertEqual(run.count, 0)
        self.assertEqual(run.skipped_series, TEST_SERIES)

    def test_save_replaces_previous_run(self):
        predictor = BloodShortagePredictor()
        predictor.predict_and_save(days_ahead=7, notify=False)
        predictor.predict_and_save(days_ahead=7, notify=False)
        self.assertEqual(PredictionResult.objects.count(), TEST_SERIES * 7)

    def test_scoped_run_keeps_other_regions(self):
        predictor = BloodShortagePredictor()
        predictor.predict_and_save(days_ahead=5, notify=False)
        thies_ids = set(PredictionResult.objects.filter(region='thies').values_list('id', flat=True))

        predictor.predict_and_save(region='dakar', days_ahead=5, notify=False)
        self.assertEqual(
            set(PredictionResult.objects.filter(region='thies').values_list('id', flat=True)),
            thies_ids,
        )
        self.assertEqual(PredictionResult.objects.count(), TEST_SERIES * 5)

    def test_results_are_broadcast_after_commit(self):
        with mock.patch('ml.services.notifications.broadcast_dashboard') as dashboard, \
                mock.patch('ml.services.notifications.broadcast_alert') as alert, \
                self.captureOnCommitCallbacks(execute=True) as callbacks:
            run = BloodShortagePredictor().predict_and_save(days_ahead=7)
        self.assertEqual(len(callbacks), 1)
        dashboard.assert_called_once()
        kind, payload = dashboard.call_args.args
        self.assertEqual(kind, 'prediction')
        self.assertEqual(payload['risk_summary'], run.risk_summary())
        critical_regions = {p['region'] for p in run.predictions if p['risk_level'] == 'CRITICAL'}
        self.assertEqual({c.kwargs['region'] for c in alert.call_args_list}, critical_regions)


class NotificationContentTests(SimpleTestCase):

    def test_first_critical_date_per_stock(self):
        from datetime import date

        def prediction(day, group, level, region='dakar'):
            return {
                'center_name': 'CNTS Dakar', 'region': region, 'blood_group': group,
                'prediction_date': date(2026, 10, day), 'predicted_units': 1.0,
                'days_of_supply': 0.5, 'confidence_score': 0.9, 'risk_level': level,
            }

        items = critical_items_by_region([
            prediction(3, 'O-', 'CRITICAL'),
            prediction(2, 'O-', 'CRITICAL'),
            prediction(1, 'O-', 'WARNING'),
            prediction(5, 'A+', 'NORMAL'),
        ])
        self.assertEqual(list(items), ['dakar'])
        self.assertEqual(len(items['dakar']), 1)
        self.assertEqual(items['dakar'][0]['first_critical_date'].day, 2)


class RiskTests(SimpleTestCase):

    def test_classification_uses_days_of_supply(self):
        levels = risk.classify([1.9, 2.0, 4.9, 5.0, 100], [1, 1, 1, 1, 1], 2, 5)
        self.assertEqual(list(levels), ['CRITICAL', 'WARNING', 'WARNING', 'NORMAL', 'NORMAL'])
        # 10 poches : pénurie pour une forte consommation, confortable sinon
        self.assertEqual(list(risk.classify([10, 10], [20, 0.5], 2, 5)), ['CRITICAL', 'NORMAL'])

    def test_confidence_is_a_probability_distribution(self):
        point, lower, upper, demand = [6.0], [3.0], [9.0], [1.0]
        total = sum(
            risk.confidence(point, lower, upper, demand, [level], 2, 5)[0]
            for level in risk.RISK_LEVELS
        )
        self.assertAlmostEqual(total, 1.0)
        narrow = risk.confidence([50.0], [49.0], [51.0], [1.0], ['NORMAL'], 2, 5)[0]
        self.assertGreater(narrow, 0.99)

    @override_settings(ML_SHORTAGE_CRITICAL_DAYS=5, ML_SHORTAGE_WARNING_DAYS=2)
    def test_inconsistent_thresholds_are_refused(self):
        with self.assertRaises(ValueError):
            risk.thresholds()


class NoModelTests(TemporaryModelDirMixin, TestCase):

    def test_prediction_without_model(self):
        with self.assertRaises(ModelNotAvailableError):
            BloodShortagePredictor().predict()
