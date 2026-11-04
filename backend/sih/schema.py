"""
Description OpenAPI (Swagger) de l'authentification par clé d'API des SIH.

Chargée au démarrage par ``SihConfig.ready`` : Swagger affiche alors le
cadenas « CleApiSIH » sur les routes /api/sih/ et permet de tester une clé.

Auteur : Pape Alioune Sene
"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class HospitalApiKeyScheme(OpenApiAuthenticationExtension):
    target_class = 'sih.authentication.HospitalApiKeyAuthentication'
    name = 'CleApiSIH'

    def get_security_definition(self, auto_schema):
        return {
            'type': 'apiKey',
            'in': 'header',
            'name': 'X-Hospital-API-Key',
            'description': "Clé d'API de l'établissement (également acceptée en « Authorization: Api-Key <clé> »).",
        }
