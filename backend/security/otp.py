"""
Codes à usage unique basés sur le temps (TOTP, RFC 6238), sans dépendance.

Compatibles avec les applications d'authentification courantes (Google
Authenticator, Microsoft Authenticator, FreeOTP…) : SHA-1, 6 chiffres, pas de
30 secondes. Une dérive d'un pas est tolérée (horloge du téléphone), et un
même pas n'est jamais accepté deux fois (rejeu).
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP_SECONDS = 30
DIGITS = 6


def new_secret():
    """Secret aléatoire de 160 bits, en base32 (format attendu par les applications)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def _key(secret):
    return base64.b32decode(secret + '=' * (-len(secret) % 8))


def code_at(secret, step):
    digest = hmac.new(_key(secret), struct.pack('>Q', step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack('>I', digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_step(now=None):
    return int((now if now is not None else time.time()) // STEP_SECONDS)


def verify(secret, code, *, last_used_step=0, now=None, window=1):
    """Pas temporel du code s'il est valide (et pas déjà utilisé), sinon None."""
    code = (code or '').strip().replace(' ', '')
    if not (code.isdigit() and len(code) == DIGITS):
        return None
    step = current_step(now)
    for candidate in range(step - window, step + window + 1):
        if candidate > last_used_step and hmac.compare_digest(code_at(secret, candidate), code):
            return candidate
    return None


def provisioning_uri(secret, account, issuer='Jappo Dundu'):
    """URI otpauth:// à afficher en QR code dans l'application d'authentification."""
    label = quote(f'{issuer}:{account}')
    return f'otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits={DIGITS}&period={STEP_SECONDS}'
