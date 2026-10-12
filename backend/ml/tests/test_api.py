"""
Tests de l'API REST ML : permissions, filtres, validation, prédiction à la
demande et limitation de débit.

Auteur : El Hadji Massogui Diop
"""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from ml.models import MLModelMetadata, PredictionResult
from ml.services import jobs

from .helpers import TEST_SERIES, TrainedModelTestCase

User = get_user_model()

ENDPOINTS = (
    '/api/ml/predictions/',
    '/api/ml/predictions/summary/',
    '/api/ml/model-info/',
    '/api/ml/stocks/',
)


@override_settings(ML_PREDICT_ASYNC=False)
class MLAPITestCase(TrainedModelTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        call_command('setup_roles', stdout=StringIO())
        # Les scénarios portent sur des données nationales (toutes les séries,
        # stocks du CNTS) : périmètre de l'administrateur général. Les autres
        # rôles sont limités à leur établissement (security/tests_access_audit.py).
        cls.national = User.objects.create_user('national', is_staff=True)
        cls.hospital = User.objects.create_user('hospital')
        cls.hospital.groups.add(Group.objects.get(name='hospital_staff'))
        cls.donor = User.objects.create_user('donor')
        cls.donor.groups.add(Group.objects.get(name='donor'))

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(self.national)

    def predict(self, **payload):
        with mock.patch('ml.services.notifications.broadcast_dashboard'), \
                mock.patch('ml.services.notifications.broadcast_alert'):
            return self.client.post('/api/ml/predict/', payload, format='json')


class PermissionTests(MLAPITestCase):

    def test_anonymous_is_rejected(self):
        self.client.force_authenticate(None)
        for url in ENDPOINTS:
            self.assertEqual(self.client.get(url).status_code, 401, url)
        self.assertEqual(self.client.post('/api/ml/predict/').status_code, 401)

    def test_donor_is_forbidden(self):
        self.client.force_authenticate(self.donor)
        for url in ENDPOINTS:
            self.assertEqual(self.client.get(url).status_code, 403, url)
        self.assertEqual(self.client.post('/api/ml/predict/').status_code, 403)

    def test_hospital_staff_is_allowed(self):
        self.client.force_authenticate(self.hospital)
        for url in ENDPOINTS:
            self.assertEqual(self.client.get(url).status_code, 200, url)


class PredictEndpointTests(MLAPITestCase):

    def test_predict_then_list(self):
        response = self.predict(days_ahead=7)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['status'], 'succeeded')
        self.assertEqual(response.data['predictions_count'], TEST_SERIES * 7)
        self.assertEqual(response.data['model_version'], 'test-1')
        self.assertEqual(sum(response.data['risk_summary'].values()), TEST_SERIES * 7)

        listing = self.client.get('/api/ml/predictions/?region=dakar')
        self.assertEqual(listing.data['count'], 8 * 7)
        first = listing.data['results'][0]
        for field in ('lower_bound', 'upper_bound', 'days_of_supply', 'risk_level_display'):
            self.assertIn(field, first)

    def test_invalid_parameters(self):
        self.assertEqual(self.predict(days_ahead=0).status_code, 400)
        self.assertEqual(self.predict(days_ahead=31).status_code, 400)
        self.assertEqual(self.predict(region='atlantis').status_code, 400)

    def test_service_unavailable_without_model(self):
        MLModelMetadata.objects.update(is_active=False)
        response = self.predict()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertNotIn(str(self.model_dir), response.data['detail'])

    def test_predict_is_rate_limited(self):
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'ml_predict': '1/hour'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates):
            self.assertEqual(self.predict(days_ahead=1).status_code, 202)
            self.assertEqual(self.predict(days_ahead=1).status_code, 429)


class PredictionJobTests(MLAPITestCase):
    """Suivi des prédictions exécutées en arrière-plan."""

    def test_job_status_is_readable_by_its_author(self):
        job = self.predict(days_ahead=2).data
        response = self.client.get(f"/api/ml/predict/{job['job_id']}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'succeeded')
        self.assertEqual(response.data['predictions_count'], TEST_SERIES * 2)
        self.assertTrue(job['status_url'].endswith(f"/api/ml/predict/{job['job_id']}/"))

    def test_job_is_hidden_from_other_users(self):
        job = self.predict(days_ahead=2).data
        other = User.objects.create_user('autre')
        other.groups.add(Group.objects.get(name='hospital_staff'))
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"/api/ml/predict/{job['job_id']}/").status_code, 404)

    def test_unknown_job(self):
        self.assertEqual(self.client.get('/api/ml/predict/inconnu/').status_code, 404)

    def test_failure_is_reported_on_the_job(self):
        with mock.patch(
            'ml.services.predictor.BloodShortagePredictor.predict_and_save',
            side_effect=RuntimeError('séries incohérentes'),
        ):
            response = self.predict(days_ahead=2)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['status'], 'failed')
        self.assertEqual(response.data['message'], 'séries incohérentes')

    @override_settings(ML_PREDICT_ASYNC=True)
    def test_async_request_returns_before_the_computation(self):
        with mock.patch('ml.services.jobs._get_executor') as executor:
            response = self.predict(days_ahead=3)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['status'], 'pending')
        self.assertNotIn('predictions_count', response.data)
        executor.return_value.submit.assert_called_once()

    @override_settings(ML_PREDICT_ASYNC=True)
    def test_identical_pending_request_is_not_duplicated(self):
        with mock.patch('ml.services.jobs._get_executor') as executor:
            first = self.predict(days_ahead=3).data
            second = self.predict(days_ahead=3).data
            other_scope = self.predict(days_ahead=4).data
        self.assertEqual(first['job_id'], second['job_id'])
        self.assertNotEqual(first['job_id'], other_scope['job_id'])
        self.assertEqual(executor.return_value.submit.call_count, 2)

    @override_settings(ML_PREDICT_ASYNC=True, ML_JOB_STALE_SECONDS=60)
    def test_lost_job_does_not_block_its_scope(self):
        # Processus redémarré pendant le calcul : la tâche reste « pending » en cache.
        with mock.patch('ml.services.jobs._get_executor') as executor:
            lost = self.predict(days_ahead=3).data
            self.assertEqual(self.predict(days_ahead=3).data['job_id'], lost['job_id'])
            later = timezone.now() + timedelta(minutes=5)
            with mock.patch('ml.services.jobs.timezone.now', return_value=later):
                retried = self.predict(days_ahead=3).data
        self.assertNotEqual(retried['job_id'], lost['job_id'])
        self.assertEqual(executor.return_value.submit.call_count, 2)
        self.assertEqual(jobs.get_job(lost['job_id'])['status'], jobs.FAILED)


class ListingTests(MLAPITestCase):

    def create_prediction(self, days_from_today, risk_level='NORMAL', region='dakar'):
        return PredictionResult.objects.create(
            center_name=f'Centre {days_from_today}{risk_level}{region}',
            region=region,
            blood_group='O+',
            prediction_date=self.today + timedelta(days=days_from_today),
            predicted_units=10,
            risk_level=risk_level,
        )

    def test_past_predictions_hidden_by_default(self):
        self.create_prediction(-3)
        self.create_prediction(2)
        self.assertEqual(self.client.get('/api/ml/predictions/').data['count'], 1)
        self.assertEqual(
            self.client.get('/api/ml/predictions/?include_past=true').data['count'], 2
        )

    def test_filters_are_validated(self):
        for query in ('region=atlantis', 'blood_group=Z+', 'risk_level=panic'):
            self.assertEqual(self.client.get(f'/api/ml/predictions/?{query}').status_code, 400)
        self.create_prediction(1, 'CRITICAL')
        self.create_prediction(1, 'NORMAL')
        response = self.client.get('/api/ml/predictions/?risk_level=critical')
        self.assertEqual(response.data['count'], 1)

    def test_summary_orders_most_critical_first(self):
        self.create_prediction(1, 'CRITICAL', region='kolda')
        self.create_prediction(2, 'CRITICAL', region='kolda')
        self.create_prediction(1, 'WARNING', region='thies')
        data = self.client.get('/api/ml/predictions/summary/').data
        self.assertEqual(data[0]['region'], 'kolda')
        self.assertEqual(data[0]['critical_count'], 2)
        self.assertEqual(data[0]['region_display'], 'Kolda')

    def test_model_info(self):
        data = self.client.get('/api/ml/model-info/').data
        self.assertEqual(data['status'], 'active')
        self.assertIn('baseline_mae', data['model']['metrics'])
        # Historique de test entièrement simulé : l'API doit le dire.
        self.assertEqual(data['training_data']['synthetic_share'], 1.0)
        MLModelMetadata.objects.update(is_active=False)
        self.assertEqual(self.client.get('/api/ml/model-info/').status_code, 404)

    def test_stock_history(self):
        response = self.client.get('/api/ml/stocks/?days=7&region=thies')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 8 * 8)  # 8 groupes × 8 jours
        for query in ('days=abc', 'days=0', 'days=366'):
            self.assertEqual(self.client.get(f'/api/ml/stocks/?{query}').status_code, 400)

    def test_stock_create_and_update(self):
        payload = {
            'center_name': 'Centre National de Transfusion Sanguine (CNTS)',
            'region': 'dakar',
            'blood_group': 'O-',
            'units_available': 42,
            'units_donated': 10,
            'units_used': 3,
            'units_expired': 0,
        }
        response = self.client.post('/api/ml/stocks/', payload, format='json')
        self.assertIn(response.status_code, (200, 201))
        self.assertEqual(response.data['blood_group'], 'O-')
        self.assertEqual(response.data['units_available'], 42)

        # Mise à jour le même jour : doit écraser/mettre à jour (idempotence)
        payload['units_available'] = 50
        response2 = self.client.post('/api/ml/stocks/', payload, format='json')
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data['units_available'], 50)

    def test_stock_batch_create(self):
        payload = {
            'center_name': 'Centre National de Transfusion Sanguine (CNTS)',
            'region': 'dakar',
            'items': [
                {'blood_group': 'A+', 'units_available': 35},
                {'blood_group': 'B+', 'units_available': 28},
                {'blood_group': 'AB+', 'units_available': 15},
                {'blood_group': 'O+', 'units_available': 40},
            ],
        }
        response = self.client.post('/api/ml/stocks/batch/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 4)
        self.assertEqual(len(response.data['records']), 4)

    def test_stock_adjustment(self):
        # 1. Ajustement direct (set)
        response = self.client.post(
            '/api/ml/stocks/adjust/',
            {
                'center_name': 'Centre National de Transfusion Sanguine (CNTS)',
                'blood_group': 'B-',
                'adjustment_type': 'set',
                'units': 20,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['record']['units_available'], 20)

        # 2. Utilisation pour transfusion (use)
        response_use = self.client.post(
            '/api/ml/stocks/adjust/',
            {
                'center_name': 'Centre National de Transfusion Sanguine (CNTS)',
                'blood_group': 'B-',
                'adjustment_type': 'use',
                'units': 5,
            },
            format='json',
        )
        self.assertEqual(response_use.status_code, 200)
        self.assertEqual(response_use.data['record']['units_available'], 15)
        self.assertEqual(response_use.data['record']['units_used'], 5)

        # 3. Réception de don (add_donated)
        response_add = self.client.post(
            '/api/ml/stocks/adjust/',
            {
                'center_name': 'Centre National de Transfusion Sanguine (CNTS)',
                'blood_group': 'B-',
                'adjustment_type': 'add_donated',
                'units': 8,
            },
            format='json',
        )
        self.assertEqual(response_add.status_code, 200)
        self.assertEqual(response_add.data['record']['units_available'], 23)
        self.assertEqual(response_add.data['record']['units_donated'], 8)

    def test_stock_current_summary(self):
        response = self.client.get('/api/ml/stocks/current/?center=CNTS')
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_units_available', response.data)
        self.assertIn('critical_groups', response.data)
        self.assertEqual(len(response.data['stocks']), 8)

    def test_stock_forbidden_for_donor(self):
        self.client.force_authenticate(user=self.donor)
        response = self.client.post(
            '/api/ml/stocks/',
            {'blood_group': 'O+', 'units_available': 10},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

