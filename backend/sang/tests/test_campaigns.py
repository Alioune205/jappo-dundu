"""Tests des recommandations de prévision et des campagnes préventives."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from ml.models import BloodStockRecord, PredictionResult
from security.roles import Role
from users.models import HealthFacility
from users.tests.factories import api_client, make_facility, make_user

from .helpers import SangFixturesMixin, make_donor


class RecommendationTests(SangFixturesMixin, TestCase):
    def test_critical_risk_becomes_actions(self):
        today = timezone.localdate()
        PredictionResult.objects.create(
            center_name='CRTS Thiès', region='thies', blood_group='O-', prediction_date=today + timedelta(days=5),
            predicted_units=2, lower_bound=1, upper_bound=4, days_of_supply=1.5, risk_level='CRITICAL',
            confidence_score=0.8,
        )
        for day in range(3):
            BloodStockRecord.objects.create(
                center_name='CRTS Thiès', region='thies', blood_group='O-', date=today - timedelta(days=day),
                units_available=5, units_donated=1, units_used=3,
            )
        BloodStockRecord.objects.create(
            center_name='CNTS Dakar', region='dakar', blood_group='O-', date=today, units_available=40,
        )
        rows = api_client(self.admin).get('/api/ml/recommendations/').data
        self.assertEqual(rows[0]['region'], 'thies')
        self.assertEqual(rows[0]['days_until'], 5)
        self.assertIn('3.0 poche(s)/jour', rows[0]['reason'])
        self.assertEqual([a['type'] for a in rows[0]['actions']], ['campaign', 'drive', 'transfer'])
        self.assertIn('CNTS Dakar', rows[0]['actions'][2]['label'])


class CampaignTests(SangFixturesMixin, TestCase):
    def test_campaign_reaches_eligible_donors_of_the_group_once_a_week(self):
        cnts = make_facility("CNTS Dakar", facility_type=HealthFacility.FacilityType.BLOOD_BANK)
        manager = make_user('cnts', Role.BLOOD_MANAGER, facility=cnts)
        make_donor('awa', 'O-')
        make_donor('binta', 'A+')
        with mock.patch('push.services.send_to_users') as push, self.captureOnCommitCallbacks(execute=True):
            response = api_client(manager).post('/api/sang/campaigns/', {'region': 'dakar', 'blood_group': 'O-'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['notified_donors'], 1)
        push.assert_called_once()
        again = api_client(manager).post('/api/sang/campaigns/', {'region': 'dakar', 'blood_group': 'O-'})
        self.assertEqual(again.data['notified_donors'], 0)  # déjà sollicité cette semaine
        other_region = api_client(manager).post('/api/sang/campaigns/', {'region': 'thies', 'blood_group': 'O-'})
        self.assertEqual(other_region.status_code, 403)
