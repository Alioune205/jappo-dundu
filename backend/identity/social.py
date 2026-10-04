"""
Vérification des jetons Google, Apple et Facebook.

Le téléphone obtient le jeton auprès du fournisseur (écran du fournisseur,
le mot de passe ne transite jamais par Jappo Dundu) ; le serveur le vérifie
lui-même avant toute création de session :
- Google et Apple : jeton d'identité JWT signé, vérifié avec les clés
  publiques du fournisseur (signature, émetteur, audience, expiration) ;
- Facebook : jeton d'accès contrôlé par l'API Graph (``debug_token`` avec
  le secret de l'application), puis lecture du profil.

Réglages : GOOGLE_CLIENT_IDS, APPLE_AUDIENCES (identifiants d'application),
FACEBOOK_APP_ID, FACEBOOK_APP_SECRET. Un fournisseur sans réglage est
refusé (503) plutôt qu'accepté à l'aveugle.

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

import jwt
from django.conf import settings

GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs'
GOOGLE_ISSUERS = ('accounts.google.com', 'https://accounts.google.com')
APPLE_JWKS = 'https://appleid.apple.com/auth/keys'
APPLE_ISSUER = 'https://appleid.apple.com'
GRAPH = 'https://graph.facebook.com/v19.0'
TIMEOUT = 10

_jwk_clients = {}


class SocialAuthError(Exception):
    """Jeton refusé (400) ou fournisseur non configuré / injoignable (503)."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class SocialIdentity:
    provider: str
    uid: str
    email: str = ''
    email_verified: bool = False
    first_name: str = ''
    last_name: str = ''


def verify(provider, data):
    """Vérifie les données envoyées par l'application ; retourne l'identité."""
    if provider == 'google':
        return verify_google(data.get('id_token', ''))
    if provider == 'apple':
        return verify_apple(
            data.get('identity_token', ''),
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
        )
    if provider == 'facebook':
        return verify_facebook(data.get('access_token', ''))
    raise SocialAuthError("Fournisseur inconnu.", status=404)


def _audiences(setting):
    value = getattr(settings, setting, ())
    return [item for item in value if item]


def _decode(token, jwks_url, audiences, issuers, label):
    if not token:
        raise SocialAuthError(f"Jeton {label} manquant.")
    if not audiences:
        raise SocialAuthError(f"Connexion {label} non configurée sur ce serveur.", status=503)
    client = _jwk_clients.setdefault(jwks_url, jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600))
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256'],
            audience=audiences,
            options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise SocialAuthError(f"{label} est injoignable, réessayez.", status=503) from exc
    except jwt.PyJWTError as exc:
        raise SocialAuthError(f"Jeton {label} invalide ou expiré.") from exc
    if claims.get('iss') not in issuers:
        raise SocialAuthError(f"Jeton {label} invalide (émetteur).")
    return claims


def _truthy(value):
    return value is True or str(value).lower() == 'true'


def verify_google(id_token):
    claims = _decode(id_token, GOOGLE_JWKS, _audiences('GOOGLE_CLIENT_IDS'), GOOGLE_ISSUERS, 'Google')
    return SocialIdentity(
        provider='google',
        uid=claims['sub'],
        email=claims.get('email', ''),
        email_verified=_truthy(claims.get('email_verified')),
        first_name=claims.get('given_name', ''),
        last_name=claims.get('family_name', ''),
    )


def verify_apple(identity_token, *, first_name='', last_name=''):
    claims = _decode(identity_token, APPLE_JWKS, _audiences('APPLE_AUDIENCES'), (APPLE_ISSUER,), 'Apple')
    # Apple ne transmet le nom qu'à la première autorisation, côté téléphone.
    return SocialIdentity(
        provider='apple',
        uid=claims['sub'],
        email=claims.get('email', ''),
        email_verified=_truthy(claims.get('email_verified')),
        first_name=(first_name or '')[:150],
        last_name=(last_name or '')[:150],
    )


def _graph(path, params):
    url = f"{GRAPH}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise SocialAuthError("Jeton Facebook invalide ou expiré.") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SocialAuthError("Facebook est injoignable, réessayez.", status=503) from exc


def verify_facebook(access_token):
    app_id = getattr(settings, 'FACEBOOK_APP_ID', '')
    app_secret = getattr(settings, 'FACEBOOK_APP_SECRET', '')
    if not access_token:
        raise SocialAuthError("Jeton Facebook manquant.")
    if not (app_id and app_secret):
        raise SocialAuthError("Connexion Facebook non configurée sur ce serveur.", status=503)
    debug = _graph('debug_token', {'input_token': access_token, 'access_token': f"{app_id}|{app_secret}"}).get('data', {})
    # Un jeton émis pour une autre application ne doit pas ouvrir de session ici.
    if not debug.get('is_valid') or str(debug.get('app_id')) != str(app_id):
        raise SocialAuthError("Jeton Facebook invalide ou expiré.")
    profile = _graph('me', {'fields': 'id,first_name,last_name,email', 'access_token': access_token})
    if str(profile.get('id')) != str(debug.get('user_id')):
        raise SocialAuthError("Jeton Facebook invalide.")
    return SocialIdentity(
        provider='facebook',
        uid=str(profile['id']),
        email=profile.get('email', ''),
        # Facebook ne communique que des adresses confirmées.
        email_verified=bool(profile.get('email')),
        first_name=profile.get('first_name', ''),
        last_name=profile.get('last_name', ''),
    )
