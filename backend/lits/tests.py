"""
Tests de l'application Lits : capacités, admissions/sorties atomiques,
permissions par établissement, synthèse, recherche de proximité, alertes.

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import IntegrityError, transaction
from django.test import TestCase

from security.roles import Role
from users.models import HealthFacility
from users.tests.factories import ORIGIN, api_client, captured_broadcasts, make_facility, make_user

from .models import BedCapacity

URL = '/api/lits/capacities/'


class BedFixturesMixin:
    @classmethod
    def setUpTestData(cls):
        cls.hospital = make_facility("Hôpital A")
        cls.other_hospital = make_facility("Hôpital B", north_km=8)
        cls.far_hospital = make_facility("Hôpital C", north_km=80, region='thies', city="Thiès")
        cls.blood_bank = make_facility(
            "CNTS Test", east_km=1, facility_type=HealthFacility.FacilityType.BLOOD_BANK
        )
        cls.admin = make_user('admin', Role.ADMIN)
        cls.staff = make_user('staff_a', Role.HOSPITAL_STAFF, facility=cls.hospital)
        cls.other_staff = make_user('staff_b', Role.HOSPITAL_STAFF, facility=cls.other_hospital)
        cls.driver = make_user('chauffeur', Role.AMBULANCE_DRIVER)
        cls.donor = make_user('awa', Role.DONOR)
        cls.icu = BedCapacity.objects.create(
            facility=cls.hospital, category='intensive_care', total_beds=2, occupied_beds=1
        )
        cls.emergency_b = BedCapacity.objects.create(
            facility=cls.other_hospital, category='emergency', total_beds=10, occupied_beds=4
        )
        cls.emergency_c = BedCapacity.objects.create(
            facility=cls.far_hospital, category='emergency', total_beds=5, occupied_beds=0
        )


class CapacityReadTests(BedFixturesMixin, TestCase):
    def test_health_staff_and_drivers_can_read(self):
        for user in (self.admin, self.staff, self.driver):
            response = api_client(user).get(URL)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['count'], 3)
        self.assertEqual(api_client(self.donor).get(URL).status_code, 403)
        self.assertEqual(api_client().get(URL).status_code, 401)

    def test_representation(self):
        row = api_client(self.staff).get(f'{URL}{self.icu.pk}/').data
        self.assertEqual(row['available_beds'], 1)
        self.assertEqual(row['occupancy_rate'], 0.5)
        self.assertEqual(row['category_display'], "Réanimation / soins intensifs")
        self.assertEqual(row['facility']['name'], "Hôpital A")

    def test_filters(self):
        client = api_client(self.admin)
        self.assertEqual(client.get(URL, {'category': 'emergency'}).data['count'], 2)
        self.assertEqual(client.get(URL, {'region': 'thies'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'facility': self.hospital.pk}).data['count'], 1)
        self.icu.occupied_beds = 2
        self.icu.save()
        self.assertEqual(client.get(URL, {'available': 'true'}).data['count'], 2)
        self.assertEqual(client.get(URL, {'available': 'false'}).data['count'], 1)
        self.assertEqual(client.get(URL, {'category': 'spa'}).status_code, 400)

    def test_inactive_facilities_are_hidden(self):
        self.far_hospital.is_active = False
        self.far_hospital.save()
        self.assertEqual(api_client(self.admin).get(URL).data['count'], 2)

    def test_summary(self):
        response = api_client(self.admin).get(f'{URL}summary/')
        rows = {(row['region'], row['category']): row for row in response.data}
        self.assertEqual(rows[('dakar', 'emergency')]['available_beds'], 6)
        self.assertEqual(rows[('dakar', 'emergency')]['occupancy_rate'], 0.4)
        self.assertEqual(rows[('dakar', 'intensive_care')]['total_beds'], 2)
        self.assertEqual(rows[('thies', 'emergency')]['region_display'], "Thiès")
        filtered = api_client(self.admin).get(f'{URL}summary/', {'region': 'thies'}).data
        self.assertEqual(len(filtered), 1)


class CapacityWriteTests(BedFixturesMixin, TestCase):
    def test_staff_declares_a_service_for_own_facility(self):
        with (
            captured_broadcasts('lits.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = api_client(self.staff).post(
                URL, {'category': 'emergency', 'total_beds': 12, 'occupied_beds': 3}, format='json'
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['facility']['id'], self.hospital.pk)
        self.assertEqual(response.data['updated_by']['id'], self.staff.pk)
        ((kind, data, kwargs),) = calls['dashboard']
        self.assertEqual(
            (kind, data['event'], kwargs),
            ('kpi', 'bed_capacity_updated', {'hospital_id': self.hospital.pk}),
        )

    def test_duplicate_service_is_a_conflict(self):
        response = api_client(self.staff).post(
            URL, {'category': 'intensive_care', 'total_beds': 3}, format='json'
        )
        self.assertEqual(response.status_code, 409)

    def test_blood_bank_has_no_beds(self):
        response = api_client(self.admin).post(
            URL,
            {'category': 'emergency', 'total_beds': 3, 'facility_id': self.blood_bank.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 409)

    def test_validation(self):
        client = api_client(self.staff)
        self.assertEqual(
            client.post(
                URL, {'category': 'surgery', 'total_beds': 2, 'occupied_beds': 3}, format='json'
            ).status_code,
            400,
        )
        self.assertEqual(
            client.post(
                URL, {'category': 'surgery', 'total_beds': 5000}, format='json'
            ).status_code,
            400,
        )
        response = client.patch(f'{URL}{self.icu.pk}/', {'total_beds': 0}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_patch_own_facility_only(self):
        response = api_client(self.staff).patch(
            f'{URL}{self.icu.pk}/', {'total_beds': 4, 'category': 'surgery'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['total_beds'], 4)
        self.assertEqual(response.data['category'], 'intensive_care')  # non modifiable
        forbidden = api_client(self.other_staff).patch(
            f'{URL}{self.icu.pk}/', {'total_beds': 9}, format='json'
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(
            api_client(self.driver).patch(f'{URL}{self.icu.pk}/', {}, format='json').status_code,
            403,
        )

    def test_admit_and_discharge_respect_bounds(self):
        client = api_client(self.staff)
        with (
            captured_broadcasts('lits.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client.post(f'{URL}{self.icu.pk}/admit/')
        self.assertEqual(response.data['available_beds'], 0)
        ((kind, data, kwargs),) = calls['alert']
        self.assertEqual((kind, data['event']), ('bed', 'bed_capacity_saturated'))
        self.assertEqual(kwargs, {'region': 'dakar', 'hospital_id': self.hospital.pk})

        self.assertEqual(client.post(f'{URL}{self.icu.pk}/admit/').status_code, 409)

        with (
            captured_broadcasts('lits.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            client.post(f'{URL}{self.icu.pk}/discharge/')
        self.assertEqual(calls['alert'][0][1]['event'], 'bed_capacity_restored')
        client.post(f'{URL}{self.icu.pk}/discharge/')
        self.assertEqual(client.post(f'{URL}{self.icu.pk}/discharge/').status_code, 409)
        self.icu.refresh_from_db()
        self.assertEqual(self.icu.occupied_beds, 0)

    def test_non_critical_service_does_not_alert(self):
        surgery = BedCapacity.objects.create(
            facility=self.hospital, category='surgery', total_beds=1, occupied_beds=0
        )
        with (
            captured_broadcasts('lits.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            api_client(self.staff).post(f'{URL}{surgery.pk}/admit/')
        self.assertEqual(calls['alert'], [])
        self.assertEqual(len(calls['dashboard']), 1)

    def test_occupancy_constraint_in_database(self):
        self.icu.occupied_beds = 3
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.icu.save()


class NearestBedsTests(BedFixturesMixin, TestCase):
    def nearest(self, **params):
        query = {'latitude': ORIGIN[0], 'longitude': ORIGIN[1], **params}
        return api_client(self.driver).get(f'{URL}nearest/', query)

    def test_default_category_is_emergency(self):
        response = self.nearest(radius_km=100)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['name'] for row in response.data], ["Hôpital B", "Hôpital C"])
        self.assertEqual(response.data[0]['available_beds'], 6)
        self.assertAlmostEqual(response.data[0]['distance_km'], 8, delta=0.05)

    def test_category_radius_and_minimum(self):
        self.assertEqual(
            [row['name'] for row in self.nearest(category='intensive_care').data], ["Hôpital A"]
        )
        self.assertEqual(len(self.nearest().data), 1)  # rayon par défaut : 50 km
        self.assertEqual(
            [row['name'] for row in self.nearest(radius_km=100, min_available=6).data],
            ["Hôpital B"],
        )

    def test_full_service_is_excluded(self):
        self.emergency_b.occupied_beds = 10
        self.emergency_b.save()
        self.assertEqual([row['name'] for row in self.nearest(radius_km=100).data], ["Hôpital C"])

    def test_donor_cannot_search(self):
        response = api_client(self.donor).get(
            f'{URL}nearest/', {'latitude': ORIGIN[0], 'longitude': ORIGIN[1]}
        )
        self.assertEqual(response.status_code, 403)
