"""
Tests de la documentation de l'API (drf-spectacular / Swagger).

Auteur : El Hadji Massogui Diop
"""

from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator


class OpenApiSchemaTests(SimpleTestCase):
    """Le schéma OpenAPI se génère et couvre les routes métier clés."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def test_metadata(self):
        self.assertEqual(self.schema['info']['title'], 'API Jappo Dundu')
        self.assertTrue(self.schema['openapi'].startswith('3.'))

    def test_key_routes_are_documented(self):
        paths = self.schema['paths']
        for route in (
            '/api/auth/token/',
            '/api/sang/requests/',
            '/api/lits/capacities/',
            '/api/lits/capacities/nearest/',
            '/api/ambulances/missions/',
            '/api/ml/predictions/',
        ):
            with self.subTest(route=route):
                self.assertIn(route, paths)

    def test_login_documents_its_response(self):
        response = self.schema['paths']['/api/auth/token/']['post']['responses']['200']
        self.assertIn('content', response)

    def test_jwt_and_sih_key_schemes(self):
        schemes = self.schema['components']['securitySchemes']
        self.assertEqual(schemes['jwtAuth']['scheme'], 'bearer')
        self.assertEqual(schemes['CleApiSIH']['name'], 'X-Hospital-API-Key')
