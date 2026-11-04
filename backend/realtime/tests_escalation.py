"""Tests des alertes critiques : création, fermeture automatique, accusé, relances SMS."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from ambulances import services as mission_services
from ambulances.tests import AmbulanceFixturesMixin, make_mission
from lits.models import BedCapacity
from lits.services import reserve
from security.roles import Role
from users.tests.factories import api_client, make_user

from .escalation import escalate
from .models import CriticalAlert


@override_settings(CRITICAL_ESCALATION_MINUTES=2, OSRM_URL='')
class CriticalAlertTests(AmbulanceFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.base.on_call_phone = '+221338000000'
        cls.base.save()
        cls.capacity = BedCapacity.objects.create(facility=cls.hospital, category='emergency', total_beds=3)
        cls.bed_manager = make_user('lits_a', Role.BED_MANAGER, facility=cls.hospital)
        cls.admin.profile.phone_number = '+221770000001'
        cls.admin.profile.save()

    def create_critical(self):
        with self.captureOnCommitCallbacks(execute=True):
            return mission_services.create_mission(
                created_by=self.admin,
                priority='critical',
                description='Arrêt cardiaque',
                pickup_address='Plateau',
                pickup_latitude=self.base.latitude,
                pickup_longitude=self.base.longitude,
                region='dakar',
            )

    def test_critical_mission_alert_closes_when_assigned(self):
        mission = self.create_critical()
        alert = CriticalAlert.objects.get(target_id=mission.pk, kind='mission')
        self.assertEqual(alert.facility, self.base)
        mission_services.assign(mission)
        alert.refresh_from_db()
        self.assertIsNotNone(alert.acknowledged_at)

    def test_unanswered_alert_goes_to_on_call_then_admins(self):
        self.create_critical()
        CriticalAlert.objects.update(created_at=timezone.now() - timedelta(minutes=3))
        with mock.patch('identity.sms.send_sms') as sms:
            self.assertEqual(escalate(), 1)
            sms.assert_called_once()
            self.assertEqual(sms.call_args.args[0], '+221338000000')
        CriticalAlert.objects.update(created_at=timezone.now() - timedelta(minutes=5))
        with mock.patch('identity.sms.send_sms') as sms:
            self.assertEqual(escalate(), 1)
            self.assertEqual(sms.call_args.args[0], '+221770000001')
            # L'administrateur général supervise : il est orienté vers la régulation, pas invité à affecter.
            self.assertIn("Contactez la régulation SAMU", sms.call_args.args[1])
            self.assertNotIn("affecter", sms.call_args.args[1].lower())
        with mock.patch('identity.sms.send_sms') as sms:
            self.assertEqual(escalate(), 0)  # plus de relance au-delà de l'administrateur

    def test_prealert_alert_until_the_hospital_answers(self):
        mission = make_mission(priority='urgent', ambulance=self.near, status='transporting')
        reserve(self.capacity, created_by=self.admin, mission=mission)
        alerts = api_client(self.bed_manager).get('/api/realtime/critical-alerts/').data
        self.assertEqual([a['kind'] for a in alerts], ['prealert'])
        api_client(self.bed_manager).post(
            f'/api/ambulances/missions/{mission.pk}/destination-response/', {'accepted': True}, format='json'
        )
        self.assertEqual(api_client(self.bed_manager).get('/api/realtime/critical-alerts/').data, [])

    def test_supervisor_sees_alert_but_cannot_acknowledge_it(self):
        self.create_critical()
        alert = CriticalAlert.objects.get()
        admin = api_client(self.admin)
        # Il la voit toujours...
        self.assertEqual([a['critical_alert_id'] for a in admin.get('/api/realtime/critical-alerts/').data], [alert.pk])
        # ... mais ne peut pas la marquer prise en charge (lecture seule).
        response = admin.post(f'/api/realtime/critical-alerts/{alert.pk}/ack/')
        self.assertEqual(response.status_code, 403)
        self.assertIn('Lecture seule', str(response.data['detail']))
        alert.refresh_from_db()
        self.assertIsNone(alert.acknowledged_at)
        # La relance continue donc vers la ligne de garde.
        CriticalAlert.objects.update(created_at=timezone.now() - timedelta(minutes=3))
        with mock.patch('identity.sms.send_sms') as sms:
            self.assertEqual(escalate(), 1)
            self.assertEqual(sms.call_args.args[0], '+221338000000')

    def test_manual_acknowledgement(self):
        self.create_critical()
        alert = CriticalAlert.objects.get()
        other = make_user('autre', Role.BED_MANAGER, facility=self.hospital)
        self.assertEqual(api_client(other).post(f'/api/realtime/critical-alerts/{alert.pk}/ack/').status_code, 404)
        response = api_client(self.dispatcher).post(f'/api/realtime/critical-alerts/{alert.pk}/ack/')
        self.assertEqual(response.data['acknowledged'], True)
        with mock.patch('identity.sms.send_sms') as sms:
            CriticalAlert.objects.update(created_at=timezone.now() - timedelta(minutes=10))
            self.assertEqual(escalate(), 0)
            sms.assert_not_called()
