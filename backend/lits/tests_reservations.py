"""
Tests des réservations de lits.

Établissements : deux hôpitaux à Dakar (A, B), un à Thiès, un SAMU à Dakar et
un à Thiès. Le service testé (A, réanimation) a 4 lits dont 2 occupés.
"""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from ambulances import services as mission_services
from ambulances.models import Mission
from security.roles import Role
from sih import services as sih_services
from users.tests.factories import ORIGIN, api_client, make_facility, make_user

from . import services
from .models import BedCapacity, BedReservation

RESERVATIONS = '/api/lits/reservations/'
CAPACITIES = '/api/lits/capacities/'

# Les diffusions temps réel ne sont pas l'objet de ces tests.
_quiet = mock.patch('lits.services.transaction.on_commit', lambda fn: None)


class ReservationFixtures:
    @classmethod
    def setUpTestData(cls):
        cls.hosp_a = make_facility("Hôpital A")
        cls.hosp_b = make_facility("Hôpital B", east_km=4)
        cls.hosp_thies = make_facility("Hôpital Thiès", region='thies', city='Thiès', north_km=60)
        cls.samu = make_facility("SAMU Dakar", facility_type='ambulance_service', north_km=1)
        cls.samu_thies = make_facility(
            "SAMU Thiès", facility_type='ambulance_service', region='thies', city='Thiès', north_km=61
        )
        cls.admin = make_user('admin', Role.ADMIN)
        cls.bed_a = make_user('lits_a', Role.BED_MANAGER, facility=cls.hosp_a)
        cls.bed_b = make_user('lits_b', Role.BED_MANAGER, facility=cls.hosp_b)
        cls.blood_a = make_user('sang_a', Role.BLOOD_MANAGER, facility=cls.hosp_a)
        cls.samu_user = make_user('regulation', Role.AMBULANCE_MANAGER, facility=cls.samu)
        cls.samu_thies_user = make_user('regulation_thies', Role.AMBULANCE_MANAGER, facility=cls.samu_thies)

    def setUp(self):
        _quiet.start()
        self.addCleanup(_quiet.stop)
        self.rea = BedCapacity.objects.create(
            facility=self.hosp_a, category='intensive_care', total_beds=4, occupied_beds=2
        )

    def reserve(self, user, **payload):
        payload.setdefault('capacity_id', self.rea.pk)
        return api_client(user).post(RESERVATIONS, payload, format='json')

    def mission(self, **fields):
        lat, lon = ORIGIN
        fields.setdefault('region', 'dakar')
        fields.setdefault('status', Mission.Status.TRANSPORTING)
        return Mission.objects.create(pickup_latitude=lat, pickup_longitude=lon, **fields)


class ReservationLifecycleTests(ReservationFixtures, TestCase):
    def test_reserving_takes_a_free_bed(self):
        response = self.reserve(self.bed_a, reference="Transfert bloc 2")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'active')
        self.rea.refresh_from_db()
        self.assertEqual((self.rea.reserved_beds, self.rea.available_beds), (1, 1))
        listed = api_client(self.bed_a).get(CAPACITIES, {'facility': self.hosp_a.pk}).data['results'][0]
        self.assertEqual((listed['reserved_beds'], listed['available_beds']), (1, 1))

    def test_full_service_cannot_be_reserved(self):
        self.reserve(self.bed_a)
        self.reserve(self.bed_a)
        self.assertEqual(self.reserve(self.bed_a).status_code, 409)

    def test_walk_in_admission_cannot_take_a_reserved_bed(self):
        self.reserve(self.bed_a)
        self.reserve(self.bed_a)
        response = api_client(self.bed_a).post(f'{CAPACITIES}{self.rea.pk}/admit/')
        self.assertEqual(response.status_code, 409)

    def test_fulfill_turns_the_reserved_bed_into_an_occupied_one(self):
        reservation_id = self.reserve(self.bed_a).data['id']
        response = api_client(self.bed_a).post(f'{RESERVATIONS}{reservation_id}/fulfill/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'fulfilled')
        self.rea.refresh_from_db()
        self.assertEqual((self.rea.occupied_beds, self.rea.reserved_beds, self.rea.available_beds), (3, 0, 1))
        # Une réservation clôturée ne se clôt pas deux fois.
        self.assertEqual(api_client(self.bed_a).post(f'{RESERVATIONS}{reservation_id}/cancel/').status_code, 409)

    def test_cancel_frees_the_bed(self):
        reservation_id = self.reserve(self.bed_a).data['id']
        response = api_client(self.bed_a).post(f'{RESERVATIONS}{reservation_id}/cancel/', {'reason': 'Réorienté'})
        self.assertEqual(response.data['status'], 'cancelled')
        self.assertEqual(response.data['closing_reason'], 'Réorienté')
        self.rea.refresh_from_db()
        self.assertEqual((self.rea.reserved_beds, self.rea.available_beds), (0, 2))

    def test_expired_reservations_release_their_bed(self):
        reservation_id = self.reserve(self.bed_a).data['id']
        BedReservation.objects.filter(pk=reservation_id).update(expires_at=timezone.now() - timedelta(minutes=1))
        rows = api_client(self.bed_a).get(RESERVATIONS).data['results']
        self.assertEqual(rows[0]['status'], 'expired')
        self.rea.refresh_from_db()
        self.assertEqual(self.rea.reserved_beds, 0)

    def test_manual_adjustment_cannot_drop_a_promised_bed(self):
        self.reserve(self.bed_a)
        response = api_client(self.bed_a).patch(f'{CAPACITIES}{self.rea.pk}/', {'occupied_beds': 4}, format='json')
        self.assertEqual(response.status_code, 409)

    def test_hold_duration_is_bounded(self):
        self.assertEqual(self.reserve(self.bed_a, hold_minutes=600).status_code, 400)
        response = self.reserve(self.bed_a, hold_minutes=30)
        expires = BedReservation.objects.get(pk=response.data['id']).expires_at
        self.assertAlmostEqual((expires - timezone.now()).total_seconds(), 30 * 60, delta=60)


class ReservationAccessTests(ReservationFixtures, TestCase):
    def test_bed_manager_reserves_only_in_its_hospital(self):
        self.assertEqual(self.reserve(self.bed_b).status_code, 403)
        self.assertEqual(self.reserve(self.bed_a).status_code, 201)

    def test_dispatcher_reserves_in_its_region_but_does_not_admit(self):
        response = self.reserve(self.samu_user)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(api_client(self.samu_user).post(f"{RESERVATIONS}{response.data['id']}/fulfill/").status_code, 403)
        self.assertEqual(self.reserve(self.samu_thies_user).status_code, 403)

    def test_blood_manager_has_no_access(self):
        self.assertEqual(api_client(self.blood_a).get(RESERVATIONS).status_code, 403)
        self.assertEqual(self.reserve(self.blood_a).status_code, 403)

    def test_listing_is_scoped(self):
        self.reserve(self.bed_a)
        thies = BedCapacity.objects.create(facility=self.hosp_thies, category='emergency', total_beds=5)
        self.reserve(self.admin, capacity_id=thies.pk)

        def facilities(user):
            return {row['facility']['id'] for row in api_client(user).get(RESERVATIONS).data['results']}

        self.assertEqual(facilities(self.admin), {self.hosp_a.pk, self.hosp_thies.pk})
        self.assertEqual(facilities(self.bed_a), {self.hosp_a.pk})
        self.assertEqual(facilities(self.bed_b), set())
        self.assertEqual(facilities(self.samu_user), {self.hosp_a.pk})
        self.assertEqual(facilities(self.samu_thies_user), {self.hosp_thies.pk})


class MissionReservationTests(ReservationFixtures, TestCase):
    def test_reservation_for_a_mission_sets_its_destination(self):
        mission = self.mission()
        response = self.reserve(self.samu_user, mission_id=mission.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['mission']['id'], mission.pk)
        mission.refresh_from_db()
        self.assertEqual(mission.destination_id, self.hosp_a.pk)

    def test_reorientation_replaces_the_previous_reservation(self):
        mission = self.mission()
        first = self.reserve(self.samu_user, mission_id=mission.pk).data['id']
        other = BedCapacity.objects.create(facility=self.hosp_b, category='intensive_care', total_beds=3)
        self.reserve(self.samu_user, capacity_id=other.pk, mission_id=mission.pk)
        self.assertEqual(BedReservation.objects.get(pk=first).status, 'cancelled')
        self.rea.refresh_from_db()
        self.assertEqual(self.rea.reserved_beds, 0)
        mission.refresh_from_db()
        self.assertEqual(mission.destination_id, self.hosp_b.pk)

    def test_completed_mission_admits_the_patient(self):
        mission = self.mission()
        self.reserve(self.samu_user, mission_id=mission.pk)
        mission_services.advance(mission, Mission.Status.COMPLETED)
        reservation = BedReservation.objects.get(mission=mission)
        self.assertEqual(reservation.status, 'fulfilled')
        self.rea.refresh_from_db()
        self.assertEqual((self.rea.occupied_beds, self.rea.reserved_beds), (3, 0))

    def test_cancelled_mission_frees_the_bed(self):
        mission = self.mission(status=Mission.Status.PENDING)
        self.reserve(self.samu_user, mission_id=mission.pk)
        mission_services.advance(mission, Mission.Status.CANCELLED, cancellation_reason="Fausse alerte")
        self.assertEqual(BedReservation.objects.get(mission=mission).status, 'cancelled')
        self.rea.refresh_from_db()
        self.assertEqual(self.rea.reserved_beds, 0)

    def test_mission_outside_the_dispatcher_scope_is_refused(self):
        mission = self.mission(region='thies')
        self.assertEqual(self.reserve(self.samu_user, mission_id=mission.pk).status_code, 403)

    def test_closed_mission_cannot_reserve(self):
        mission = self.mission(status=Mission.Status.COMPLETED)
        self.assertEqual(self.reserve(self.admin, mission_id=mission.pk).status_code, 409)


class SIHReservationTests(ReservationFixtures, TestCase):
    def test_sih_declaring_the_service_full_releases_reservations(self):
        self.reserve(self.bed_a)
        self.reserve(self.bed_a)
        sih_services.sync_beds_batch(
            self.hosp_a, [{'category': 'intensive_care', 'total_beds': 4, 'occupied_beds': 3}]
        )
        self.rea.refresh_from_db()
        self.assertEqual((self.rea.occupied_beds, self.rea.reserved_beds), (3, 1))
        # La réservation la plus récente est libérée d'abord.
        statuses = list(BedReservation.objects.order_by('created_at').values_list('status', flat=True))
        self.assertEqual(statuses, ['active', 'cancelled'])

    def test_expiry_command(self):
        reservation = services.reserve(self.rea, created_by=self.bed_a)
        BedReservation.objects.filter(pk=reservation.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(services.release_expired(), 1)
