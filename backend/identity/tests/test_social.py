"""
Tests de la connexion par Google, Facebook et Apple.

Les fournisseurs ne sont jamais appelés : la vérification des jetons est
testée avec une clé RSA locale (même code de décodage qu'en production), et
les parcours de compte avec une identité déjà vérifiée.

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import time
from unittest import mock

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import TestCase, override_settings

from security.roles import Role, get_user_roles
from users.tests.factories import api_client, make_user

from ..models import SocialAccount
from ..social import SocialAuthError, SocialIdentity, verify_google

URL = '/api/auth/social/{}/'
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def google_token(**claims):
    now = int(time.time())
    payload = {
        'iss': 'https://accounts.google.com',
        'aud': 'client-android',
        'sub': 'g-123',
        'email': 'moussa@gmail.com',
        'email_verified': True,
        'given_name': 'Moussa',
        'family_name': 'Sow',
        'iat': now,
        'exp': now + 600,
        **claims,
    }
    return jwt.encode(payload, KEY, algorithm='RS256')


class FakeJwkClient:
    def get_signing_key_from_jwt(self, token):
        return mock.Mock(key=KEY.public_key())


@override_settings(GOOGLE_CLIENT_IDS=['client-android', 'client-ios'])
class GoogleTokenTests(TestCase):
    def setUp(self):
        patcher = mock.patch.dict('identity.social._jwk_clients', {'https://www.googleapis.com/oauth2/v3/certs': FakeJwkClient()})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_valid_token(self):
        identity = verify_google(google_token())
        self.assertEqual((identity.uid, identity.email, identity.email_verified), ('g-123', 'moussa@gmail.com', True))

    def test_token_for_another_application_is_refused(self):
        with self.assertRaises(SocialAuthError):
            verify_google(google_token(aud='client-of-someone-else'))

    def test_wrong_issuer_or_expired_token_is_refused(self):
        for claims in ({'iss': 'https://evil.example'}, {'exp': int(time.time()) - 10}):
            with self.assertRaises(SocialAuthError):
                verify_google(google_token(**claims))

    def test_forged_signature_is_refused(self):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        forged = jwt.encode({'iss': 'https://accounts.google.com', 'aud': 'client-android', 'sub': 'x', 'iat': 1, 'exp': int(time.time()) + 60}, other, algorithm='RS256')
        with self.assertRaises(SocialAuthError):
            verify_google(forged)

    @override_settings(GOOGLE_CLIENT_IDS=[])
    def test_unconfigured_provider_answers_503(self):
        response = api_client().post(URL.format('google'), {'id_token': google_token()}, format='json')
        self.assertEqual(response.status_code, 503)


class SocialLoginTests(TestCase):
    def login(self, identity):
        with mock.patch('identity.views.verify', return_value=identity):
            return api_client().post(URL.format(identity.provider), {'id_token': 'x'}, format='json')

    def identity(self, **fields):
        return SocialIdentity(**{'provider': 'google', 'uid': 'g-1', 'email': 'fatou@gmail.com', 'email_verified': True, 'first_name': 'Fatou', 'last_name': 'Diop', **fields})

    def test_first_login_creates_a_donor_account_to_complete(self):
        response = self.login(self.identity())
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['created'])
        self.assertFalse(response.data['profile_complete'])
        user = SocialAccount.objects.get(uid='g-1').user
        self.assertEqual((user.first_name, user.email), ('Fatou', 'fatou@gmail.com'))
        self.assertEqual(get_user_roles(user), {Role.DONOR})
        self.assertFalse(user.has_usable_password())

    def test_next_logins_reuse_the_same_account(self):
        self.login(self.identity())
        response = self.login(self.identity())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['created'])
        self.assertEqual(SocialAccount.objects.count(), 1)

    def test_verified_email_links_an_existing_donor(self):
        donor = make_user('fatou', Role.DONOR, phone='+221770000001', email='Fatou@gmail.com')
        response = self.login(self.identity())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['profile_complete'])
        self.assertEqual(SocialAccount.objects.get().user, donor)

    def test_unverified_email_never_takes_over_an_account(self):
        donor = make_user('fatou', Role.DONOR, email='fatou@gmail.com')
        self.login(self.identity(email_verified=False))
        linked = SocialAccount.objects.get().user
        self.assertNotEqual(linked, donor)
        self.assertEqual(linked.email, '')

    def test_professional_accounts_are_never_linked(self):
        make_user('dr.fatou', Role.HOSPITAL_STAFF, email='fatou@gmail.com')
        response = self.login(self.identity())
        self.assertEqual(response.status_code, 403)
        self.assertFalse(SocialAccount.objects.exists())

    def test_disabled_account_cannot_log_in(self):
        self.login(self.identity())
        SocialAccount.objects.get().user.__class__.objects.update(is_active=False)
        self.assertEqual(self.login(self.identity()).status_code, 403)

    def test_unknown_provider(self):
        response = api_client().post(URL.format('myspace'), {}, format='json')
        self.assertEqual(response.status_code, 404)
