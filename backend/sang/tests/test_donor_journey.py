"""
Tests du parcours du donneur engagé (en route, arrivée, remerciement) et du
registre des groupes rares.
"""

from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from geo.distance import GeoPoint
from security.roles import Role
from users.tests.factories import api_client, birth_date_for_age, make_user, offset

from ..models import DonorResponse
from ..services import find_matching_donors, find_nearby_requests
from .helpers import SangFixturesMixin, make_donor, make_request


@override_settings(OSRM_URL='')
class DonorJourneyTests(SangFixturesMixin, TestCase):
    def setUp(self):
        self.donor = make_donor('awa', 'O+', north_km=4)
        self.request = make_request(self.hospital, 'O+')
        self.response = DonorResponse.objects.create(
            blood_request=self.request, donor=self.donor, status=DonorResponse.Status.ACCEPTED
        )
        self.base = f'/api/sang/requests/{self.request.pk}'

    def test_on_my_way_then_arrival_then_thanks(self):
        latitude, longitude = offset(4, 0)
        response = api_client(self.donor.user).post(
            f'{self.base}/on-my-way/', {'latitude': latitude, 'longitude': longitude}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(response.data['eta_at'])
        rows = api_client(self.staff).get(f'{self.base}/responses/').data['results']
        self.assertIsNotNone(rows[0]['eta_at'])

        arrived = api_client(self.staff).post(f'{self.base}/responses/{self.response.pk}/arrived/')
        self.assertIsNotNone(arrived.data['arrived_at'])

        with mock.patch('push.services.notify_donation_used') as thanks, self.captureOnCommitCallbacks(execute=True):
            api_client(self.staff).post(f'{self.base}/responses/{self.response.pk}/confirm/')
        thanks.assert_called_once_with(self.donor.user_id, self.hospital.name)

    def test_only_an_engaged_donor_can_be_on_the_way(self):
        other = make_donor('binta', 'O+', north_km=2)
        latitude, longitude = offset(2, 0)
        response = api_client(other.user).post(
            f'{self.base}/on-my-way/', {'latitude': latitude, 'longitude': longitude}, format='json'
        )
        self.assertEqual(response.status_code, 409)


class RareRegistryTests(SangFixturesMixin, TestCase):
    def test_rare_request_reaches_registered_donors_nationwide(self):
        near = make_donor('proche', 'O-', north_km=1)
        rare_far = make_donor('rare', 'O-', north_km=300, rare_phenotype='bombay')
        request = make_request(self.hospital, 'O-', search_radius_km=20, rare_phenotype='bombay')
        matches = find_matching_donors(request, limit=10)
        self.assertEqual([d.pk for d in matches], [rare_far.pk])
        self.assertNotIn(near.pk, [d.pk for d in matches])
        # Le donneur rare la voit dans ses alertes malgré la distance ; l'autre non.
        far_point = GeoPoint(*offset(300, 0))
        nearby = find_nearby_requests(rare_far, far_point, radius_km=50, limit=5)
        self.assertEqual([r.pk for r in nearby], [request.pk])
        self.assertEqual(find_nearby_requests(near, GeoPoint(*offset(1, 0)), radius_km=50, limit=5), [])

    def test_donor_joins_the_registry(self):
        donor = make_donor('awa', 'A+')
        response = api_client(donor.user).patch('/api/sang/donors/me/', {'rare_phenotype': 'kell_null'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rare_phenotype'], 'kell_null')


class ReferralTests(SangFixturesMixin, TestCase):
    def test_referral_code_at_creation_only(self):
        sponsor = make_donor('parrain')
        newcomer = make_user('filleul', Role.DONOR)
        body = {
            'blood_group': 'A+',
            'sex': 'F',
            'date_of_birth': str(birth_date_for_age(25, timezone.localdate())),
            'weight_kg': 60,
            'referral_code': sponsor.card_code,
        }
        response = api_client(newcomer).put('/api/sang/donors/me/', body, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(api_client(sponsor.user).get('/api/sang/donors/me/').data['referrals_count'], 1)
        bad = api_client(make_user('autre', Role.DONOR)).put(
            '/api/sang/donors/me/', {**body, 'referral_code': 'JD-0000-0000'}, format='json'
        )
        self.assertEqual(bad.status_code, 400)
