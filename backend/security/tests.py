"""
Tests de l'application Security.

Couvre :
- Les permissions basées sur les rôles
- L'authentification JWT (obtention et refresh de tokens)
- Les endpoints de health check et status
- Le middleware de logging
- Le throttling

Auteur : El Hadji Massogui Diop
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory

from .permissions import (
    IsAdmin,
    IsAmbulanceDriver,
    IsDonor,
    IsHospitalStaff,
)

User = get_user_model()


class PermissionsTestCase(TestCase):
    """Tests des permissions basées sur les rôles."""

    def setUp(self):
        self.factory = APIRequestFactory()

        # Créer les groupes
        self.group_hospital = Group.objects.create(name='hospital_staff')
        self.group_donor = Group.objects.create(name='donor')
        self.group_driver = Group.objects.create(name='ambulance_driver')

        # Créer les utilisateurs
        self.admin_user = User.objects.create_user(
            username='admin',
            password='testpass123!',
            is_staff=True,
        )
        self.hospital_user = User.objects.create_user(
            username='hospital',
            password='testpass123!',
        )
        self.hospital_user.groups.add(self.group_hospital)

        self.donor_user = User.objects.create_user(
            username='donor',
            password='testpass123!',
        )
        self.donor_user.groups.add(self.group_donor)

        self.driver_user = User.objects.create_user(
            username='driver',
            password='testpass123!',
        )
        self.driver_user.groups.add(self.group_driver)

        self.regular_user = User.objects.create_user(
            username='regular',
            password='testpass123!',
        )

    def _make_request(self, user=None):
        """Crée une requête GET factice avec un utilisateur."""
        request = self.factory.get('/test/')
        request.user = user
        return request

    def test_is_admin_allows_staff(self):
        request = self._make_request(self.admin_user)
        self.assertTrue(IsAdmin().has_permission(request, None))

    def test_is_admin_denies_non_staff(self):
        request = self._make_request(self.regular_user)
        self.assertFalse(IsAdmin().has_permission(request, None))

    def test_is_hospital_staff_allows_group_member(self):
        request = self._make_request(self.hospital_user)
        self.assertTrue(IsHospitalStaff().has_permission(request, None))

    def test_is_hospital_staff_denies_other(self):
        request = self._make_request(self.donor_user)
        self.assertFalse(IsHospitalStaff().has_permission(request, None))

    def test_is_donor_allows_group_member(self):
        request = self._make_request(self.donor_user)
        self.assertTrue(IsDonor().has_permission(request, None))

    def test_is_donor_denies_other(self):
        request = self._make_request(self.hospital_user)
        self.assertFalse(IsDonor().has_permission(request, None))

    def test_is_ambulance_driver_allows_group_member(self):
        request = self._make_request(self.driver_user)
        self.assertTrue(IsAmbulanceDriver().has_permission(request, None))

    def test_is_ambulance_driver_denies_other(self):
        request = self._make_request(self.regular_user)
        self.assertFalse(IsAmbulanceDriver().has_permission(request, None))


class JWTAuthenticationTestCase(TestCase):
    """Tests de l'authentification JWT."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='TestPass123!',
            email='test@jappo.sn',
            first_name='Test',
            last_name='User',
        )

    def test_obtain_token_valid_credentials(self):
        """Un utilisateur valide obtient un access et un refresh token."""
        response = self.client.post(
            '/api/auth/token/',
            {'username': 'testuser', 'password': 'TestPass123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['username'], 'testuser')

    def test_obtain_token_invalid_credentials(self):
        """Des identifiants invalides sont rejetés."""
        response = self.client.post(
            '/api/auth/token/',
            {'username': 'testuser', 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token(self):
        """Un refresh token valide génère un nouveau access token."""
        # Obtenir le token initial
        response = self.client.post(
            '/api/auth/token/',
            {'username': 'testuser', 'password': 'TestPass123!'},
            format='json',
        )
        refresh_token = response.data['refresh']

        # Rafraîchir le token
        response = self.client.post(
            '/api/auth/token/refresh/',
            {'refresh': refresh_token},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_protected_endpoint_without_token(self):
        """Un endpoint protégé rejette les requêtes sans token."""
        response = self.client.get('/api/ml/predictions/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_with_token(self):
        """Un endpoint protégé accepte les requêtes avec un token valide."""
        # Obtenir le token
        response = self.client.post(
            '/api/auth/token/',
            {'username': 'testuser', 'password': 'TestPass123!'},
            format='json',
        )
        token = response.data['access']

        # Accéder à l'endpoint protégé
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/ml/predictions/')
        self.assertIn(
            response.status_code,
            [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND],
        )


class HealthCheckTestCase(TestCase):
    """Tests des endpoints de monitoring."""

    def setUp(self):
        self.client = APIClient()

    def test_health_check_returns_200(self):
        """Le health check retourne toujours 200 si l'API est up."""
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'healthy')
        self.assertEqual(response.data['service'], 'Jappo Dundu API')

    def test_system_status_returns_checks(self):
        """Le status système retourne les vérifications de chaque service."""
        response = self.client.get('/api/status/')
        self.assertIn('checks', response.data)
        self.assertIn('api', response.data['checks'])
        self.assertIn('database', response.data['checks'])


class MiddlewareTestCase(TestCase):
    """Tests du middleware de sécurité."""

    def setUp(self):
        self.client = APIClient()

    def test_request_id_header_present(self):
        """Le header X-Request-ID est présent dans la réponse."""
        response = self.client.get('/api/health/')
        self.assertIn('X-Request-ID', response)

    def test_security_headers_present(self):
        """Les en-têtes de sécurité sont présents dans la réponse."""
        response = self.client.get('/api/health/')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response['X-Frame-Options'], 'DENY')
        self.assertEqual(
            response['Referrer-Policy'], 'strict-origin-when-cross-origin'
        )
