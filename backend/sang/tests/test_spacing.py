"""
Espacement des dons (règles CNTS) à l'enregistrement et à l'engagement :
90 jours (homme) / 120 jours (femme) entre deux dons, 4 / 3 dons par an,
un seul engagement à la fois.
"""

from datetime import date, timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from users.tests.factories import api_client

from ..eligibility import donation_conflict
from ..models import Donation, DonorResponse
from .helpers import SangFixturesMixin, make_donor, make_request

URL = '/api/sang/requests/'
DAY = date(2026, 6, 1)


class DonationConflictTests(SimpleTestCase):
    def test_interval_by_sex(self):
        self.assertIsNone(donation_conflict('M', DAY, [DAY - timedelta(days=90)]))
        self.assertIn('90 jours', donation_conflict('M', DAY, [DAY - timedelta(days=89)]))
        self.assertIn('120 jours', donation_conflict('F', DAY, [DAY - timedelta(days=100)]))
        self.assertIsNone(donation_conflict('F', DAY, [DAY - timedelta(days=120)]))

    def test_same_day_and_backdated_donation(self):
        self.assertIsNotNone(donation_conflict('M', DAY, [DAY]))
        # Don saisi a posteriori, trop proche d'un don plus récent.
        message = donation_conflict('M', DAY, [DAY + timedelta(days=30)])
        self.assertIn('déjà enregistré le 01/07/2026', message)

    def test_message_gives_next_date(self):
        message = donation_conflict('M', DAY, [DAY - timedelta(days=10)])
        self.assertIn('prochain don possible le 20/08/2026', message)

    def test_yearly_cap(self):
        # Femme : 3 dons espacés de 120 jours ; un 4e à 360 jours du premier dépasse le plafond.
        dates = [DAY, DAY + timedelta(days=120), DAY + timedelta(days=240)]
        self.assertIn('maximal', donation_conflict('F', DAY + timedelta(days=360), dates))
        self.assertIsNone(donation_conflict('F', DAY + timedelta(days=365), dates))


class DonationSpacingApiTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.donor = make_donor('awa', 'O-', north_km=2)
        cls.first_request = make_request(cls.hospital, 'A+')
        cls.second_request = make_request(cls.hospital, 'O+')

    def respond(self, blood_request, status='accepted'):
        return api_client(self.donor.user).post(
            f'{URL}{blood_request.pk}/respond/', {'status': status}, format='json'
        )

    def record(self, donated_on=None):
        body = {'donor_id': self.donor.pk}
        if donated_on:
            body['donated_on'] = str(donated_on)
        return api_client(self.staff).post('/api/sang/donations/', body, format='json')

    def test_spontaneous_donation_too_close_is_refused(self):
        self.assertEqual(self.record().status_code, 201)
        response = self.record()
        self.assertEqual(response.status_code, 409)
        self.assertIn('Espacement', response.data['detail'])
        # Saisie a posteriori trop proche du don du jour : refusée aussi.
        self.assertEqual(self.record(timezone.localdate() - timedelta(days=30)).status_code, 409)
        self.assertEqual(Donation.objects.filter(donor=self.donor).count(), 1)

    def test_only_one_engagement_at_a_time(self):
        self.assertEqual(self.respond(self.first_request).status_code, 200)
        response = self.respond(self.second_request)
        self.assertEqual(response.status_code, 409)
        self.assertIn('déjà attendu', response.data['detail'])
        # Après désistement, l'autre demande peut être acceptée.
        self.assertEqual(self.respond(self.first_request, 'cancelled').status_code, 200)
        self.assertEqual(self.respond(self.second_request).status_code, 200)

    def test_confirmation_rechecks_spacing(self):
        accepted = self.respond(self.first_request)
        # Le donneur a donné ailleurs entre-temps (don spontané au centre).
        self.assertEqual(self.record().status_code, 201)
        response = api_client(self.staff).post(
            f'{URL}{self.first_request.pk}/responses/{accepted.data["id"]}/confirm/'
        )
        self.assertEqual(response.status_code, 409)  # engagement libéré par le don
        self.assertEqual(
            DonorResponse.objects.get(pk=accepted.data['id']).status,
            DonorResponse.Status.CANCELLED,
        )

    def test_old_engagement_is_released_by_a_donation(self):
        # Engagements hérités d'avant la règle : deux acceptations en base.
        first = DonorResponse.objects.create(
            blood_request=self.first_request, donor=self.donor, status=DonorResponse.Status.ACCEPTED
        )
        second = DonorResponse.objects.create(
            blood_request=self.second_request, donor=self.donor, status=DonorResponse.Status.ACCEPTED
        )
        response = api_client(self.staff).post(
            f'{URL}{self.first_request.pk}/responses/{first.pk}/confirm/'
        )
        self.assertEqual(response.status_code, 201, response.data)
        second.refresh_from_db()
        self.assertEqual(second.status, DonorResponse.Status.CANCELLED)
        # Et le second don, s'il était confirmé quand même, serait refusé.
        second.status = DonorResponse.Status.ACCEPTED
        second.save()
        refused = api_client(self.staff).post(
            f'{URL}{self.second_request.pk}/responses/{second.pk}/confirm/'
        )
        self.assertEqual(refused.status_code, 409)
        self.assertIn('Espacement', refused.data['detail'])
