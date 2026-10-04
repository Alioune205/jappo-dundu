"""
Application Identity : récupération de compte et connexion par Google,
Facebook ou Apple (application mobile des donneurs).

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.apps import AppConfig


class IdentityConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'identity'
    verbose_name = "Identité (récupération, connexion sociale)"
