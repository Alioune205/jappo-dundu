"""
Tests de l'application Ambulances : flotte, positions, affectation de la
plus proche ambulance, cycle de vie des missions, indicateurs.

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from lits.models import BedCapacity
from security.roles import Role
from users.tests.factories import (
    ORIGIN,
    api_client,
    captured_broadcasts,
    make_facility,
    make_user,
    offset,
)

from .models import Ambulance, Mission

VEHICLES = '/api/ambulances/vehicles/'
MISSIONS = '/api/ambulances/missions/'


def make_ambulance(plate, facility, *, north_km=None, east_km=0.0, **fields):
    if north_km is not None:
        fields['latitude'], fields['longitude'] = offset(north_km, east_km)
    return Ambulance.objects.create(plate_number=plate, facility=facility, **fields)


def make_mission(**fields):
    latitude, longitude = offset(0, 0)
    fields.setdefault('pickup_latitude', latitude)
    fields.setdefault('pickup_longitude', longitude)
    fields.setdefault('region', 'dakar')
    return Mission.objects.create(**fields)


class AmbulanceFixturesMixin:
    @classmethod
    def setUpTestData(cls):
        cls.base = make_facility("SAMU Test", facility_type='ambulance_service')
        cls.hospital = make_facility("Hôpital A", north_km=6)
        cls.admin = make_user('admin', Role.ADMIN)
        cls.dispatcher = make_user('regulateur', Role.HOSPITAL_STAFF, facility=cls.hospital)
        cls.driver = make_user('chauffeur', Role.AMBULANCE_DRIVER)
        cls.other_driver = make_user('chauffeur2', Role.AMBULANCE_DRIVER)
        cls.donor = make_user('awa', Role.DONOR)
        cls.near = make_ambulance('DK-0001-AA', cls.base, north_km=2, driver=cls.driver)
        cls.medical = make_ambulance(
            'DK-0002-AA',
            cls.base,
            north_km=5,
            ambulance_type='medicalized',
            driver=cls.other_driver,
        )
        cls.far = make_ambulance('DK-0003-AA', cls.base, north_km=120)
        cls.broken = make_ambulance('DK-0004-AA', cls.base, north_km=1, status='out_of_service')


class FleetTests(AmbulanceFixturesMixin, TestCase):
    def test_read_access(self):
        for user in (self.admin, self.dispatcher, self.driver):
            self.assertEqual(api_client(user).get(VEHICLES).data['count'], 4)
        self.assertEqual(api_client(self.donor).get(VEHICLES).status_code, 403)
        self.assertEqual(api_client().get(VEHICLES).status_code, 401)

    def test_filters(self):
        client = api_client(self.admin)
        self.assertEqual(client.get(VEHICLES, {'status': 'available'}).data['count'], 3)
        self.assertEqual(client.get(VEHICLES, {'ambulance_type': 'medicalized'}).data['count'], 1)
        self.assertEqual(client.get(VEHICLES, {'region': 'thies'}).data['count'], 0)
        self.assertEqual(client.get(VEHICLES, {'status': 'garage'}).status_code, 400)

    def test_admin_registers_ambulance(self):
        driver = make_user('nouveau', Role.AMBULANCE_DRIVER)
        response = api_client(self.admin).post(
            VEHICLES,
            {
                'plate_number': " dk-2026-ab ",
                'facility_id': self.base.pk,
                'ambulance_type': 'medicalized',
                'driver_id': driver.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['plate_number'], 'DK-2026-AB')
        self.assertEqual(response.data['status'], 'available')
        self.assertEqual(response.data['driver']['id'], driver.pk)

    def test_registration_validation(self):
        client = api_client(self.admin)
        base = {'facility_id': self.base.pk}
        cases = [
            ({**base, 'plate_number': 'dk-0001-aa'}, 'plate_number'),
            ({**base, 'plate_number': '??'}, 'plate_number'),
            ({**base, 'plate_number': 'DK-9999-ZZ', 'driver_id': self.donor.pk}, 'driver_id'),
            ({**base, 'plate_number': 'DK-9999-ZZ', 'driver_id': self.driver.pk}, 'driver_id'),
        ]
        for payload, field in cases:
            with self.subTest(payload=payload):
                response = client.post(VEHICLES, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_only_admin_manages_fleet(self):
        self.assertEqual(
            api_client(self.dispatcher).post(VEHICLES, {}, format='json').status_code, 403
        )

    def test_driver_updates_own_position(self):
        latitude, longitude = offset(3, 1)
        client = api_client(self.driver)
        with (
            captured_broadcasts('ambulances.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client.post(
                f'{VEHICLES}{self.near.pk}/position/',
                {'latitude': latitude, 'longitude': longitude},
                format='json',
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertAlmostEqual(response.data['latitude'], latitude)
        self.assertIsNotNone(response.data['location_updated_at'])
        ((kind, data, kwargs),) = calls['dashboard']
        self.assertEqual(
            (kind, data['event'], kwargs['hospital_id']),
            ('dashboard', 'ambulance_position', self.base.pk),
        )

        other = client.post(
            f'{VEHICLES}{self.medical.pk}/position/',
            {'latitude': 14, 'longitude': -17},
            format='json',
        )
        self.assertEqual(other.status_code, 403)
        invalid = client.post(
            f'{VEHICLES}{self.near.pk}/position/',
            {'latitude': 'nan', 'longitude': 0},
            format='json',
        )
        self.assertEqual(invalid.status_code, 400)

    def test_mine(self):
        self.assertEqual(api_client(self.driver).get(f'{VEHICLES}mine/').data['id'], self.near.pk)
        lonely = make_user('sans_vehicule', Role.AMBULANCE_DRIVER)
        self.assertEqual(api_client(lonely).get(f'{VEHICLES}mine/').status_code, 404)

    def test_availability(self):
        client = api_client(self.driver)
        url = f'{VEHICLES}{self.near.pk}/availability/'
        self.assertEqual(
            client.post(url, {'status': 'out_of_service'}, format='json').data['status'],
            'out_of_service',
        )
        self.assertEqual(
            client.post(url, {'status': 'on_mission'}, format='json').status_code, 400
        )
        self.assertEqual(
            client.post(url, {'status': 'available'}, format='json').data['status'], 'available'
        )
        Ambulance.objects.filter(pk=self.near.pk).update(status='on_mission')
        self.assertEqual(
            client.post(url, {'status': 'out_of_service'}, format='json').status_code, 409
        )

    def test_nearest_available(self):
        client = api_client(self.dispatcher)
        response = client.get(
            f'{VEHICLES}nearest/', {'latitude': ORIGIN[0], 'longitude': ORIGIN[1]}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row['plate_number'] for row in response.data], ['DK-0001-AA', 'DK-0002-AA']
        )
        self.assertAlmostEqual(response.data[0]['distance_km'], 2, delta=0.01)
        medical = client.get(
            f'{VEHICLES}nearest/',
            {'latitude': ORIGIN[0], 'longitude': ORIGIN[1], 'ambulance_type': 'medicalized'},
        )
        self.assertEqual([row['plate_number'] for row in medical.data], ['DK-0002-AA'])
        self.assertEqual(
            api_client(self.driver)
            .get(f'{VEHICLES}nearest/', {'latitude': 14, 'longitude': -17})
            .status_code,
            403,
        )


class MissionLifecycleTests(AmbulanceFixturesMixin, TestCase):
    def create(self, **overrides):
        latitude, longitude = ORIGIN
        payload = {
            'priority': 'critical',
            'description': "Accident de la route",
            'pickup_address': "Corniche Ouest",
            'pickup_latitude': latitude,
            'pickup_longitude': longitude,
            'region': 'dakar',
            'caller_phone': "77 000 11 22",
        }
        payload.update(overrides)
        return api_client(self.dispatcher).post(MISSIONS, payload, format='json')

    def test_create_mission(self):
        with (
            captured_broadcasts('ambulances.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['caller_phone'], '+221770001122')
        ((kind, data, kwargs),) = calls['alert']
        self.assertEqual(
            (kind, data['event'], kwargs['region']), ('ambulance', 'mission_created', 'dakar')
        )

    def test_creation_rules(self):
        self.assertEqual(self.create(pickup_latitude=100).status_code, 400)
        self.assertEqual(self.create(region='paris').status_code, 400)
        driver_response = api_client(self.driver).post(MISSIONS, {}, format='json')
        self.assertEqual(driver_response.status_code, 403)

    def test_auto_assignment_picks_nearest_available(self):
        mission = make_mission()
        response = api_client(self.dispatcher).post(
            f'{MISSIONS}{mission.pk}/assign/', {}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'assigned')
        self.assertEqual(response.data['ambulance']['id'], self.near.pk)
        self.near.refresh_from_db()
        self.assertEqual(self.near.status, 'on_mission')

        second = make_mission()
        response = api_client(self.dispatcher).post(
            f'{MISSIONS}{second.pk}/assign/', {}, format='json'
        )
        self.assertEqual(response.data['ambulance']['id'], self.medical.pk)

        third = make_mission()
        response = api_client(self.dispatcher).post(
            f'{MISSIONS}{third.pk}/assign/', {}, format='json'
        )
        self.assertEqual(response.status_code, 409)
        wider = api_client(self.dispatcher).post(
            f'{MISSIONS}{third.pk}/assign/', {'radius_km': 200}, format='json'
        )
        self.assertEqual(wider.data['ambulance']['id'], self.far.pk)

    def test_assignment_by_type_or_explicit_vehicle(self):
        mission = make_mission()
        client = api_client(self.dispatcher)
        response = client.post(
            f'{MISSIONS}{mission.pk}/assign/', {'ambulance_type': 'medicalized'}, format='json'
        )
        self.assertEqual(response.data['ambulance']['id'], self.medical.pk)
        self.assertEqual(
            client.post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json').status_code, 409
        )

        other = make_mission()
        self.assertEqual(
            client.post(
                f'{MISSIONS}{other.pk}/assign/', {'ambulance_id': self.broken.pk}, format='json'
            ).status_code,
            409,
        )
        self.assertEqual(
            client.post(
                f'{MISSIONS}{other.pk}/assign/', {'ambulance_id': self.far.pk}, format='json'
            ).data['ambulance']['id'],
            self.far.pk,
        )
        both = client.post(
            f'{MISSIONS}{make_mission().pk}/assign/',
            {'ambulance_id': self.near.pk, 'ambulance_type': 'basic'},
            format='json',
        )
        self.assertEqual(both.status_code, 400)

    def test_driver_runs_the_mission_to_completion(self):
        mission = make_mission()
        api_client(self.dispatcher).post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json')
        driver = api_client(self.driver)
        url = f'{MISSIONS}{mission.pk}/status/'

        self.assertEqual(driver.post(url, {'status': 'completed'}, format='json').status_code, 409)
        self.assertEqual(
            driver.post(url, {'status': 'on_site'}, format='json').data['status'], 'on_site'
        )
        self.assertEqual(
            driver.post(url, {'status': 'transporting'}, format='json').status_code, 409
        )

        response = driver.post(
            url, {'status': 'transporting', 'destination_id': self.hospital.pk}, format='json'
        )
        self.assertEqual(response.data['destination']['id'], self.hospital.pk)

        with (
            captured_broadcasts('ambulances.services') as calls,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = driver.post(url, {'status': 'completed'}, format='json')
        self.assertEqual(response.data['status'], 'completed')
        self.assertIsNotNone(response.data['response_time_minutes'])
        for field in ('assigned_at', 'on_site_at', 'transporting_at', 'completed_at'):
            self.assertIsNotNone(response.data[field], field)
        self.near.refresh_from_db()
        self.assertEqual(self.near.status, 'available')
        self.assertEqual(calls['alert'][-1][2]['hospital_id'], self.hospital.pk)

    def test_cancellation(self):
        mission = make_mission()
        client = api_client(self.dispatcher)
        client.post(f'{MISSIONS}{mission.pk}/assign/', {}, format='json')
        url = f'{MISSIONS}{mission.pk}/status/'
        self.assertEqual(
            api_client(self.driver)
            .post(url, {'status': 'cancelled', 'cancellation_reason': 'x'}, format='json')
            .status_code,
            403,
        )
        self.assertEqual(client.post(url, {'status': 'cancelled'}, format='json').status_code, 400)
        response = client.post(
            url, {'status': 'cancelled', 'cancellation_reason': "Fausse alerte"}, format='json'
        )
        self.assertEqual(response.data['status'], 'cancelled')
        self.near.refresh_from_db()
        self.assertEqual(self.near.status, 'available')
        self.assertEqual(
            client.patch(
                f'{MISSIONS}{mission.pk}/', {'priority': 'normal'}, format='json'
            ).status_code,
            409,
        )

    def test_visibility_and_update(self):
        mine = make_mission(ambulance=self.near, status='assigned')
        make_mission(ambulance=self.medical, status='assigned')
        make_mission()
        driver_view = api_client(self.driver).get(MISSIONS)
        self.assertEqual([row['id'] for row in driver_view.data['results']], [mine.pk])
        client = api_client(self.dispatcher)
        self.assertEqual(client.get(MISSIONS).data['count'], 3)
        self.assertEqual(client.get(MISSIONS, {'status': 'pending'}).data['count'], 1)
        self.assertEqual(client.get(MISSIONS, {'active': 'true'}).data['count'], 3)

        response = client.patch(
            f'{MISSIONS}{mine.pk}/', {'priority': 'normal', 'pickup_latitude': 0}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['priority'], 'normal')
        self.assertNotEqual(response.data['pickup_latitude'], 0)  # lieu figé

    def test_destinations_use_bed_availability(self):
        BedCapacity.objects.create(
            facility=self.hospital, category='emergency', total_beds=5, occupied_beds=2
        )
        mission = make_mission()
        response = api_client(self.dispatcher).get(f'{MISSIONS}{mission.pk}/destinations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['category'], 'emergency')
        self.assertEqual([row['name'] for row in response.data['results']], ["Hôpital A"])
        self.assertEqual(response.data['results'][0]['available_beds'], 3)

    def test_one_active_mission_per_ambulance_in_database(self):
        make_mission(ambulance=self.near, status='assigned')
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_mission(ambulance=self.near, status='on_site')
        make_mission(ambulance=self.near, status='completed')

    def test_constraint_matches_active_statuses(self):
        constraint = next(
            c for c in Mission._meta.constraints if c.name == 'uniq_active_mission_per_ambulance'
        )
        self.assertEqual(
            set(dict(constraint.condition.children)['status__in']), set(Mission.ACTIVE_STATUSES)
        )


class MissionStatsTests(AmbulanceFixturesMixin, TestCase):
    def test_statistics(self):
        now = timezone.now()
        mission = make_mission(ambulance=self.near, status='completed')
        Mission.objects.filter(pk=mission.pk).update(
            created_at=now - timedelta(minutes=30),
            assigned_at=now - timedelta(minutes=28),
            on_site_at=now - timedelta(minutes=18),
        )
        make_mission()
        old = make_mission()
        Mission.objects.filter(pk=old.pk).update(created_at=now - timedelta(days=90))

        response = api_client(self.dispatcher).get(f'{MISSIONS}stats/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data['missions']['total'], 2)
        self.assertEqual(data['missions']['by_status']['completed'], 1)
        self.assertEqual(data['assignment_delay_minutes']['average'], 2.0)
        self.assertEqual(data['response_time_minutes']['median'], 12.0)
        self.assertEqual(data['fleet']['out_of_service'], 1)
        self.assertEqual(
            api_client(self.dispatcher).get(f'{MISSIONS}stats/', {'days': 0}).status_code, 400
        )
        self.assertEqual(api_client(self.driver).get(f'{MISSIONS}stats/').status_code, 403)
