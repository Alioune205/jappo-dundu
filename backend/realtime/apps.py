from django.apps import AppConfig


class RealtimeConfig(AppConfig):
    """Configuration de l'application temps réel (WebSockets).

    Diffuse les alertes d'urgence et les mises à jour du tableau de bord
    via Django Channels (Redis en production).
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'realtime'
    verbose_name = 'Temps réel (WebSockets)'
