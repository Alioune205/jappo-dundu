"""
Validation des paramètres d'une recherche de proximité (query string).

    GET ...?latitude=14.69&longitude=-17.44&radius_km=20&limit=10

Auteur : Ibrahima Khalilou Diallo
"""

import math

from rest_framework import serializers

from .distance import MAX_LATITUDE, MAX_LONGITUDE, GeoPoint

MAX_RADIUS_KM = 1000.0
MIN_RADIUS_KM = 0.1
DEFAULT_LIMIT = 10
MAX_LIMIT = 100


def validate_finite(value):
    if not math.isfinite(value):
        raise serializers.ValidationError("Nombre fini attendu.")


class NearbyQuerySerializer(serializers.Serializer):
    """Point de référence, rayon et nombre de résultats.

    Le rayon par défaut est propre à chaque route : il est transmis par le
    contexte (``default_radius_km``).
    """

    latitude = serializers.FloatField(
        min_value=-MAX_LATITUDE, max_value=MAX_LATITUDE, validators=[validate_finite]
    )
    longitude = serializers.FloatField(
        min_value=-MAX_LONGITUDE, max_value=MAX_LONGITUDE, validators=[validate_finite]
    )
    radius_km = serializers.FloatField(
        min_value=MIN_RADIUS_KM,
        max_value=MAX_RADIUS_KM,
        required=False,
        validators=[validate_finite],
    )
    limit = serializers.IntegerField(min_value=1, max_value=MAX_LIMIT, default=DEFAULT_LIMIT)

    def validate(self, attrs):
        attrs.setdefault('radius_km', self.context.get('default_radius_km', 20.0))
        attrs['point'] = GeoPoint(attrs['latitude'], attrs['longitude'])
        attrs['radius_m'] = attrs['radius_km'] * 1000
        return attrs


def parse_nearby_query(params, *, default_radius_km):
    """Valide la query string ; lève ValidationError (400) si invalide."""
    serializer = NearbyQuerySerializer(
        data=params, context={'default_radius_km': default_radius_km}
    )
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def distance_km(obj):
    """Distance arrondie à 10 m, pour les réponses de l'API."""
    distance_m = getattr(obj, 'distance_m', None)
    return None if distance_m is None else round(distance_m / 1000, 2)
