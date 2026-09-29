"""
Tests des demandes de sang : création, périmètre par établissement,
appariement géographique des donneurs, réponses, confirmation des dons,
diffusion temps réel.

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from security.roles import Role
from users.tests.factories import ORIGIN, api_client, captured_broadcasts, make_facility, make_user

from ..models import BloodRequest, Donation, DonorResponse
from .helpers import SangFixturesMixin, make_donor, make_request

URL = '/api/sang/requests/'


class BloodRequestCreationTests(SangFixturesMixin, TestCase):
    def test_staff_creates_request_for_own_facility(self):
        with (
            captured_broadcasts('sang.notifications') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = api_client(self.staff).post(
                URL,
                {
                    'blood_group': 'O-',
                    'units_needed': 3,
                    'urgency': 'critical',
                    'notes': "Hémorragie",
                },
                format='json',
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['facility']['id'], self.hospital.pk)
        self.assertEqual(response.data['status'], 'open')
        self.assertEqual(response.data['units_remaining'], 3)
        self.assertEqual(response.data['created_by']['id'], self.staff.pk)
        self.assertEqual(
            response.data['response_counts'], {'accepted': 0, 'declined': 0, 'donated': 0}
        )

        ((kind, data, kwargs),) = calls['alert']
        self.assertEqual(kind, 'blood')
        self.assertEqual(data['event'], 'blood_request_created')
        self.assertEqual(kwargs, {'region': 'dakar', 'hospital_id': self.hospital.pk})
        self.assertNotIn('notes', data)
        self.assertEqual(len(calls['dashboard']), 1)

    def test_staff_cannot_create_for_another_facility(self):
        response = api_client(self.staff).post(
            URL,
            {'blood_group': 'O-', 'units_needed': 1, 'facility_id': self.other_hospital.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_staff_without_facility(self):
        orphan = make_user('orphelin', Role.HOSPITAL_STAFF)
        response = api_client(orphan).post(
            URL, {'blood_group': 'O-', 'units_needed': 1}, format='json'
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_must_choose_facility(self):
        client = api_client(self.admin)
        response = client.post(URL, {'blood_group': 'O-', 'units_needed': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('facility_id', response.data)
        response = client.post(
            URL,
            {'blood_group': 'O-', 'units_needed': 1, 'facility_id': self.other_hospital.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    def test_inactive_facility(self):
        closed = make_facility("Fermé", is_active=False)
        response = api_client(self.admin).post(
            URL, {'blood_group': 'O-', 'units_needed': 1, 'facility_id': closed.pk}, format='json'
        )
        self.assertEqual(response.status_code, 409)

    def test_validation(self):
        client = api_client(self.staff)
        cases = [
            {'blood_group': 'C+', 'units_needed': 1},
            {'blood_group': 'O+', 'units_needed': 0},
            {'blood_group': 'O+', 'units_needed': 51},
            {'blood_group': 'O+', 'units_needed': 1, 'search_radius_km': 500},
            {'blood_group': 'O+', 'units_needed': 1, 'urgency': 'demain'},
            {
                'blood_group': 'O+',
                'units_needed': 1,
                'needed_by': (timezone.now() - timedelta(hours=1)).isoformat(),
            },
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                self.assertEqual(client.post(URL, payload, format='json').status_code, 400)

    def test_donor_and_driver_cannot_manage_requests(self):
        driver = make_user('chauffeur', Role.AMBULANCE_DRIVER)
        for user in (make_donor('awa').user, driver):
            client = api_client(user)
            self.assertEqual(client.get(URL).status_code, 403)
            self.assertEqual(client.post(URL, {}, format='json').status_code, 403)


class BloodRequestScopeTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.request_a = make_request(cls.hospital, 'O+')
        cls.request_b = make_request(cls.other_hospital, 'AB-', urgency='critical')

    def test_staff_only_sees_own_facility(self):
        client = api_client(self.staff)
        response = client.get(URL)
        self.assertEqual([row['id'] for row in response.data['results']], [self.request_a.pk])
        self.assertEqual(client.get(f'{URL}{self.request_b.pk}/').status_code, 404)
        self.assertEqual(
            client.patch(
                f'{URL}{self.request_b.pk}/', {'units_needed': 5}, format='json'
            ).status_code,
            404,
        )

    def test_admin_sees_everything_with_filters(self):
        client = api_client(self.admin)
        self.assertEqual(client.get(URL).data['count'], 2)
        self.assertEqual(client.get(URL, {'urgency': 'critical'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'facility': self.hospital.pk}).data['count'], 1)
        self.assertEqual(client.get(URL, {'blood_group': 'AB-'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'region': 'dakar'}).data['count'], 2)
        self.assertEqual(client.get(URL, {'status': 'closed'}).status_code, 400)

    def test_update_and_cancel(self):
        client = api_client(self.staff)
        url = f'{URL}{self.request_a.pk}/'
        response = client.patch(url, {'units_needed': 4, 'blood_group': 'AB+'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['units_needed'], 4)
        self.assertEqual(response.data['blood_group'], 'O+')  # non modifiable

        with (
            captured_broadcasts('sang.notifications') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client.post(f'{url}cancel/')
        self.assertEqual(response.data['status'], 'cancelled')
        self.assertIsNotNone(response.data['closed_at'])
        self.assertEqual(calls['alert'][0][1]['event'], 'blood_request_closed')
        self.assertEqual(client.post(f'{url}cancel/').status_code, 409)
        self.assertEqual(client.patch(url, {'units_needed': 5}, format='json').status_code, 409)


class MatchingTests(SangFixturesMixin, TestCase):
    """Appariement : compatibilité, éligibilité, rayon, tri et anonymat."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        today = timezone.localdate()
        cls.near_o_neg = make_donor('near_o_neg', 'O-', north_km=1)
        cls.mid_a_pos = make_donor('mid_a_pos', 'A+', east_km=-3)
        cls.far_o_pos = make_donor('far_o_pos', 'O+', north_km=15)
        make_donor('out_of_radius', 'A+', north_km=30)
        make_donor('incompatible', 'B+', north_km=0.5)
        make_donor('unavailable', 'A+', north_km=0.5, is_available=False)
        make_donor('too_recent', 'A+', north_km=0.5, last_donation_date=today - timedelta(days=10))
        make_donor('too_old', 'A+', north_km=0.5, age=70)
        make_donor('no_location', 'A+', located=False)
        cls.blood_request = make_request(cls.hospital, 'A+', search_radius_km=20)

    def matches(self, **params):
        return api_client(self.staff).get(f'{URL}{self.blood_request.pk}/matches/', params)

    def test_matching_donors_sorted_by_distance(self):
        response = self.matches()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row['donor_id'] for row in response.data['results']],
            [self.near_o_neg.pk, self.mid_a_pos.pk, self.far_o_pos.pk],
        )
        first = response.data['results'][0]
        self.assertAlmostEqual(first['distance_km'], 1.0, delta=0.01)
        self.assertFalse(first['is_exact_match'])
        self.assertTrue(response.data['results'][1]['is_exact_match'])

    def test_matches_are_anonymous(self):
        row = self.matches().data['results'][0]
        self.assertEqual(
            set(row),
            {'donor_id', 'blood_group', 'blood_group_display', 'is_exact_match', 'distance_km'},
        )

    def test_radius_and_limit(self):
        self.assertEqual(self.matches(radius_km=5).data['count'], 2)
        self.assertEqual(self.matches(limit=1).data['count'], 1)
        self.assertEqual(self.matches(radius_km=50).status_code, 400)

    def test_donors_who_responded_are_excluded(self):
        DonorResponse.objects.create(
            blood_request=self.blood_request,
            donor=self.near_o_neg,
            status=DonorResponse.Status.DECLINED,
        )
        ids = [row['donor_id'] for row in self.matches().data['results']]
        self.assertNotIn(self.near_o_neg.pk, ids)

    def test_closed_request(self):
        self.blood_request.status = BloodRequest.Status.CANCELLED
        self.blood_request.save()
        self.assertEqual(self.matches().status_code, 409)

    def test_other_facility_staff_cannot_see_matches(self):
        response = api_client(self.other_staff).get(f'{URL}{self.blood_request.pk}/matches/')
        self.assertEqual(response.status_code, 404)


class NearbyRequestsTests(SangFixturesMixin, TestCase):
    """Écran « Alertes » : demandes compatibles dont le rayon atteint le donneur."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.donor = make_donor('awa', 'O-', north_km=3)
        cls.req_near = make_request(
            cls.hospital, 'A+', search_radius_km=10, notes="Secret médical"
        )
        cls.req_other = make_request(cls.other_hospital, 'O-', search_radius_km=10)
        make_request(cls.hospital, 'B+', search_radius_km=2)  # rayon trop court
        make_request(cls.hospital, 'AB+', status=BloodRequest.Status.FULFILLED)
        far = make_facility("Hôpital lointain", north_km=150, region='louga', city='Louga')
        make_request(far, 'O+', search_radius_km=200)

    def nearby(self, user=None, **params):
        return api_client(user or self.donor.user).get(f'{URL}nearby/', params)

    def test_compatible_open_requests_within_their_radius(self):
        response = self.nearby()
        self.assertEqual(response.status_code, 200, response.data)
        ids = [row['id'] for row in response.data]
        self.assertEqual(len(ids), 3)
        self.assertEqual(ids[:2], [self.req_near.pk, self.req_other.pk])
        self.assertNotIn('notes', response.data[0])
        self.assertIsNone(response.data[0]['my_response'])

    def test_donor_radius_narrows_the_search(self):
        self.assertEqual(len(self.nearby(radius_km=20).data), 2)

    def test_phone_position_overrides_profile(self):
        latitude, longitude = ORIGIN[0] + 1.3, ORIGIN[1]
        response = self.nearby(latitude=latitude, longitude=longitude)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(self.nearby(latitude=14).status_code, 400)

    def test_my_response_is_reported(self):
        DonorResponse.objects.create(
            blood_request=self.req_near, donor=self.donor, status=DonorResponse.Status.ACCEPTED
        )
        self.assertEqual(self.nearby().data[0]['my_response'], 'accepted')

    def test_requires_donor_profile_and_location(self):
        self.assertEqual(self.nearby(user=self.staff).status_code, 404)
        unlocated = make_donor('sans_position', located=False)
        self.assertEqual(self.nearby(user=unlocated.user).status_code, 400)


class ResponseAndDonationFlowTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.donor = make_donor('awa', 'O-', north_km=2)
        cls.second = make_donor('moussa', 'A+', north_km=4)
        cls.blood_request = make_request(cls.hospital, 'A+', units_needed=2)

    def respond(self, donor, status):
        return api_client(donor.user).post(
            f'{URL}{self.blood_request.pk}/respond/', {'status': status}, format='json'
        )

    def confirm(self, response_id, user=None):
        return api_client(user or self.staff).post(
            f'{URL}{self.blood_request.pk}/responses/{response_id}/confirm/'
        )

    def test_full_flow_until_fulfilled(self):
        with (
            captured_broadcasts('sang.notifications') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            first = self.respond(self.donor, 'accepted')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(calls['alert'], [])  # une réponse n'alerte pas les donneurs
        self.assertEqual(calls['dashboard'][0][1]['counts']['accepted_count'], 1)
        second = self.respond(self.second, 'accepted')

        responses = api_client(self.staff).get(f'{URL}{self.blood_request.pk}/responses/').data
        self.assertEqual(responses['count'], 2)
        self.assertIn('phone_number', responses['results'][0]['donor'])

        donation = self.confirm(first.data['id'])
        self.assertEqual(donation.status_code, 201, donation.data)
        self.donor.refresh_from_db()
        self.assertEqual(self.donor.last_donation_date, timezone.localdate())
        self.blood_request.refresh_from_db()
        self.assertEqual(self.blood_request.units_collected, 1)
        self.assertTrue(self.blood_request.is_open)

        with (
            captured_broadcasts('sang.notifications') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            self.confirm(second.data['id'])
        self.blood_request.refresh_from_db()
        self.assertEqual(self.blood_request.status, BloodRequest.Status.FULFILLED)
        self.assertIsNotNone(self.blood_request.closed_at)
        self.assertEqual(calls['alert'][-1][1]['event'], 'blood_request_closed')
        self.assertEqual(Donation.objects.filter(blood_request=self.blood_request).count(), 2)

        # Demande satisfaite : plus de réponse ni de confirmation possible.
        third = make_donor('fatou', 'A+')
        self.assertEqual(self.respond(third, 'accepted').status_code, 409)

    def test_contact_is_hidden_until_acceptance(self):
        self.respond(self.donor, 'declined')
        row = (
            api_client(self.staff)
            .get(f'{URL}{self.blood_request.pk}/responses/')
            .data['results'][0]
        )
        self.assertEqual(set(row['donor']), {'id', 'blood_group'})

    def test_decline_then_accept_then_cancel(self):
        self.assertEqual(self.respond(self.donor, 'declined').data['status'], 'declined')
        self.assertEqual(self.respond(self.donor, 'accepted').data['status'], 'accepted')
        self.assertEqual(self.respond(self.donor, 'cancelled').data['status'], 'cancelled')
        self.assertEqual(self.respond(self.donor, 'cancelled').status_code, 409)
        self.assertEqual(DonorResponse.objects.filter(donor=self.donor).count(), 1)

    def test_ineligible_donor_cannot_accept(self):
        self.donor.last_donation_date = timezone.localdate() - timedelta(days=5)
        self.donor.save()
        response = self.respond(self.donor, 'accepted')
        self.assertEqual(response.status_code, 409)
        self.assertIn("Délai", response.data['detail'])
        self.assertEqual(self.respond(self.donor, 'declined').status_code, 200)

    def test_incompatible_donor(self):
        incompatible = make_donor('b_pos', 'B+')
        self.assertEqual(self.respond(incompatible, 'accepted').status_code, 409)

    def test_invalid_status_and_missing_profile(self):
        self.assertEqual(self.respond(self.donor, 'donated').status_code, 400)
        response = api_client(self.staff).post(
            f'{URL}{self.blood_request.pk}/respond/', {'status': 'accepted'}, format='json'
        )
        self.assertEqual(response.status_code, 404)

    def test_confirm_requires_acceptance(self):
        declined = self.respond(self.donor, 'declined')
        self.assertEqual(self.confirm(declined.data['id']).status_code, 409)
        self.assertEqual(self.confirm(999999).status_code, 404)

    def test_confirm_is_reserved_to_the_facility(self):
        accepted = self.respond(self.donor, 'accepted')
        self.assertEqual(self.confirm(accepted.data['id'], user=self.other_staff).status_code, 404)
        self.assertEqual(self.confirm(accepted.data['id'], user=self.donor.user).status_code, 403)

    def test_response_of_another_request_is_not_found(self):
        other_request = make_request(self.hospital, 'A+')
        accepted = api_client(self.donor.user).post(
            f'{URL}{other_request.pk}/respond/', {'status': 'accepted'}, format='json'
        )
        self.assertEqual(self.confirm(accepted.data['id']).status_code, 404)

    def test_no_show(self):
        accepted = self.respond(self.donor, 'accepted')
        url = f'{URL}{self.blood_request.pk}/responses/{accepted.data["id"]}/no-show/'
        response = api_client(self.staff).post(url)
        self.assertEqual(response.data['status'], 'no_show')
        self.assertEqual(api_client(self.staff).post(url).status_code, 409)
        self.assertEqual(self.respond(self.donor, 'accepted').status_code, 409)

    def test_units_needed_cannot_drop_below_collected(self):
        accepted = self.respond(self.donor, 'accepted')
        self.confirm(accepted.data['id'])
        url = f'{URL}{self.blood_request.pk}/'
        client = api_client(self.staff)
        self.assertEqual(client.patch(url, {'units_needed': 0}, format='json').status_code, 400)
        response = client.patch(url, {'units_needed': 1}, format='json')
        self.assertEqual(response.data['status'], 'fulfilled')


class DonationTests(SangFixturesMixin, TestCase):
    def test_walk_in_donation(self):
        donor = make_donor('awa', last_donation_date=timezone.localdate() - timedelta(days=200))
        client = api_client(self.staff)
        response = client.post('/api/sang/donations/', {'donor_id': donor.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['facility']['id'], self.hospital.pk)
        self.assertEqual(response.data['donated_on'], str(timezone.localdate()))
        donor.refresh_from_db()
        self.assertEqual(donor.last_donation_date, timezone.localdate())

        # Un don ancien ne recule pas la date du dernier don.
        client.post(
            '/api/sang/donations/',
            {'donor_id': donor.pk, 'donated_on': str(timezone.localdate() - timedelta(days=400))},
            format='json',
        )
        donor.refresh_from_db()
        self.assertEqual(donor.last_donation_date, timezone.localdate())
        self.assertEqual(client.get('/api/sang/donations/', {'donor': donor.pk}).data['count'], 2)
        self.assertEqual(api_client(self.other_staff).get('/api/sang/donations/').data['count'], 0)

    def test_future_date_is_rejected(self):
        donor = make_donor('awa')
        response = api_client(self.staff).post(
            '/api/sang/donations/',
            {'donor_id': donor.pk, 'donated_on': str(timezone.localdate() + timedelta(days=1))},
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class BloodRequestConstraintTests(SangFixturesMixin, TestCase):
    def test_collected_cannot_exceed_needed_in_database(self):
        blood_request = make_request(self.hospital, units_needed=1)
        blood_request.units_collected = 2
        with self.assertRaises(IntegrityError), transaction.atomic():
            blood_request.save()

    def test_one_response_per_donor_and_request(self):
        donor = make_donor('awa')
        blood_request = make_request(self.hospital)
        DonorResponse.objects.create(blood_request=blood_request, donor=donor, status='accepted')
        with self.assertRaises(IntegrityError), transaction.atomic():
            DonorResponse.objects.create(
                blood_request=blood_request, donor=donor, status='declined'
            )
