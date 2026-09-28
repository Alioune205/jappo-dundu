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
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from ml.models import MLModelMetadata, PredictionResult

from .helpers import TEST_SERIES, TrainedModelTestCase

User = get_user_model()

ENDPOINTS = (
    '/api/ml/predictions/',
    '/api/ml/predictions/summary/',
    '/api/ml/model-info/',
    '/api/ml/stocks/',
)


class MLAPITestCase(TrainedModelTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        call_command('setup_roles', stdout=StringIO())
        cls.hospital = User.objects.create_user('hospital')
        cls.hospital.groups.add(Group.objects.get(name='hospital_staff'))
        cls.donor = User.objects.create_user('donor')
        cls.donor.groups.add(Group.objects.get(name='donor'))

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(self.hospital)

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
        for url in ENDPOINTS:
            self.assertEqual(self.client.get(url).status_code, 200, url)


class PredictEndpointTests(MLAPITestCase):

    def test_predict_then_list(self):
        response = self.predict(days_ahead=7)
        self.assertEqual(response.status_code, 200)
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
        self.assertNotIn(str(self.model_dir), response.data['message'])

    def test_predict_is_rate_limited(self):
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'ml_predict': '1/hour'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates):
            self.assertEqual(self.predict(days_ahead=1).status_code, 200)
            self.assertEqual(self.predict(days_ahead=1).status_code, 429)


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
        MLModelMetadata.objects.update(is_active=False)
        self.assertEqual(self.client.get('/api/ml/model-info/').status_code, 404)

    def test_stock_history(self):
        response = self.client.get('/api/ml/stocks/?days=7&region=thies')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 8 * 8)  # 8 groupes × 8 jours
        for query in ('days=abc', 'days=0', 'days=366'):
            self.assertEqual(self.client.get(f'/api/ml/stocks/?{query}').status_code, 400)
