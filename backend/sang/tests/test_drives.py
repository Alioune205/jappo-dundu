"""Tests des collectes mobiles publiées par les centres de transfusion."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from security.roles import Role
from users.models import HealthFacility
from users.tests.factories import api_client, make_facility, make_user

from ..models import BloodDrive
from .helpers import SangFixturesMixin, make_donor

DRIVES = '/api/sang/drives/'


class BloodDriveTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.cnts = make_facility("CNTS Dakar", facility_type=HealthFacility.FacilityType.BLOOD_BANK)
        cls.cnts_manager = make_user('cnts', Role.BLOOD_MANAGER, facility=cls.cnts)

    def body(self, **fields):
        start = timezone.now() + timedelta(days=2)
        return {
            'title': 'Collecte UCAD',
            'location': 'Campus UCAD, pavillon A',
            'city': 'Dakar',
            'region': 'dakar',
            'starts_at': start.isoformat(),
            'ends_at': (start + timedelta(hours=8)).isoformat(),
            'target_units': 150,
            **fields,
        }

    def test_center_publishes_and_donors_read_upcoming(self):
        response = api_client(self.cnts_manager).post(DRIVES, self.body(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['organizer']['id'], self.cnts.pk)
        past = BloodDrive.objects.create(
            organizer=self.cnts,
            title='Ancienne',
            location='x',
            city='Dakar',
            region='dakar',
            starts_at=timezone.now() - timedelta(days=3),
            ends_at=timezone.now() - timedelta(days=2),
        )
        donor = make_donor('awa')
        rows = api_client(donor.user).get(DRIVES).data['results']
        self.assertEqual([row['title'] for row in rows], ['Collecte UCAD'])
        self.assertNotIn(past.pk, [row['id'] for row in rows])

    def test_validation_and_permissions(self):
        start = timezone.now() + timedelta(days=1)
        bad = self.body(ends_at=(start - timedelta(hours=1)).isoformat(), starts_at=start.isoformat())
        self.assertEqual(api_client(self.cnts_manager).post(DRIVES, bad, format='json').status_code, 400)
        donor = make_donor('binta')
        self.assertEqual(api_client(donor.user).post(DRIVES, self.body(), format='json').status_code, 403)
