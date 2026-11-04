"""
Tests des transferts entre établissements et du niveau de tension des hôpitaux.
"""

from django.test import TestCase

from lits.models import BedCapacity, BedReservation
from lits.services import tension_of
from security.roles import Role
from users.tests.factories import api_client, make_facility, make_user

from .models import Mission
from .tests import MISSIONS, AmbulanceFixturesMixin


class TransferTests(AmbulanceFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.clinic = make_facility("Clinique de départ", north_km=1, facility_type='clinic')
        cls.origin_manager = make_user('lits_depart', Role.BED_MANAGER, facility=cls.clinic)
        cls.icu = BedCapacity.objects.create(facility=cls.hospital, category='intensive_care', total_beds=2)

    def transfer(self, user=None, **fields):
        body = {'destination_id': self.hospital.pk, 'category': 'intensive_care', 'priority': 'urgent', **fields}
        return api_client(user or self.origin_manager).post(f'{MISSIONS}transfer/', body, format='json')

    def test_transfer_creates_a_mission_with_a_reserved_bed(self):
        response = self.transfer(description="Insuffisance respiratoire, besoin de réanimation")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['source'], 'transfer')
        self.assertEqual(response.data['origin_facility']['id'], self.clinic.pk)
        self.assertEqual(response.data['destination']['id'], self.hospital.pk)
        self.assertEqual(response.data['destination_status'], 'pending')
        self.assertEqual(response.data['status'], 'pending')  # la régulation affecte l'ambulance
        reservation = BedReservation.objects.get(mission_id=response.data['id'])
        self.assertEqual(reservation.status, 'active')
        # L'établissement de départ suit son transfert.
        self.assertEqual(api_client(self.origin_manager).get(f"{MISSIONS}{response.data['id']}/").status_code, 200)

    def test_guards(self):
        self.icu.occupied_beds = 2
        self.icu.save()
        self.assertEqual(self.transfer().status_code, 409)  # aucun lit libre
        self.assertEqual(Mission.objects.filter(source='transfer').count(), 0)  # rien de créé
        self.assertEqual(self.transfer(destination_id=self.clinic.pk).status_code, 409)
        self.assertEqual(self.transfer(user=self.driver).status_code, 403)
        self.assertEqual(self.transfer(user=self.admin).status_code, 403)  # supervision : pas d'opération métier


class TensionTests(AmbulanceFixturesMixin, TestCase):
    def capacity(self, category, total, occupied):
        return BedCapacity(facility=self.hospital, category=category, total_beds=total, occupied_beds=occupied)

    def test_levels(self):
        self.assertEqual(tension_of([self.capacity('surgery', 10, 5)])['level'], 1)
        self.assertEqual(tension_of([self.capacity('surgery', 10, 8)])['level'], 2)
        self.assertEqual(tension_of([self.capacity('emergency', 10, 10), self.capacity('surgery', 30, 10)])['level'], 3)
        full = tension_of([self.capacity('emergency', 10, 10), self.capacity('surgery', 10, 10)])
        self.assertEqual(full['level'], 4)
        self.assertIn("Urgences plein", full['reasons'])

    def test_endpoint_sorted_by_level(self):
        BedCapacity.objects.create(facility=self.hospital, category='emergency', total_beds=4, occupied_beds=4)
        calm = make_facility("Hôpital calme", north_km=9)
        BedCapacity.objects.create(facility=calm, category='emergency', total_beds=10, occupied_beds=1)
        rows = api_client(self.admin).get('/api/lits/capacities/tension/').data
        self.assertEqual([row['facility']['name'] for row in rows], ["Hôpital A", "Hôpital calme"])
        self.assertEqual(rows[0]['level'], 4)
