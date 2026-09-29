"""
Recherche des plus proches voisins dans un rayon.

Usage :

    from geo.distance import GeoPoint
    from geo.search import nearest

    donors = nearest(
        Donor.objects.filter(blood_group__in=groups),
        GeoPoint(14.6928, -17.4467),
        radius_m=20_000,
        limit=10,
    )
    donors[0].distance_m   # distance en mètres, tri croissant

Le filtre métier reste dans le queryset fourni (composable) ; ce module
n'ajoute que la contrainte de distance, le tri et la limite. Chaque objet
retourné porte un attribut ``distance_m``. À distance égale, l'ordre est
celui de la clé primaire (résultat déterministe).

Auteur : Ibrahima Khalilou Diallo
"""

import heapq

from django.db import connections
from django.db.models import F

from . import postgis
from .distance import bounding_box, haversine_m

MAX_RESULTS = 500


def nearest(
    queryset,
    origin,
    *,
    radius_m,
    limit,
    latitude_field='latitude',
    longitude_field='longitude',
):
    """Objets de ``queryset`` à moins de ``radius_m`` d'``origin``, du plus proche.

    Args:
        queryset: queryset de départ (filtres métier déjà appliqués).
        origin: ``geo.distance.GeoPoint`` de référence.
        radius_m: rayon de recherche en mètres (> 0).
        limit: nombre maximal de résultats (1 à ``MAX_RESULTS``).
        latitude_field, longitude_field: champs de position, éventuellement
            à travers une relation (``'facility__latitude'``).
    """
    if not radius_m > 0:
        raise ValueError("Le rayon de recherche doit être strictement positif.")
    if not 1 <= limit <= MAX_RESULTS:
        raise ValueError(f"limit doit être compris entre 1 et {MAX_RESULTS}.")

    queryset = queryset.filter(
        **{
            f'{latitude_field}__isnull': False,
            f'{longitude_field}__isnull': False,
        }
    )
    engine = (
        postgis_nearest if connections[queryset.db].vendor == 'postgresql' else portable_nearest
    )
    return engine(
        queryset,
        origin,
        radius_m=radius_m,
        limit=limit,
        latitude_field=latitude_field,
        longitude_field=longitude_field,
    )


def postgis_nearest(queryset, origin, *, radius_m, limit, latitude_field, longitude_field):
    """Moteur PostGIS : ST_DWithin + tri KNN, en une seule requête indexée."""
    column = postgis.column_point(latitude_field, longitude_field)
    target = postgis.constant_point(origin)
    return list(
        queryset.filter(postgis.within(column, target, radius_m))
        .annotate(distance_m=postgis.sphere_distance(column, target))
        .order_by(postgis.KNNDistance(column, target), 'pk')[:limit]
    )


def portable_nearest(queryset, origin, *, radius_m, limit, latitude_field, longitude_field):
    """Moteur portable : boîte englobante en SQL, puis Haversine en Python."""
    box = bounding_box(origin, radius_m)
    queryset = queryset.filter(
        **{
            f'{latitude_field}__gte': box.min_latitude,
            f'{latitude_field}__lte': box.max_latitude,
        }
    )
    if box.min_longitude is not None:
        queryset = queryset.filter(
            **{
                f'{longitude_field}__gte': box.min_longitude,
                f'{longitude_field}__lte': box.max_longitude,
            }
        )
    queryset = queryset.annotate(
        geo_search_latitude=F(latitude_field),
        geo_search_longitude=F(longitude_field),
    )

    def candidates():
        for obj in queryset.iterator(chunk_size=2000):
            distance = haversine_m(origin, obj.geo_search_latitude, obj.geo_search_longitude)
            if distance <= radius_m:
                obj.distance_m = distance
                yield obj

    return heapq.nsmallest(limit, candidates(), key=lambda obj: (obj.distance_m, obj.pk))
