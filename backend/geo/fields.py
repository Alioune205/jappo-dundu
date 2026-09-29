"""
Champs et contraintes de position (latitude/longitude WGS 84).

Les contraintes CHECK garantissent en base qu'une position est soit
absente (les deux colonnes NULL), soit complète et dans les bornes.

Auteur : Ibrahima Khalilou Diallo
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from .distance import MAX_LATITUDE, MAX_LONGITUDE

LATITUDE_VALIDATORS = [
    MinValueValidator(-MAX_LATITUDE),
    MaxValueValidator(MAX_LATITUDE),
]
LONGITUDE_VALIDATORS = [
    MinValueValidator(-MAX_LONGITUDE),
    MaxValueValidator(MAX_LONGITUDE),
]


def latitude_field(*, null=False, verbose_name="Latitude"):
    return models.FloatField(
        null=null,
        blank=null,
        validators=LATITUDE_VALIDATORS,
        verbose_name=verbose_name,
        help_text="Degrés décimaux WGS 84 (-90 à 90).",
    )


def longitude_field(*, null=False, verbose_name="Longitude"):
    return models.FloatField(
        null=null,
        blank=null,
        validators=LONGITUDE_VALIDATORS,
        verbose_name=verbose_name,
        help_text="Degrés décimaux WGS 84 (-180 à 180).",
    )


def coordinates_constraint(name, *, latitude='latitude', longitude='longitude', nullable):
    """Contrainte CHECK : position complète et dans les bornes (ou absente)."""
    in_range = Q(
        **{
            f'{latitude}__isnull': False,
            f'{longitude}__isnull': False,
            f'{latitude}__gte': -MAX_LATITUDE,
            f'{latitude}__lte': MAX_LATITUDE,
            f'{longitude}__gte': -MAX_LONGITUDE,
            f'{longitude}__lte': MAX_LONGITUDE,
        }
    )
    if nullable:
        in_range |= Q(**{f'{latitude}__isnull': True, f'{longitude}__isnull': True})
    return models.CheckConstraint(condition=in_range, name=name)
