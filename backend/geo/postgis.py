"""
Expressions ORM PostGIS (sans GeoDjango ni GDAL).

Les points sont construits à la volée à partir des colonnes
``latitude``/``longitude`` : ``geography(ST_SetSRID(ST_MakePoint(lon, lat), 4326))``.
Cette expression est exactement celle de l'index GiST créé par
``geo.operations.AddGeographyIndex`` : PostgreSQL peut donc s'en servir
pour ``ST_DWithin`` et pour le tri KNN (``<->``).

Toutes les distances sont calculées sur la sphère (``use_spheroid = false``),
comme ``geo.distance.haversine_m``.

Auteur : Ibrahima Khalilou Diallo
"""

from django.db.models import BooleanField, F, FloatField, Func, Value
from django.db.models.functions import Cast

GEOGRAPHY_TEMPLATE = "geography(ST_SetSRID(ST_MakePoint(%(expressions)s), 4326))"


class GeographyPoint(Func):
    """Point ``geography`` WGS 84 construit à partir de (longitude, latitude)."""

    template = GEOGRAPHY_TEMPLATE
    arity = 2
    output_field = FloatField()


class DWithin(Func):
    """``ST_DWithin(a, b, distance_m, false)`` : vrai si a est à moins de d de b."""

    function = 'ST_DWithin'
    arity = 4
    output_field = BooleanField()


class SphereDistance(Func):
    """``ST_Distance(a, b, false)`` : distance sur la sphère, en mètres."""

    function = 'ST_Distance'
    arity = 3
    output_field = FloatField()


class KNNDistance(Func):
    """Opérateur KNN ``a <-> b`` : tri par distance appuyé sur l'index GiST."""

    template = '(%(expressions)s)'
    arg_joiner = " <-> "
    arity = 2
    output_field = FloatField()


def column_point(latitude_field, longitude_field):
    """Point ``geography`` d'une ligne (champs éventuellement joints)."""
    return GeographyPoint(F(longitude_field), F(latitude_field))


def constant_point(point):
    """Point ``geography`` d'une position connue (paramètres typés float8)."""
    return GeographyPoint(
        Cast(Value(point.longitude), FloatField()),
        Cast(Value(point.latitude), FloatField()),
    )


def within(column, target, radius_m):
    return DWithin(column, target, Value(float(radius_m)), Value(False))


def sphere_distance(column, target):
    return SphereDistance(column, target, Value(False))
