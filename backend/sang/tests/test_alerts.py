"""
Tests des alertes par vagues : taille selon l'urgence, vague suivante quand
les engagements manquent, élargissement du rayon, anti-sollicitation, heures
calmes, canal push ou SMS.
"""

from datetime import datetime, timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from push.models import PushDevice

from .. import alerts
from ..models import BloodRequest, DonorAlert, DonorResponse
from .helpers import SangFixturesMixin, make_donor, make_request

# Midi à Dakar : hors des heures calmes.
NOON = timezone.make_aware(datetime(2026, 10, 30, 12, 0))
NIGHT = timezone.make_aware(datetime(2026, 10, 30, 23, 30))


@override_settings(
    BLOOD_ALERT_WAVE_SIZE={'critical': 3, 'urgent': 2, 'normal': 1},
    BLOOD_ALERT_WAVE_MINUTES={'critical': 5, 'urgent': 10, 'normal': 30},
    BLOOD_ALERT_MAX_WAVES=3,
    BLOOD_ALERT_MAX_PER_WEEK=2,
    PUSH_ENABLED=False,
)
class AlertWaveTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.donors = [make_donor(f'donneur{i}', north_km=i + 1) for i in range(5)]

    def wave(self, blood_request, now=NOON):
        with mock.patch('sang.notifications.send_sms') as sms:
            with self.captureOnCommitCallbacks(execute=True):
                count = alerts.send_wave(blood_request, now=now)
        blood_request.refresh_from_db()
        return count, sms

    def alerted(self, blood_request):
        return list(
            DonorAlert.objects.filter(blood_request=blood_request).order_by('donor__user__username').values_list(
                'donor__user__username', flat=True
            )
        )

    def test_first_wave_takes_the_nearest_by_urgency(self):
        request = make_request(self.hospital, urgency='urgent')
        count, _ = self.wave(request)
        self.assertEqual(count, 2)
        self.assertEqual(self.alerted(request), ['donneur0', 'donneur1'])
        self.assertEqual(request.alert_wave, 1)

    def test_next_wave_skips_already_alerted_donors(self):
        request = make_request(self.hospital, urgency='urgent')
        self.wave(request)
        self.wave(request)
        self.assertEqual(self.alerted(request), ['donneur0', 'donneur1', 'donneur2', 'donneur3'])
        self.assertEqual(request.alert_wave, 2)

    def test_radius_doubles_when_nobody_is_in_range(self):
        # Hôpital B : le donneur le plus proche est à 5,1 km.
        far = make_request(self.other_hospital, urgency='critical', search_radius_km=1)
        count, _ = self.wave(far)
        self.assertEqual(count, 3)
        self.assertEqual(far.search_radius_km, 8)

    def test_weekly_cap_except_critical(self):
        for i in range(2):
            self.wave(make_request(self.hospital, urgency='normal'))
            self.wave(make_request(self.hospital, urgency='normal'))
        # donneur0 et donneur1 ont chacun reçu 2 alertes cette semaine.
        normal = make_request(self.hospital, urgency='normal')
        self.wave(normal)
        self.assertEqual(self.alerted(normal), ['donneur2'])
        critical = make_request(self.hospital, urgency='critical')
        self.wave(critical)
        self.assertEqual(self.alerted(critical), ['donneur0', 'donneur1', 'donneur2'])

    def test_quiet_hours_only_delay_normal_requests(self):
        normal = make_request(self.hospital, urgency='normal')
        self.assertEqual(self.wave(normal, now=NIGHT)[0], 0)
        self.assertEqual(normal.alert_wave, 0)
        urgent = make_request(self.hospital, urgency='urgent')
        self.assertEqual(self.wave(urgent, now=NIGHT)[0], 2)

    def test_closed_request_and_wave_limit(self):
        request = make_request(self.hospital, urgency='normal')
        BloodRequest.objects.filter(pk=request.pk).update(alert_wave=3)
        self.assertEqual(self.wave(request)[0], 0)
        request.status = BloodRequest.Status.CANCELLED
        request.alert_wave = 0
        request.save()
        self.assertEqual(self.wave(request)[0], 0)

    def test_push_for_registered_phones_sms_otherwise(self):
        PushDevice.objects.create(user=self.donors[0].user, token='ExponentPushToken[abc]', platform='android')
        request = make_request(self.hospital, urgency='urgent')
        _, sms = self.wave(request)
        channels = dict(DonorAlert.objects.values_list('donor__user__username', 'channel'))
        self.assertEqual(channels, {'donneur0': 'push', 'donneur1': 'sms'})
        self.assertEqual(sms.call_count, 1)

    def test_escalation_waits_for_delay_and_missing_commitments(self):
        request = make_request(self.hospital, urgency='urgent', units_needed=1)
        self.wave(request)
        self.assertFalse(alerts.needs_next_wave(request, NOON + timedelta(minutes=5)))
        self.assertTrue(alerts.needs_next_wave(request, NOON + timedelta(minutes=11)))
        DonorResponse.objects.create(
            blood_request=request, donor=self.donors[0], status=DonorResponse.Status.ACCEPTED
        )
        self.assertFalse(alerts.needs_next_wave(request, NOON + timedelta(minutes=11)))

    def test_escalate_open_requests(self):
        request = make_request(self.hospital, urgency='urgent')
        self.wave(request)
        with mock.patch('sang.notifications.send_sms'):
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(alerts.escalate_open_requests(NOON + timedelta(minutes=11)), 1)
        request.refresh_from_db()
        self.assertEqual(request.alert_wave, 2)


@override_settings(BLOOD_ALERT_WAVE_SIZE={'critical': 3, 'urgent': 2, 'normal': 1}, BLOOD_ALERT_MAX_WAVES=2, PUSH_ENABLED=False)
class ManualRelaunchTests(SangFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.donors = [make_donor(f'donneur{i}', north_km=i + 1) for i in range(3)]

    def relaunch(self, request, user=None):
        from users.tests.factories import api_client

        with mock.patch('sang.notifications.send_sms'):
            with self.captureOnCommitCallbacks(execute=True):
                return api_client(user or self.staff).post(f'/api/sang/requests/{request.pk}/alert-next-wave/')

    def test_staff_relaunches_even_at_night(self):
        request = make_request(self.hospital, urgency='normal')
        with mock.patch('sang.alerts.in_quiet_hours', return_value=True):
            response = self.relaunch(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['alerted_donors'], 1)
        self.assertEqual(response.data['alert_wave'], 1)

    def test_limits(self):
        request = make_request(self.hospital, urgency='normal')
        self.assertEqual(self.relaunch(request, self.other_staff).status_code, 404)
        self.relaunch(request)
        self.relaunch(request)
        self.assertEqual(self.relaunch(request).status_code, 409)
