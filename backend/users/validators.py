"""
Validation des numéros de téléphone sénégalais.

Les numéros sont stockés au format international E.164 (+221XXXXXXXXX).
Formats acceptés en saisie : « 77 123 45 67 », « 771234567 »,
« +221 77 123 45 67 », « 00221771234567 », « 221771234567 ».
Le numéro national compte 9 chiffres et commence par 7 (mobile) ou 3 (fixe).

Auteur : Ibrahima Khalilou Diallo
"""

import re

from django.core.exceptions import ValidationError

COUNTRY_CODE = '+221'
E164_PATTERN = re.compile(r'^\+221[37]\d{8}$')
_NATIONAL_PATTERN = re.compile(r'^[37]\d{8}$')
_SEPARATORS = re.compile(r'[\s.\-()/]')

INVALID_MESSAGE = (
    "Numéro invalide : 9 chiffres commençant par 7 ou 3 attendus (exemple : 77 123 45 67)."
)


def normalize_phone_number(value):
    """Retourne le numéro au format +221XXXXXXXXX ; lève ValidationError sinon."""
    raw = _SEPARATORS.sub('', str(value or ''))
    if raw.startswith('00'):
        raw = '+' + raw[2:]
    if raw.startswith(COUNTRY_CODE):
        national = raw[len(COUNTRY_CODE) :]
    elif raw.startswith('+'):
        raise ValidationError(
            "Seuls les numéros sénégalais (+221) sont acceptés.", code='invalid_country'
        )
    elif raw.startswith('221') and len(raw) == 12:
        national = raw[3:]
    else:
        national = raw
    if not _NATIONAL_PATTERN.match(national):
        raise ValidationError(INVALID_MESSAGE, code='invalid_phone')
    return COUNTRY_CODE + national


def validate_phone_number(value):
    """Validateur de modèle : le numéro doit déjà être normalisé (E.164)."""
    if not E164_PATTERN.match(value or ''):
        raise ValidationError(INVALID_MESSAGE, code='invalid_phone')
