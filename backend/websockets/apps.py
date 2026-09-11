from django.apps import AppConfig


class WebsocketsConfig(AppConfig):
    """Configuration de l'application WebSockets.

    Gère les connexions WebSocket temps réel pour les alertes
    d'urgence et les mises à jour du tableau de bord.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'websockets'
    verbose_name = 'WebSockets & Temps Réel'
