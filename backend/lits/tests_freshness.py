"""
Tests de la fraîcheur des chiffres de lits et des sorties prévues.

Un lit « libre » non confirmé depuis des heures peut envoyer une ambulance au
mauvais endroit : chaque service indique depuis quand ses chiffres sont sûrs.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from users.tests.factories import ORIGIN, api_client, captured_broadcasts

from . import services
from .models import BedCapacity, freshness_of
from .tests import URL, BedFixturesMixin


def age(capacity, hours):
    BedCapacity.objects.filter(pk=capacity.pk).update(confirmed_at=timezone.now() - timedelta(hours=hours))


@override_settings(BED_FRESH_MINUTES=240, BED_STALE_MINUTES=720)
class FreshnessTests(BedFixturesMixin, TestCase):
    def test_levels(self):
        now = timezone.now()
        self.assertEqual(freshness_of(now - timedelta(hours=1), now), 'fresh')
        self.assertEqual(freshness_of(now - timedelta(hours=6), now), 'aging')
        self.assertEqual(freshness_of(now - timedelta(hours=13), now), 'stale')
        self.assertEqual(freshness_of(None, now), 'stale')

    def test_representation_and_confirm(self):
        age(self.icu, 13)
        client = api_client(self.staff)
        self.assertEqual(client.get(f'{URL}{self.icu.pk}/').data['freshness'], 'stale')
        response = client.post(f'{URL}{self.icu.pk}/confirm/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['freshness'], 'fresh')
        self.assertEqual(response.data['occupied_beds'], 1)  # chiffres inchangés
        # Seul le personnel de l'établissement confirme.
        self.assertEqual(api_client(self.other_staff).post(f'{URL}{self.icu.pk}/confirm/').status_code, 403)

    def test_writes_renew_freshness_but_reservations_do_not(self):
        age(self.emergency_b, 13)
        services.reserve(self.emergency_b, created_by=self.admin)
        self.emergency_b.refresh_from_db()
        self.assertEqual(self.emergency_b.freshness, 'stale')
        api_client(self.other_staff).post(f'{URL}{self.emergency_b.pk}/admit/')
        self.emergency_b.refresh_from_db()
        self.assertEqual(self.emergency_b.freshness, 'fresh')

    def test_stale_list_and_reminder(self):
        age(self.icu, 13)
        age(self.emergency_c, 6)
        response = api_client(self.admin).get(f'{URL}stale/')
        self.assertEqual([row['id'] for row in response.data], [self.icu.pk])
        with captured_broadcasts('lits.services') as calls:
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(services.remind_stale(), 1)
        kind, data, kwargs = calls['alert'][0]
        self.assertEqual((kind, data['event']), ('bed', 'bed_capacity_stale'))
        self.assertEqual(kwargs['hospital_id'], self.hospital.pk)

    def test_nearest_reports_freshness(self):
        age(self.emergency_b, 6)
        query = {'latitude': ORIGIN[0], 'longitude': ORIGIN[1], 'radius_km': 100}
        rows = api_client(self.driver).get(f'{URL}nearest/', query).data
        self.assertEqual(rows[0]['name'], "Hôpital B")
        self.assertEqual(rows[0]['freshness'], 'aging')
        self.assertEqual(rows[1]['freshness'], 'fresh')


class ExpectedDischargesTests(BedFixturesMixin, TestCase):
    def test_bounded_by_occupied_beds(self):
        client = api_client(self.other_staff)
        url = f'{URL}{self.emergency_b.pk}/'
        self.assertEqual(client.patch(url, {'expected_discharges': 5}).status_code, 400)
        response = client.patch(url, {'expected_discharges': 4})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['expected_discharges'], 4)

    def test_discharge_consumes_an_expected_discharge(self):
        BedCapacity.objects.filter(pk=self.emergency_b.pk).update(expected_discharges=4)
        response = api_client(self.other_staff).post(f'{URL}{self.emergency_b.pk}/discharge/')
        self.assertEqual(response.data['occupied_beds'], 3)
        self.assertEqual(response.data['expected_discharges'], 3)
