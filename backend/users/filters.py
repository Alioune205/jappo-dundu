"""
Lecture et validation des filtres de la query string (400 si invalide).

Partagé par les modules users, sang, lits et ambulances.

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.exceptions import ValidationError

_TRUE = frozenset({'true', '1', 'yes', 'oui'})
_FALSE = frozenset({'false', '0', 'no', 'non'})


def choice_param(params, name, choices, transform=str):
    """Valeur d'un filtre à choix, ou None s'il est absent."""
    value = params.get(name)
    if value in (None, ''):
        return None
    value = transform(value)
    if value not in choices:
        raise ValidationError({name: [f"Valeur invalide : {value!r}."]})
    return value


def int_param(params, name, *, default=None, minimum=1, maximum=2**31 - 1):
    """Entier borné, ou ``default`` s'il est absent."""
    value = params.get(name)
    if value in (None, ''):
        return default
    try:
        number = int(value)
    except ValueError:
        number = None
    if number is None or not minimum <= number <= maximum:
        raise ValidationError({name: [f"Entier attendu entre {minimum} et {maximum}."]})
    return number


def boolean_param(params, name, *, default=None):
    """Booléen (true/false, 1/0, oui/non), ou ``default`` s'il est absent."""
    value = params.get(name)
    if value in (None, ''):
        return default
    value = value.strip().lower()
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise ValidationError({name: ["Booléen attendu : true ou false."]})
