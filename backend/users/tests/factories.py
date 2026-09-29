"""
Fabriques de données partagées par les tests des modules métier.

Auteur : Ibrahima Khalilou Diallo
"""

import math
from contextlib import ExitStack, contextmanager
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from geo.distance import EARTH_RADIUS_M
from security.roles import Role
from users.models import HealthFacility, UserProfile
from users.services import create_account

User = get_user_model()

PASSWORD = 'Str0ng-Passw0rd!'

# Point de référence des tests (centre de Dakar).
ORIGIN = (14.6928, -17.4467)


def offset(north_km=0.0, east_km=0.0, origin=ORIGIN):
    """Coordonnées situées à (north_km, east_km) de ``origin``."""
    latitude, longitude = origin
    d_lat = math.degrees(north_km * 1000 / EARTH_RADIUS_M)
    d_lon = math.degrees(east_km * 1000 / (EARTH_RADIUS_M * math.cos(math.radians(latitude))))
    return latitude + d_lat, longitude + d_lon


_counter = {'phone': 0}


def next_phone():
    _counter['phone'] += 1
    return f'+22177{_counter["phone"]:07d}'


def make_facility(name="Hôpital Test", *, north_km=0.0, east_km=0.0, **fields):
    latitude, longitude = offset(north_km, east_km)
    defaults = {
        'facility_type': HealthFacility.FacilityType.HOSPITAL,
        'region': 'dakar',
        'city': 'Dakar',
        'latitude': latitude,
        'longitude': longitude,
    }
    defaults.update(fields)
    return HealthFacility.objects.create(name=name, **defaults)


def make_user(
    username, role=None, *, password=None, facility=None, phone=None, region='dakar', **fields
):
    """Compte avec profil ; ``role`` None : compte sans rôle.

    Sans ``password``, le mot de passe est inutilisable (pas de hachage :
    tests rapides) ; les tests de connexion passent ``password=PASSWORD``.
    """
    fields.setdefault('first_name', username.capitalize())
    fields.setdefault('last_name', 'Test')
    profile = {'phone_number': phone, 'region': region, 'facility': facility}
    if role is None:
        user = User.objects.create_user(username=username, password=password, **fields)
        UserProfile.objects.create(user=user, **profile)
        return user
    return create_account(
        username=username, password=password, role=Role(role), profile=profile, **fields
    )


def birth_date_for_age(age, today):
    return date(today.year - age, 1, 1)


def api_client(user=None):
    """Client API authentifié (cache de throttling vidé)."""
    cache.clear()
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


@contextmanager
def captured_broadcasts(*modules):
    """Remplace broadcast_alert/broadcast_dashboard dans ``modules``.

    Retourne un dictionnaire {'alert': [...], 'dashboard': [...]} des appels
    (kind, data, kwargs), à lire après exécution des callbacks on_commit.
    """
    calls = {'alert': [], 'dashboard': []}

    def recorder(bucket):
        def record(kind, data, **kwargs):
            calls[bucket].append((kind, data, kwargs))
            return True

        return record

    with ExitStack() as stack:
        for module in modules:
            stack.enter_context(
                mock.patch(f'{module}.broadcast_alert', side_effect=recorder('alert'))
            )
            stack.enter_context(
                mock.patch(f'{module}.broadcast_dashboard', side_effect=recorder('dashboard'))
            )
        yield calls
