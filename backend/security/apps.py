from django.apps import AppConfig


class SecurityConfig(AppConfig):
    """Configuration de l'application Security.

    Gère l'authentification JWT, les permissions basées sur les rôles,
    le CORS, le throttling et le monitoring de l'API.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'security'
    verbose_name = 'Sécurité & Authentification'
