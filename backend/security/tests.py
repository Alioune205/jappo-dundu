"""
Tests de l'application Security.

Couvre : rôles, permissions, JWT (rotation, liste noire, logout, claims),
limitation de débit de la connexion, sondes de supervision, middleware
(X-Request-ID, en-têtes, IP client), CORS et garde-fous de configuration.

Auteur : El Hadji Massogui Diop
"""

import os
import subprocess
import sys
from io import StringIO
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.management import call_command
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from .middleware import get_client_ip
from .permissions import (
    IsAdmin,
    IsAdminOrHospitalStaff,
    IsAmbulanceDriver,
    IsDonor,
    IsHospitalStaff,
    IsOwnerOrAdmin,
    role_permission,
)
from .roles import Role, get_user_roles, primary_role, user_has_role

User = get_user_model()
PASSWORD = 'Str0ng-Passw0rd!'


def create_user(username, role=None, **extra):
    user = User.objects.create_user(username=username, password=PASSWORD, **extra)
    if role is not None:
        user.groups.add(Group.objects.get(name=role))
    return user


class RoleFixturesMixin:
    """Un utilisateur par rôle, groupes créés par la commande setup_roles."""

    @classmethod
    def setUpTestData(cls):
        call_command('setup_roles', stdout=StringIO())
        cls.admin = create_user('admin', is_staff=True)
        cls.hospital = create_user('hospital', Role.HOSPITAL_STAFF)
        cls.donor = create_user('donor', Role.DONOR)
        cls.driver = create_user('driver', Role.AMBULANCE_DRIVER)
        cls.regular = create_user('regular')


class RolesTests(RoleFixturesMixin, TestCase):

    def test_admin_role_comes_from_is_staff(self):
        self.assertEqual(get_user_roles(self.admin), {Role.ADMIN})

    def test_group_roles(self):
        self.assertEqual(get_user_roles(self.hospital), {Role.HOSPITAL_STAFF})
        self.assertEqual(get_user_roles(self.donor), {Role.DONOR})
        self.assertEqual(get_user_roles(self.driver), {Role.AMBULANCE_DRIVER})

    def test_user_without_group_has_no_role(self):
        self.assertEqual(get_user_roles(self.regular), frozenset())

    def test_unrelated_group_is_ignored(self):
        self.regular.groups.add(Group.objects.create(name='comptabilite'))
        self.assertEqual(get_user_roles(self.regular), frozenset())

    def test_role_attribute_on_user_model_is_supported(self):
        self.regular.role = 'donor'
        self.assertEqual(get_user_roles(self.regular), {Role.DONOR})

    def test_unknown_role_attribute_is_ignored(self):
        self.regular.role = 'superhero'
        self.assertEqual(get_user_roles(self.regular), frozenset())

    def test_anonymous_and_none_have_no_role(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertEqual(get_user_roles(AnonymousUser()), frozenset())
        self.assertEqual(get_user_roles(None), frozenset())
        self.assertFalse(user_has_role(None, Role.ADMIN))

    def test_admin_check_needs_no_query(self):
        with self.assertNumQueries(0):
            self.assertTrue(user_has_role(self.admin, Role.ADMIN))

    def test_primary_role_priority(self):
        roles = {Role.DONOR, Role.HOSPITAL_STAFF}
        self.assertEqual(primary_role(roles), Role.HOSPITAL_STAFF)
        self.assertIsNone(primary_role(set()))


class PermissionsTests(RoleFixturesMixin, TestCase):

    def check(self, permission_class, user):
        request = APIRequestFactory().get('/')
        request.user = user
        return permission_class().has_permission(request, None)

    def test_each_role_permission(self):
        cases = [
            (IsAdmin, self.admin, self.hospital),
            (IsHospitalStaff, self.hospital, self.donor),
            (IsDonor, self.donor, self.driver),
            (IsAmbulanceDriver, self.driver, self.regular),
        ]
        for permission, allowed, denied in cases:
            with self.subTest(permission=permission.__name__):
                self.assertTrue(self.check(permission, allowed))
                self.assertFalse(self.check(permission, denied))

    def test_admin_or_hospital_staff(self):
        self.assertTrue(self.check(IsAdminOrHospitalStaff, self.admin))
        self.assertTrue(self.check(IsAdminOrHospitalStaff, self.hospital))
        self.assertFalse(self.check(IsAdminOrHospitalStaff, self.donor))

    def test_role_permission_factory(self):
        permission = role_permission(Role.ADMIN, Role.AMBULANCE_DRIVER)
        self.assertTrue(self.check(permission, self.driver))
        self.assertTrue(self.check(permission, self.admin))
        self.assertFalse(self.check(permission, self.donor))
        with self.assertRaises(ValueError):
            role_permission()
        with self.assertRaises(ValueError):
            role_permission('pirate')

    def test_owner_or_admin(self):
        permission = IsOwnerOrAdmin()
        request = APIRequestFactory().get('/')
        owned = mock.Mock(user=self.donor)
        request.user = self.donor
        self.assertTrue(permission.has_object_permission(request, None, owned))
        request.user = self.driver
        self.assertFalse(permission.has_object_permission(request, None, owned))
        request.user = self.admin
        self.assertTrue(permission.has_object_permission(request, None, owned))
        orphan = mock.Mock(user=None, owner=None)
        request.user = self.driver
        self.assertFalse(permission.has_object_permission(request, None, orphan))


class SetupRolesCommandTests(TestCase):

    def test_command_is_idempotent(self):
        call_command('setup_roles', stdout=StringIO())
        call_command('setup_roles', stdout=StringIO())
        self.assertEqual(
            set(Group.objects.values_list('name', flat=True)),
            {'hospital_staff', 'ambulance_driver', 'donor'},
        )


class JWTAuthenticationTests(RoleFixturesMixin, TestCase):

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def login(self, username='hospital', password=PASSWORD):
        return self.client.post(
            '/api/auth/token/',
            {'username': username, 'password': password},
            format='json',
        )

    def test_login_returns_tokens_and_profile(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'hospital')
        self.assertEqual(response.data['user']['role'], 'hospital_staff')
        self.assertEqual(response.data['user']['roles'], ['hospital_staff'])

    def test_access_token_carries_roles_but_no_personal_data(self):
        claims = AccessToken(self.login().data['access'])
        self.assertEqual(claims['role'], 'hospital_staff')
        self.assertEqual(claims['roles'], ['hospital_staff'])
        self.assertEqual(claims['username'], 'hospital')
        self.assertNotIn('email', claims)
        self.assertNotIn('full_name', claims)

    def test_invalid_credentials_are_rejected(self):
        response = self.login(password='wrong-password')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_user_cannot_login(self):
        self.donor.is_active = False
        self.donor.save()
        self.assertEqual(self.login('donor').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_rotates_and_old_refresh_is_revoked(self):
        refresh = self.login().data['refresh']
        first = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertIn('access', first.data)
        self.assertNotEqual(first.data['refresh'], refresh)

        replay = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(replay.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_revokes_refresh_token(self):
        refresh = self.login().data['refresh']
        logout = self.client.post('/api/auth/logout/', {'refresh': refresh}, format='json')
        self.assertEqual(logout.status_code, status.HTTP_200_OK)

        reuse = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(reuse.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_verify_endpoint(self):
        access = self.login().data['access']
        ok = self.client.post('/api/auth/token/verify/', {'token': access}, format='json')
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        bad = self.client.post('/api/auth/token/verify/', {'token': 'x.y.z'}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_route_requires_token(self):
        response = self.client.get('/api/ml/predictions/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_route_accepts_bearer_token(self):
        access = self.login().data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(self.client.get('/api/ml/predictions/').status_code, 200)

    def test_login_is_rate_limited(self):
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'login': '2/minute'}
        with mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates):
            self.assertEqual(self.login(password='bad').status_code, 401)
            self.assertEqual(self.login(password='bad').status_code, 401)
            self.assertEqual(
                self.login().status_code, status.HTTP_429_TOO_MANY_REQUESTS
            )


class HealthAndStatusTests(RoleFixturesMixin, TestCase):

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_health_is_public(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'healthy')
        self.assertEqual(response.json()['service'], 'Jappo Dundu API')

    def test_health_ignores_host_validation(self):
        """La sonde Docker (Host: 127.0.0.1) doit passer en production."""
        response = self.client.get('/api/health/', HTTP_HOST='internal.probe')
        self.assertEqual(response.status_code, 200)
        other = self.client.get('/api/auth/token/', HTTP_HOST='internal.probe')
        self.assertEqual(other.status_code, 400)

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_health_is_not_redirected_to_https(self):
        self.assertEqual(self.client.get('/api/health/').status_code, 200)
        self.assertEqual(self.client.get('/api/status/').status_code, 301)

    def test_status_requires_admin(self):
        self.assertEqual(self.client.get('/api/status/').status_code, 401)
        self.client.force_authenticate(self.hospital)
        self.assertEqual(self.client.get('/api/status/').status_code, 403)

    def test_status_reports_dependencies(self):
        self.client.force_authenticate(self.admin)
        with mock.patch(
            'security.views.check_channel_layer', return_value={'backend': 'test'}
        ):
            response = self.client.get('/api/status/')
        self.assertEqual(response.status_code, 200)
        checks = response.data['checks']
        self.assertEqual(checks['database']['status'], 'up')
        self.assertEqual(checks['channel_layer']['status'], 'up')
        self.assertEqual(checks['ml_model']['status'], 'not_trained')

    def test_status_is_degraded_without_leaking_error_details(self):
        self.client.force_authenticate(self.admin)

        def broken():
            raise ConnectionError('password authentication failed for user "postgres"')

        with mock.patch('security.views.check_database', side_effect=broken), \
                mock.patch('security.views.check_channel_layer', return_value={}), \
                self.assertLogs('jappo_dundu.security', 'ERROR'):
            response = self.client.get('/api/status/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['status'], 'degraded')
        self.assertEqual(
            response.data['checks']['database'],
            {'status': 'down', 'error': 'ConnectionError'},
        )


class MiddlewareTests(TestCase):

    def test_request_id_is_generated(self):
        response = self.client.get('/api/health/')
        # La sonde court-circuite le reste : on vérifie une route standard.
        response = self.client.get('/api/ml/predictions/')
        self.assertRegex(response['X-Request-ID'], r'^[0-9a-f]{32}$')

    def test_valid_incoming_request_id_is_kept(self):
        response = self.client.get(
            '/api/ml/predictions/', HTTP_X_REQUEST_ID='proxy-req-12345'
        )
        self.assertEqual(response['X-Request-ID'], 'proxy-req-12345')

    def test_malformed_incoming_request_id_is_replaced(self):
        response = self.client.get(
            '/api/ml/predictions/', HTTP_X_REQUEST_ID='<script>alert(1)</script>'
        )
        self.assertRegex(response['X-Request-ID'], r'^[0-9a-f]{32}$')

    def test_security_headers(self):
        response = self.client.get('/api/ml/predictions/')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response['X-Frame-Options'], 'DENY')
        self.assertEqual(response['Referrer-Policy'], 'strict-origin-when-cross-origin')
        self.assertIn('camera=()', response['Permissions-Policy'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_requests_are_logged(self):
        with self.assertLogs('jappo_dundu.security', 'WARNING') as logs:
            self.client.get('/api/ml/predictions/')
        self.assertIn('status=401', logs.output[0])
        self.assertIn('path=/api/ml/predictions/', logs.output[0])

    def test_spoofed_forwarded_for_is_ignored_without_proxy(self):
        request = RequestFactory().get(
            '/', REMOTE_ADDR='10.0.0.5', HTTP_X_FORWARDED_FOR='6.6.6.6'
        )
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, 'NUM_PROXIES': 0}):
            self.assertEqual(get_client_ip(request), '10.0.0.5')

    def test_client_ip_behind_one_trusted_proxy(self):
        request = RequestFactory().get(
            '/', REMOTE_ADDR='172.18.0.3', HTTP_X_FORWARDED_FOR='6.6.6.6, 41.82.1.2'
        )
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, 'NUM_PROXIES': 1}):
            self.assertEqual(get_client_ip(request), '41.82.1.2')


@override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:3000'])
class CorsTests(TestCase):

    def preflight(self, origin):
        return self.client.options(
            '/api/auth/token/',
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type',
        )

    def test_allowed_origin(self):
        response = self.preflight('http://localhost:3000')
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:3000')
        self.assertIn('authorization', response['Access-Control-Allow-Headers'])

    def test_unknown_origin_is_not_allowed(self):
        response = self.preflight('https://evil.example')
        self.assertNotIn('Access-Control-Allow-Origin', response)


class SettingsGuardTests(SimpleTestCase):
    """La configuration refuse de démarrer en production sans SECRET_KEY."""

    def test_production_requires_secret_key(self):
        env = {**os.environ, 'DEBUG': 'False', 'SECRET_KEY': ''}
        result = subprocess.run(
            [sys.executable, '-c', 'import core.settings'],
            cwd=Path(settings.BASE_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)
