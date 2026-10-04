"""
Tests de la réinitialisation du mot de passe par code (SMS / e-mail).

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from security.roles import Role
from users.tests.factories import PASSWORD, api_client, make_user

from ..models import PasswordResetCode
from ..services import MAX_ATTEMPTS, MAX_CODES_PER_HOUR
from ..sms import mask_phone, send_sms

REQUEST = '/api/auth/password-reset/'
CONFIRM = '/api/auth/password-reset/confirm/'
NEW_PASSWORD = 'Nouveau-Passe-2026'


class PasswordResetTests(TestCase):
    def setUp(self):
        self.user = make_user('awa', Role.DONOR, password=PASSWORD, phone='+221771234567', email='awa@example.sn')
        self.client = api_client()
        self.sms = []
        patcher = mock.patch('identity.services.send_sms', side_effect=lambda phone, text: self.sms.append((phone, text)) or True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def request_code(self, identifier='77 123 45 67'):
        response = self.client.post(REQUEST, {'identifier': identifier}, format='json')
        self.assertEqual(response.status_code, 202)
        return re.search(r'\b(\d{6})\b', self.sms[-1][1]).group(1) if self.sms else None

    def confirm(self, code, password=NEW_PASSWORD, identifier='77 123 45 67'):
        # Limite générale de 5 requêtes/s par IP : on la remet à zéro entre les essais.
        cache.clear()
        return self.client.post(CONFIRM, {'identifier': identifier, 'code': code, 'new_password': password}, format='json')

    def test_code_sent_by_sms_and_email_never_stored_in_clear(self):
        code = self.request_code()
        self.assertEqual(self.sms[0][0], '+221771234567')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(code, mail.outbox[0].body)
        reset = PasswordResetCode.objects.get(user=self.user)
        self.assertEqual(reset.channels, 'sms,email')
        self.assertNotIn(code, reset.code_hash)

    def test_unknown_account_gets_the_same_answer(self):
        response = self.client.post(REQUEST, {'identifier': '78 000 00 00'}, format='json')
        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.sms, [])
        self.assertFalse(PasswordResetCode.objects.exists())

    def test_reset_by_username_and_by_email(self):
        self.assertIsNotNone(self.request_code('awa'))
        self.assertIsNotNone(self.request_code('AWA@example.sn'))

    def test_good_code_changes_password_logs_in_and_closes_sessions(self):
        old = self.client.post('/api/auth/token/', {'username': 'awa', 'password': PASSWORD}, format='json').data['refresh']
        code = self.request_code()
        response = self.confirm(code)
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        # Ancienne session fermée, code inutilisable une seconde fois.
        self.assertEqual(self.client.post('/api/auth/token/refresh/', {'refresh': old}, format='json').status_code, 401)
        self.assertEqual(self.confirm(code, 'Encore-Autre-2026').status_code, 400)

    def test_wrong_codes_are_counted_then_the_code_is_burnt(self):
        code = self.request_code()
        wrong = '000000' if code != '000000' else '111111'
        first = self.confirm(wrong)
        self.assertEqual(first.status_code, 400)
        self.assertIn(f'Encore {MAX_ATTEMPTS - 1} essais', first.data['code'][0])
        for _ in range(MAX_ATTEMPTS - 1):
            self.confirm(wrong)
        self.assertEqual(PasswordResetCode.objects.get().attempts, MAX_ATTEMPTS)
        # Même le bon code ne passe plus : il faut en redemander un.
        self.assertEqual(self.confirm(code).status_code, 400)

    def test_weak_password_keeps_the_code_valid(self):
        code = self.request_code()
        response = self.confirm(code, '12345678')
        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)
        self.assertEqual(self.confirm(code).status_code, 200)

    def test_expired_code_is_refused(self):
        code = self.request_code()
        PasswordResetCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(code).status_code, 400)

    def test_new_code_cancels_the_previous_one(self):
        first = self.request_code()
        second = self.request_code()
        if first != second:
            self.assertEqual(self.confirm(first).status_code, 400)
        self.assertEqual(self.confirm(second).status_code, 200)

    def test_codes_per_hour_are_capped(self):
        for _ in range(MAX_CODES_PER_HOUR + 2):
            cache.clear()
            self.client.post(REQUEST, {'identifier': 'awa'}, format='json')
        self.assertEqual(PasswordResetCode.objects.count(), MAX_CODES_PER_HOUR)


class SmsTests(TestCase):
    def test_masked_number(self):
        self.assertEqual(mask_phone('+221771234567'), '+221 77 *** ** 67')

    @override_settings(DEBUG=False, SMS_BACKEND='console')
    def test_console_backend_never_logs_codes_in_production(self):
        with self.assertLogs('jappo_dundu.identity', 'ERROR'):
            self.assertFalse(send_sms('+221771234567', 'code 123456'))

    @override_settings(DEBUG=True, SMS_BACKEND='console')
    def test_console_backend_in_debug(self):
        with self.assertLogs('jappo_dundu.identity', 'WARNING') as logs:
            self.assertTrue(send_sms('+221771234567', 'code 123456'))
        self.assertIn('123456', logs.output[0])
        self.assertNotIn('771234567', logs.output[0])
