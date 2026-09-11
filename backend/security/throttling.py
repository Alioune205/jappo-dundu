"""
Classes de throttling (limitation de débit) pour Jappo Dundu.

Protège l'API contre les abus en limitant le nombre de requêtes
par utilisateur et par adresse IP.

Auteur : El Hadji Massogui Diop
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AnonBurstThrottle(AnonRateThrottle):
    """Limite les requêtes en rafale pour les utilisateurs anonymes.

    Empêche les attaques par force brute sur les endpoints
    d'authentification.
    """

    scope = 'anon_burst'


class AnonSustainedThrottle(AnonRateThrottle):
    """Limite les requêtes soutenues pour les utilisateurs anonymes.

    Contrôle le nombre total de requêtes par heure pour
    les visiteurs non authentifiés.
    """

    scope = 'anon_sustained'


class UserBurstThrottle(UserRateThrottle):
    """Limite les requêtes en rafale pour les utilisateurs authentifiés.

    Prévient les appels API excessifs en courte période.
    """

    scope = 'user_burst'


class UserSustainedThrottle(UserRateThrottle):
    """Limite les requêtes soutenues pour les utilisateurs authentifiés.

    Contrôle la consommation API globale par utilisateur sur
    une période étendue.
    """

    scope = 'user_sustained'
