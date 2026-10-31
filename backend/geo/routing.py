"""
Temps de trajet par la route.

La distance à vol d'oiseau trompe en ville : à Dakar, une ambulance à 3 km
de l'autre côté de l'autoroute peut arriver après une autre à 5 km. Ce
module donne des **durées de trajet** :

- avec un serveur OSRM (``OSRM_URL``, ex. ``http://osrm:5000`` monté sur la
  carte OpenStreetMap du Sénégal) : durées calculées sur le réseau routier,
  en un seul appel pour tous les candidats (service ``table``) ;
- sinon, ou si OSRM ne répond pas vite (``OSRM_TIMEOUT_SECONDS``) : une
  estimation à partir de la distance, avec un facteur de détour et une
  vitesse moyenne d'ambulance (``ROUTING_DETOUR_FACTOR``,
  ``ROUTING_SPEED_KMH``). Un calcul d'itinéraire ne doit jamais retarder une
  affectation.

Chaque résultat indique sa source (``osrm`` ou ``estimate``) : les écrans
précisent qu'une durée est estimée.
"""

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

from .distance import GeoPoint, haversine_m

logger = logging.getLogger('jappo_dundu.geo')

SOURCE_OSRM = 'osrm'
SOURCE_ESTIMATE = 'estimate'


@dataclass(frozen=True, slots=True)
class TravelTime:
    minutes: float
    distance_km: float
    source: str


def _setting(name, default):
    return getattr(settings, name, default)


def estimate(origin, latitude, longitude):
    """Durée estimée sans moteur d'itinéraire : distance × détour ÷ vitesse moyenne."""
    road_km = haversine_m(origin, latitude, longitude) / 1000 * _setting('ROUTING_DETOUR_FACTOR', 1.4)
    minutes = road_km / _setting('ROUTING_SPEED_KMH', 35) * 60
    return TravelTime(round(minutes, 1), round(road_km, 2), SOURCE_ESTIMATE)


def _osrm_pairs(anchor, others, *, from_anchor):
    """Durées OSRM (s, m) entre ``anchor`` et chaque point de ``others`` ; None si indisponible.

    ``from_anchor`` : trajets anchor → autres (sinon autres → anchor).
    """
    base = _setting('OSRM_URL', '')
    if not base:
        return None
    points = [(anchor.latitude, anchor.longitude), *others]
    coordinates = ';'.join(f'{longitude:.6f},{latitude:.6f}' for latitude, longitude in points)
    others_idx = ';'.join(str(i) for i in range(1, len(points)))
    query = f'sources=0&destinations={others_idx}' if from_anchor else f'sources={others_idx}&destinations=0'
    url = f"{base.rstrip('/')}/table/v1/driving/{coordinates}?{query}&annotations=duration,distance"
    try:
        with urllib.request.urlopen(url, timeout=_setting('OSRM_TIMEOUT_SECONDS', 1.5)) as response:
            body = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        logger.warning("OSRM indisponible (%s) : durées estimées.", exc)
        return None
    if body.get('code') != 'Ok':
        logger.warning("OSRM : réponse %s, durées estimées.", body.get('code'))
        return None
    if from_anchor:
        return list(zip(body['durations'][0], body['distances'][0], strict=True))
    return [(row[0], dist[0]) for row, dist in zip(body['durations'], body['distances'], strict=True)]


def _travel_times(anchor, others, *, from_anchor):
    pairs = _osrm_pairs(anchor, others, from_anchor=from_anchor) if others else None
    results = []
    for index, (latitude, longitude) in enumerate(others):
        duration, distance = pairs[index] if pairs else (None, None)
        if duration is not None:
            results.append(TravelTime(round(duration / 60, 1), round(distance / 1000, 2), SOURCE_OSRM))
        elif from_anchor:
            results.append(estimate(anchor, latitude, longitude))
        else:
            results.append(estimate(GeoPoint(latitude, longitude), anchor.latitude, anchor.longitude))
    return results


def travel_times_from(origin, targets):
    """Durées de ``origin`` (GeoPoint) vers chaque cible ``(latitude, longitude)``, dans l'ordre."""
    return _travel_times(origin, list(targets), from_anchor=True)


def travel_times_to(destination, sources):
    """Durées de chaque source ``(latitude, longitude)`` vers ``destination`` (GeoPoint), dans l'ordre."""
    return _travel_times(destination, list(sources), from_anchor=False)


def travel_time(origin, latitude, longitude):
    """Durée d'un seul trajet ``origin`` → point."""
    return travel_times_from(origin, [(latitude, longitude)])[0]
