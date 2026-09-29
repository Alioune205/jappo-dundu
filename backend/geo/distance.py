"""
Calculs de distance sur la sphère terrestre.

Le rayon utilisé est le rayon moyen de l'ellipsoïde WGS 84, celui que
PostGIS emploie pour ses calculs sur sphère (``use_spheroid = false``) :
les distances Python et PostGIS concordent au millimètre près.

Auteur : Ibrahima Khalilou Diallo
"""

import math
from dataclasses import dataclass

# Rayon moyen WGS 84 : (2a + b) / 3, en mètres.
EARTH_RADIUS_M = 6_371_008.7714

MAX_LATITUDE = 90.0
MAX_LONGITUDE = 180.0


@dataclass(frozen=True, slots=True)
class GeoPoint:
    """Point WGS 84 (degrés décimaux), validé à la construction."""

    latitude: float
    longitude: float

    def __post_init__(self):
        for name, value, limit in (
            ('latitude', self.latitude, MAX_LATITUDE),
            ('longitude', self.longitude, MAX_LONGITUDE),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(f"{name} doit être un nombre.")
            if not math.isfinite(value) or not -limit <= value <= limit:
                raise ValueError(f"{name} doit être comprise entre -{limit} et {limit}.")
        object.__setattr__(self, 'latitude', float(self.latitude))
        object.__setattr__(self, 'longitude', float(self.longitude))


def haversine_m(origin, latitude, longitude):
    """Distance en mètres entre ``origin`` (GeoPoint) et un point."""
    phi1 = math.radians(origin.latitude)
    phi2 = math.radians(latitude)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(longitude - origin.longitude)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    # min() protège asin des erreurs d'arrondi (a légèrement > 1).
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


@dataclass(frozen=True, slots=True)
class BoundingBox:
    """Boîte englobante d'un cercle ; longitudes None = pas de filtre."""

    min_latitude: float
    max_latitude: float
    min_longitude: float | None
    max_longitude: float | None


def bounding_box(origin, radius_m):
    """Boîte contenant tous les points à moins de ``radius_m`` de ``origin``.

    Méthode de J. P. Matuschek (« Finding Points Within a Distance of a
    Latitude/Longitude Using Bounding Coordinates »). Si le cercle contient
    un pôle ou traverse l'antiméridien, la contrainte de longitude est
    levée : le résultat reste exact, le filtre est seulement moins sélectif.
    """
    if radius_m < 0:
        raise ValueError("Le rayon doit être positif.")
    angular = radius_m / EARTH_RADIUS_M
    lat = math.radians(origin.latitude)
    min_lat = lat - angular
    max_lat = lat + angular

    if min_lat <= -math.pi / 2 or max_lat >= math.pi / 2 or angular >= math.pi / 2:
        return BoundingBox(
            max(-MAX_LATITUDE, math.degrees(min_lat)),
            min(MAX_LATITUDE, math.degrees(max_lat)),
            None,
            None,
        )

    delta_lon = math.asin(min(1.0, math.sin(angular) / math.cos(lat)))
    min_lon = math.radians(origin.longitude) - delta_lon
    max_lon = math.radians(origin.longitude) + delta_lon
    if min_lon < -math.pi or max_lon > math.pi:
        return BoundingBox(math.degrees(min_lat), math.degrees(max_lat), None, None)

    return BoundingBox(
        math.degrees(min_lat),
        math.degrees(max_lat),
        math.degrees(min_lon),
        math.degrees(max_lon),
    )
