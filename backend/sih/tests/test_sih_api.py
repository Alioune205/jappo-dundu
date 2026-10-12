"""
Tests d'intégration et unitaires pour l'API SIH (Interopérabilité hospitalière).

Valide :
- L'authentification M2M par clé d'API (X-Hospital-API-Key, Authorization: Api-Key)
- La vérification de connectivité (GET /api/sih/ping/)
- La synchronisation globale des lits (POST /api/sih/beds/sync/)
- Le flux d'événements ADT temps réel (POST /api/sih/beds/event/ admit & discharge)
- La synchronisation automatique des stocks de sang (POST /api/sih/stocks/sync/)
- La gestion et révocation des clés d'API (POST/GET/DELETE /api/sih/keys/)
- L'enregistrement automatique des logs d'audit (HospitalSyncLog)

Auteur : Pape Alioune Sene
"""

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from lits.models import BedCapacity
from ml.models import BloodStockRecord
from security.roles import Role
from users.models import HealthFacility
from users.tests.factories import make_facility, make_user

from ..models import HospitalApiKey, HospitalSyncLog


class SIHAuthenticationTests(TestCase):
    """Tests du mécanisme d'authentification M2M par clé API d'établissement."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility("Centre Hospitalier National Dalal Jamm")
        self.api_key_obj = HospitalApiKey.objects.create(
            facility=self.facility,
            name="Connecteur OpenMRS",
        )
        self.valid_key = self.api_key_obj.key

    def test_request_without_auth_is_rejected(self):
        response = self.client.get('/api/sih/ping/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_request_with_invalid_key_fails(self):
        response = self.client.get(
            '/api/sih/ping/',
            HTTP_X_HOSPITAL_API_KEY="cle_completement_invalide",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_request_with_deactivated_key_fails(self):
        self.api_key_obj.is_active = False
        self.api_key_obj.save(update_fields=['is_active'])

        response = self.client.get(
            '/api/sih/ping/',
            HTTP_X_HOSPITAL_API_KEY=self.valid_key,
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_request_with_inactive_facility_fails(self):
        self.facility.is_active = False
        self.facility.save(update_fields=['is_active'])

        response = self.client.get(
            '/api/sih/ping/',
            HTTP_X_HOSPITAL_API_KEY=self.valid_key,
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_valid_key_via_custom_header(self):
        response = self.client.get(
            '/api/sih/ping/',
            HTTP_X_HOSPITAL_API_KEY=self.valid_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'connected')
        self.assertEqual(response.data['facility']['id'], self.facility.id)
        self.assertEqual(response.data['auth_method'], 'api_key')

        # Vérifie la mise à jour de last_used_at
        self.api_key_obj.refresh_from_db()
        self.assertIsNotNone(self.api_key_obj.last_used_at)

    def test_valid_key_via_authorization_header(self):
        response = self.client.get(
            '/api/sih/ping/',
            HTTP_AUTHORIZATION=f"Api-Key {self.valid_key}",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'connected')


class SIHBedsSyncTests(TestCase):
    """Tests de synchronisation des lits et gestion des événements ADT."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility("Hôpital Général Idrissa Pouye")
        self.api_key = HospitalApiKey.objects.create(
            facility=self.facility,
            name="SIH GNU Health",
        ).key

    def test_batch_beds_sync_creates_and_updates(self):
        # 1. Première synchronisation (création de 2 services)
        payload = {
            "services": [
                {
                    "category": "emergency",
                    "total_beds": 30,
                    "occupied_beds": 12,
                },
                {
                    "category": "intensive_care",
                    "total_beds": 10,
                    "occupied_beds": 8,
                },
            ]
        }

        response = self.client.post(
            '/api/sih/beds/sync/',
            payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['synced_services_count'], 2)
        self.assertEqual(BedCapacity.objects.filter(facility=self.facility).count(), 2)

        # Vérifie un lit créé
        urg = BedCapacity.objects.get(facility=self.facility, category='emergency')
        self.assertEqual(urg.total_beds, 30)
        self.assertEqual(urg.occupied_beds, 12)
        self.assertEqual(urg.available_beds, 18)

        # Vérifie qu'un log d'audit a été enregistré
        self.assertEqual(HospitalSyncLog.objects.filter(facility=self.facility).count(), 1)
        log = HospitalSyncLog.objects.first()
        self.assertEqual(log.sync_type, 'beds_sync')
        self.assertEqual(log.status, 'success')
        self.assertEqual(log.items_count, 2)

        # 2. Deuxième synchronisation : mise à jour des capacités
        update_payload = {
            "services": [
                {
                    "category": "emergency",
                    "total_beds": 35,
                    "occupied_beds": 20,
                }
            ]
        }
        res2 = self.client.post(
            '/api/sih/beds/sync/',
            update_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        urg.refresh_from_db()
        self.assertEqual(urg.total_beds, 35)
        self.assertEqual(urg.occupied_beds, 20)
        self.assertEqual(urg.available_beds, 15)

    def test_batch_beds_sync_validation_error(self):
        # Lits occupés supérieurs aux lits installés
        invalid_payload = {
            "services": [
                {
                    "category": "emergency",
                    "total_beds": 10,
                    "occupied_beds": 15,
                }
            ]
        }
        response = self.client.post(
            '/api/sih/beds/sync/',
            invalid_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bed_adt_event_admit_and_discharge(self):
        # Créer au préalable un service
        BedCapacity.objects.create(
            facility=self.facility,
            category='emergency',
            total_beds=20,
            occupied_beds=18,
        )

        # 1. Événement ADT: Admission d'un patient
        admit_payload = {
            "category": "emergency",
            "action": "admit",
            "delta": 1,
            "patient_ref": "ADT-PAT-001",
        }
        res_admit = self.client.post(
            '/api/sih/beds/event/',
            admit_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res_admit.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admit.data['event']['occupied_beds'], 19)
        self.assertEqual(res_admit.data['event']['available_beds'], 1)

        # 2. Admission d'un second patient (atteint 20/20)
        res_admit2 = self.client.post(
            '/api/sih/beds/event/',
            admit_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res_admit2.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admit2.data['event']['occupied_beds'], 20)
        self.assertEqual(res_admit2.data['event']['available_beds'], 0)

        # 3. Tentative d'admission sur service saturé -> Conflit 409
        res_admit_sat = self.client.post(
            '/api/sih/beds/event/',
            admit_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res_admit_sat.status_code, status.HTTP_409_CONFLICT)

        # 4. Événement ADT: Décharge (sortie de patient)
        discharge_payload = {
            "category": "emergency",
            "action": "discharge",
            "delta": 2,
        }
        res_disc = self.client.post(
            '/api/sih/beds/event/',
            discharge_payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res_disc.status_code, status.HTTP_200_OK)
        self.assertEqual(res_disc.data['event']['occupied_beds'], 18)
        self.assertEqual(res_disc.data['event']['available_beds'], 2)


class SIHBloodStockSyncTests(TestCase):
    """Tests de synchronisation automatisée des stocks sanguins par le SIH."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility(
            "Centre Régional de Transfusion Sanguine Thiès",
            region='thies',
            facility_type=HealthFacility.FacilityType.BLOOD_BANK,
        )
        self.api_key = HospitalApiKey.objects.create(
            facility=self.facility,
            name="LIS Laboratoire",
        ).key

    def test_sync_blood_stocks_batch(self):
        payload = {
            "stocks": [
                {
                    "blood_group": "O+",
                    "units_available": 45,
                    "units_donated": 10,
                    "units_used": 5,
                    "units_expired": 0,
                },
                {
                    "blood_group": "AB-",
                    "units_available": 4,
                    "units_donated": 1,
                    "units_used": 2,
                    "units_expired": 1,
                },
            ]
        }

        response = self.client.post(
            '/api/sih/stocks/sync/',
            payload,
            format='json',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['synced_stocks_count'], 2)

        # Vérifie en base de données
        records = BloodStockRecord.objects.filter(center_name=self.facility.name)
        self.assertEqual(records.count(), 2)

        o_pos = records.get(blood_group='O+')
        self.assertEqual(o_pos.units_available, 45)
        self.assertEqual(o_pos.source, 'sih')

        # Vérifie la consultation via GET /api/sih/stocks/status/
        res_status = self.client.get(
            '/api/sih/stocks/status/',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_status.data), 2)


class SIHStatusAndLogsTests(TestCase):
    """Tests de synthèse des ressources et des journaux d'audit."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility("Hôpital de Fann")
        self.api_key = HospitalApiKey.objects.create(
            facility=self.facility,
            name="SIH Principal",
        ).key

    def test_facility_status_summary(self):
        # Ajouter 1 lit
        BedCapacity.objects.create(
            facility=self.facility,
            category='surgery',
            total_beds=25,
            occupied_beds=15,
        )

        response = self.client.get(
            '/api/sih/status/',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['facility']['id'], self.facility.id)
        self.assertEqual(data['beds_summary']['total_installed'], 25)
        self.assertEqual(data['beds_summary']['total_occupied'], 15)
        self.assertEqual(data['beds_summary']['total_available'], 10)
        self.assertEqual(data['beds_summary']['occupancy_rate_percent'], 60.0)

    def test_logs_view(self):
        # Créer deux logs
        HospitalSyncLog.objects.create(
            facility=self.facility,
            sync_type='beds_sync',
            status='success',
            items_count=3,
        )
        HospitalSyncLog.objects.create(
            facility=self.facility,
            sync_type='blood_sync',
            status='success',
            items_count=2,
        )

        response = self.client.get(
            '/api/sih/logs/',
            HTTP_X_HOSPITAL_API_KEY=self.api_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)


class SIHKeyManagementTests(TestCase):
    """Tests de génération et révocation des clés API SIH par le personnel hospitalier."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility("Hôpital Militaire de Ouakam")
        self.staff_user = make_user('staff_ouakam', Role.HOSPITAL_STAFF, facility=self.facility)
        self.admin_user = make_user('super_admin', Role.ADMIN)

    def test_staff_create_and_list_keys(self):
        self.client.force_authenticate(user=self.staff_user)

        # Création d'une clé API
        payload = {"name": "Passerelle OpenMRS Urgences"}
        res_create = self.client.post('/api/sih/keys/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        created_key = res_create.data['key']
        self.assertTrue(created_key.startswith('jd_sih_'))

        # Liste des clés
        res_list = self.client.get('/api/sih/keys/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.data), 1)
        self.assertEqual(res_list.data[0]['name'], "Passerelle OpenMRS Urgences")

        # Révocation d'une clé (DELETE)
        key_id = res_list.data[0]['id']
        res_del = self.client.delete(f'/api/sih/keys/{key_id}/')
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)

        # La clé est marquée désactivée
        key_obj = HospitalApiKey.objects.get(pk=key_id)
        self.assertFalse(key_obj.is_active)
