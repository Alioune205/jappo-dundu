"""
Tests des établissements de santé : consultation, administration,
recherche de proximité et contraintes en base.

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import IntegrityError, transaction
from django.test import TestCase

from security.roles import Role
from users.models import HealthFacility

from .factories import ORIGIN, api_client, make_facility, make_user

URL = '/api/facilities/'


class FacilityAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user('admin', Role.ADMIN)
        cls.donor = make_user('awa', Role.DONOR)
        cls.hospital = make_facility("CHU Test", north_km=1)
        cls.blood_bank = make_facility(
            "CRTS Test",
            north_km=30,
            facility_type=HealthFacility.FacilityType.BLOOD_BANK,
            region='thies',
            city="Thiès",
        )
        cls.closed = make_facility("Clinique fermée", north_km=2, is_active=False)

    def test_any_authenticated_user_can_read_active_facilities(self):
        response = api_client(self.donor).get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row['name'] for row in response.data['results']}, {"CHU Test", "CRTS Test"}
        )
        self.assertEqual(api_client(self.donor).get(f'{URL}{self.closed.pk}/').status_code, 404)
        self.assertEqual(api_client().get(URL).status_code, 401)

    def test_admin_sees_inactive_facilities(self):
        client = api_client(self.admin)
        self.assertEqual(client.get(URL).data['count'], 3)
        self.assertEqual(client.get(URL, {'is_active': 'false'}).data['count'], 1)

    def test_filters(self):
        client = api_client(self.donor)
        self.assertEqual(client.get(URL, {'region': 'thies'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'facility_type': 'blood_bank'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'search': 'chu'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'region': 'lyon'}).status_code, 400)

    def test_admin_creates_facility(self):
        response = api_client(self.admin).post(
            URL,
            {
                'name': "  Hôpital   de Pikine ",
                'facility_type': 'hospital',
                'region': 'dakar',
                'city': 'Pikine',
                'phone_number': "33 853 00 00",
                'latitude': 14.75,
                'longitude': -17.39,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['name'], "Hôpital de Pikine")
        self.assertEqual(response.data['phone_number'], '+221338530000')
        self.assertEqual(response.data['facility_type_display'], "Hôpital")

    def test_creation_validation(self):
        client = api_client(self.admin)
        base = {
            'name': "chu TEST",
            'facility_type': 'hospital',
            'region': 'dakar',
            'city': 'Dakar',
            'latitude': 14.7,
            'longitude': -17.4,
        }
        self.assertIn('name', client.post(URL, base, format='json').data)
        for field, value in (('latitude', 91), ('longitude', -200), ('facility_type', 'spa')):
            with self.subTest(field=field):
                response = client.post(URL, {**base, 'name': 'Autre', field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_same_name_in_another_region_is_allowed(self):
        response = api_client(self.admin).post(
            URL,
            {
                'name': "CHU Test",
                'facility_type': 'hospital',
                'region': 'kolda',
                'city': 'Kolda',
                'latitude': 12.9,
                'longitude': -14.9,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    def test_non_admin_cannot_write(self):
        client = api_client(self.donor)
        self.assertEqual(client.post(URL, {}, format='json').status_code, 403)
        self.assertEqual(
            client.patch(f'{URL}{self.hospital.pk}/', {'name': 'X'}, format='json').status_code,
            403,
        )

    def test_admin_deactivates_instead_of_deleting(self):
        client = api_client(self.admin)
        response = client.patch(f'{URL}{self.hospital.pk}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.delete(f'{URL}{self.hospital.pk}/').status_code, 405)

    def test_nearest(self):
        response = api_client(self.donor).get(
            f'{URL}nearest/',
            {'latitude': ORIGIN[0], 'longitude': ORIGIN[1], 'radius_km': 50},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['name'] for row in response.data], ["CHU Test", "CRTS Test"])
        self.assertAlmostEqual(response.data[0]['distance_km'], 1.0, delta=0.01)

    def test_nearest_with_type_filter_and_validation(self):
        client = api_client(self.donor)
        response = client.get(
            f'{URL}nearest/',
            {
                'latitude': ORIGIN[0],
                'longitude': ORIGIN[1],
                'facility_type': 'blood_bank',
            },
        )
        self.assertEqual([row['name'] for row in response.data], ["CRTS Test"])
        self.assertEqual(client.get(f'{URL}nearest/', {'latitude': 14}).status_code, 400)


class FacilityConstraintTests(TestCase):
    def test_case_insensitive_unique_name_per_region(self):
        make_facility("Hôpital Principal")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_facility("HÔPITAL PRINCIPAL".lower())

    def test_coordinates_check_constraint(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            HealthFacility.objects.create(
                name="Hors limites",
                facility_type='hospital',
                region='dakar',
                city='Dakar',
                latitude=120,
                longitude=0,
            )
