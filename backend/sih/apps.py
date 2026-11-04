from django.apps import AppConfig


class SihConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sih'
    verbose_name = "Système d'Information Hospitalier (SIH)"

    def ready(self):
        # Enregistre la description Swagger de l'authentification par clé d'API.
        from . import schema  # noqa: F401
