"""
Authentification M2M pour les progiciels SIH hospitaliers.

Prend en charge :
- En-tête HTTP ``X-Hospital-API-Key: <clé>``
- En-tête standard ``Authorization: Api-Key <clé>``

Auteur : Pape Alioune Sene
"""

from django.utils import timezone
from rest_framework import authentication, exceptions
from rest_framework.throttling import SimpleRateThrottle

from .models import HospitalApiKey, hash_api_key


class SIHPrincipalUser:
    """Représentation utilisateur d'un SIH hospitalier authentifié par clé d'API."""

    is_authenticated = True
    is_anonymous = False
    is_staff = False
    is_superuser = False
    pk = None

    def __init__(self, facility, api_key=None):
        self.facility = facility
        self.api_key = api_key
        self.username = f"sih_{facility.id}"

    def get_username(self):
        return self.username

    def __str__(self):
        return f"SIH ({self.facility.name})"


class HospitalApiKeyAuthentication(authentication.BaseAuthentication):
    """Authentifie les requêtes machines (SIH) par clé API d'établissement."""

    def authenticate(self, request):
        api_key_str = request.headers.get('X-Hospital-API-Key')
        if not api_key_str:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Api-Key '):
                api_key_str = auth_header.split(' ', 1)[1].strip()

        if not api_key_str:
            return None  # Permet le repli sur JWT/Session si configuré

        key_obj = (
            HospitalApiKey.objects.select_related('facility')
            .filter(key_hash=hash_api_key(api_key_str), is_active=True, facility__is_active=True)
            .first()
        )
        if not key_obj:
            raise exceptions.AuthenticationFailed(
                "Clé d'API SIH invalide, révoquée ou établissement inactif."
            )

        HospitalApiKey.objects.filter(pk=key_obj.pk).update(last_used_at=timezone.now())

        request.facility = key_obj.facility
        request.sih_api_key = key_obj

        user = SIHPrincipalUser(key_obj.facility, api_key=key_obj)
        return (user, key_obj)

    def authenticate_header(self, request):
        return 'Api-Key realm="SIH"'


class _SIHKeyThrottle(SimpleRateThrottle):
    """Limitation de débit par clé d'API.

    Les throttles utilisateur par défaut s'appuient sur ``user.pk``, qui vaut
    None pour un SIH : tous les établissements partageraient un seul compteur
    et un SIH trop bavard bloquerait les autres.
    """

    def get_cache_key(self, request, view):
        api_key = getattr(request, 'sih_api_key', None)
        if api_key is None:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': api_key.pk}


class SIHBurstThrottle(_SIHKeyThrottle):
    scope = 'sih_burst'


class SIHSustainedThrottle(_SIHKeyThrottle):
    scope = 'sih_sustained'

