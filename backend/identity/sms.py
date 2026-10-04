"""
Envoi de SMS (codes de réinitialisation).

Deux moteurs, choisis par SMS_BACKEND :
- ``console`` (défaut) : le message est écrit dans le journal du serveur.
  Développement et démonstration : le code se lit dans la console de
  ``manage.py runserver``.
- ``orange`` : API « SMS Messaging » d'Orange Sénégal (développeurs Orange,
  offre SMS Sénégal). Jeton OAuth2 « client credentials » mis en cache, puis
  envoi via /smsmessaging/v1/outbound/{expéditeur}/requests.
  Réglages : SMS_ORANGE_CLIENT_ID, SMS_ORANGE_CLIENT_SECRET,
  SMS_ORANGE_SENDER (numéro expéditeur du contrat, ex. +2210000).

``send_sms`` ne lève jamais : un échec d'envoi est journalisé et signalé par
``False`` (l'appelant ne doit pas révéler si le numéro existe).

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

import base64
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger('jappo_dundu.identity')

ORANGE_TOKEN_URL = 'https://api.orange.com/oauth/v3/token'
ORANGE_SMS_URL = 'https://api.orange.com/smsmessaging/v1/outbound/{sender}/requests'
TIMEOUT = 10

_orange_token = {'value': None, 'expires': 0.0}


def send_sms(phone_number, message):
    """Envoie ``message`` au numéro (format +221XXXXXXXXX). Retourne True si accepté."""
    backend = getattr(settings, 'SMS_BACKEND', 'console')
    try:
        if backend == 'orange':
            _send_orange(phone_number, message)
            return True
        if not settings.DEBUG:
            # Un code dans les journaux de production serait lisible par trop de monde.
            logger.error("SMS non envoyé : SMS_BACKEND=console hors mode DEBUG (configurer « orange »).")
            return False
        # Numéro masqué dans le journal : seul le contenu sert au développeur.
        logger.warning("SMS (console) vers %s : %s", mask_phone(phone_number), message)
        return True
    except Exception:  # noqa: BLE001 — l'envoi ne doit jamais casser la requête
        logger.exception("Échec d'envoi SMS vers %s", mask_phone(phone_number))
        return False


def mask_phone(phone_number):
    """« +221771234567 » → « +221 77 *** ** 67 »."""
    digits = (phone_number or '')[-9:]
    if len(digits) < 9:
        return '***'
    return f"+221 {digits[:2]} *** ** {digits[-2:]}"


def _orange_access_token():
    if _orange_token['value'] and _orange_token['expires'] > time.time() + 60:
        return _orange_token['value']
    credentials = f"{settings.SMS_ORANGE_CLIENT_ID}:{settings.SMS_ORANGE_CLIENT_SECRET}"
    request = urllib.request.Request(
        ORANGE_TOKEN_URL,
        data=urllib.parse.urlencode({'grant_type': 'client_credentials'}).encode(),
        headers={
            'Authorization': 'Basic ' + base64.b64encode(credentials.encode()).decode(),
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = json.load(response)
    _orange_token['value'] = payload['access_token']
    _orange_token['expires'] = time.time() + int(payload.get('expires_in', 3600))
    return _orange_token['value']


def _send_orange(phone_number, message):
    sender = f"tel:{settings.SMS_ORANGE_SENDER}"
    body = {
        'outboundSMSMessageRequest': {
            'address': f"tel:{phone_number}",
            'senderAddress': sender,
            'outboundSMSTextMessage': {'message': message},
        }
    }
    request = urllib.request.Request(
        ORANGE_SMS_URL.format(sender=urllib.parse.quote(sender, safe='')),
        data=json.dumps(body).encode(),
        headers={
            'Authorization': f"Bearer {_orange_access_token()}",
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        if response.status >= 300:
            raise urllib.error.HTTPError(request.full_url, response.status, 'SMS refusé', response.headers, None)
