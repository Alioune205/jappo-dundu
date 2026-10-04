from django.apps import AppConfig


class PushConfig(AppConfig):
    """Notifications push vers l'application mobile des donneurs.

    Envoi par le service push d'Expo, qui relaie vers FCM (Android) et
    APNs (iOS) : voir services.py.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'push'
    verbose_name = 'Notifications push'
