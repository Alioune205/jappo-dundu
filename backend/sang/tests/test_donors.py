"""
Tests de l'espace donneur : profil, historique, recherche par téléphone,
table de compatibilité.

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from security.roles import Role, get_user_roles
from users.tests.factories import api_client, make_user

from ..models import Donation, Donor, DonorResponse
from .helpers import SangFixturesMixin, make_donor, make_request

ME_URL = '/api/sang/donors/me/'


def profile_payload(**overrides):
    payload = {
        'blood_group': 'A+',
        'sex': 'F',
        'date_of_birth': '1995-04-12',
        'is_available': True,
        'latitude': 14.70,
        'longitude': -17.45,
    }
    payload.update(overrides)
    return payload


class DonorProfileTests(TestCase):
    def setUp(self):
        self.user = make_user('awa')
        self.client = api_client(self.user)

    def test_get_without_profile(self):
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 404)
        self.assertIn('PUT', response.data['detail'])

    def test_put_creates_profile_and_grants_donor_role(self):
        response = self.client.put(ME_URL, profile_payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['blood_group_display'], "A Positif")
        self.assertTrue(response.data['is_eligible'])
        self.assertEqual(response.data['ineligibility_reasons'], [])
        self.assertIsNotNone(response.data['location_updated_at'])
        self.assertEqual(get_user_roles(self.user), {Role.DONOR})

    def test_put_again_updates(self):
        self.client.put(ME_URL, profile_payload(), format='json')
        response = self.client.put(ME_URL, profile_payload(blood_group='O-'), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Donor.objects.get(user=self.user).blood_group, 'O-')

    def test_patch_availability_and_location(self):
        self.client.put(ME_URL, profile_payload(), format='json')
        first_update = Donor.objects.get(user=self.user).location_updated_at

        response = self.client.patch(ME_URL, {'is_available': False}, format='json')
        self.assertFalse(response.data['is_eligible'])
        self.assertEqual(Donor.objects.get(user=self.user).location_updated_at, first_update)

        response = self.client.patch(ME_URL, {'latitude': 14.8, 'longitude': -17.3}, format='json')
        self.assertGreater(Donor.objects.get(user=self.user).location_updated_at, first_update)

        response = self.client.patch(ME_URL, {'latitude': None, 'longitude': None}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(Donor.objects.get(user=self.user).location_updated_at)

    def test_validation(self):
        today = timezone.localdate()
        cases = {
            'date_of_birth': profile_payload(date_of_birth=str(date(today.year - 17, 1, 1))),
            'blood_group': profile_payload(blood_group='C+'),
            'latitude': profile_payload(latitude=95),
            'last_donation_date': profile_payload(
                last_donation_date=str(today + timedelta(days=1))
            ),
            'sex': profile_payload(sex='X'),
        }
        for field, payload in cases.items():
            with self.subTest(field=field):
                response = self.client.put(ME_URL, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        response = self.client.put(ME_URL, profile_payload(longitude=None), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Donor.objects.exists())

    def test_recent_donation_makes_donor_ineligible(self):
        last = timezone.localdate() - timedelta(days=30)
        response = self.client.put(
            ME_URL, profile_payload(sex='M', last_donation_date=str(last)), format='json'
        )
        self.assertFalse(response.data['is_eligible'])
        self.assertEqual(response.data['next_eligible_date'], str(last + timedelta(days=90)))
        self.assertEqual(len(response.data['ineligibility_reasons']), 1)

    def test_anonymous(self):
        self.assertEqual(api_client().get(ME_URL).status_code, 401)


class DonorHistoryTests(SangFixturesMixin, TestCase):
    def test_donations_and_responses(self):
        donor = make_donor('awa')
        blood_request = make_request(self.hospital)
        response = DonorResponse.objects.create(
            blood_request=blood_request, donor=donor, status=DonorResponse.Status.DONATED
        )
        Donation.objects.create(
            donor=donor,
            facility=self.hospital,
            donated_on=timezone.localdate(),
            blood_request=blood_request,
            response=response,
        )
        client = api_client(donor.user)

        donations = client.get(f'{ME_URL}donations/').data
        self.assertEqual(donations['count'], 1)
        self.assertEqual(donations['results'][0]['facility']['name'], "Hôpital A")

        responses = client.get(f'{ME_URL}responses/').data
        self.assertEqual(responses['count'], 1)
        self.assertEqual(responses['results'][0]['status'], 'donated')
        self.assertEqual(responses['results'][0]['blood_request']['id'], blood_request.pk)
        self.assertNotIn('notes', responses['results'][0]['blood_request'])

    def test_history_requires_donor_profile(self):
        client = api_client(self.staff)
        self.assertEqual(client.get(f'{ME_URL}donations/').status_code, 404)


class DonorLookupTests(SangFixturesMixin, TestCase):
    def test_lookup_by_phone(self):
        donor = make_donor('awa')
        phone = donor.user.profile.phone_number
        client = api_client(self.staff)
        response = client.get('/api/sang/donors/lookup/', {'phone_number': phone[4:]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], donor.pk)
        self.assertNotIn('latitude', response.data)
        self.assertEqual(
            client.get('/api/sang/donors/lookup/', {'phone_number': '770000999'}).status_code, 404
        )
        self.assertEqual(
            client.get('/api/sang/donors/lookup/', {'phone_number': 'abc'}).status_code, 400
        )

    def test_lookup_is_reserved_to_staff(self):
        donor = make_donor('awa')
        self.assertEqual(api_client(donor.user).get('/api/sang/donors/lookup/').status_code, 403)


class CompatibilityEndpointTests(TestCase):
    def test_table(self):
        response = api_client(make_user('awa')).get('/api/sang/compatibility/')
        self.assertEqual(response.status_code, 200)
        rows = {row['blood_group']: row for row in response.data}
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows['O-']['can_receive_from'], ['O-'])
        self.assertEqual(len(rows['O-']['can_donate_to']), 8)
