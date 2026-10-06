"""
Code de la carte donneur (QR code de l'application mobile).

Le code est aléatoire : contrairement à l'identifiant interne (1, 2, 3…), il
ne permet pas de parcourir l'annuaire des donneurs. Alphabet sans caractères
ambigus (ni 0/O, ni 1/I/L) : 8 caractères, soit 40 bits.

Formats acceptés en recherche : « JD-7KQ4-M9PX », « jd7kq4m9px », ou le
contenu complet du QR code, « JAPPODUNDU:DONNEUR:JD-7KQ4-M9PX ».
"""

import re
import secrets

ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
CODE_LENGTH = 8
QR_PREFIX = 'JAPPODUNDU:DONNEUR:'

_CODE = re.compile(r'JD-?([%s]{4})-?([%s]{4})' % (ALPHABET, ALPHABET))


def generate_card_code():
    chars = ''.join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return f'JD-{chars[:4]}-{chars[4:]}'


def normalize_card_code(raw):
    """Code canonique « JD-XXXX-XXXX », ou None si ``raw`` n'en contient pas."""
    text = re.sub(r'\s+', '', raw or '').upper()
    match = _CODE.search(text)
    return f'JD-{match.group(1)}-{match.group(2)}' if match else None


def qr_payload(code):
    return f'{QR_PREFIX}{code}'
