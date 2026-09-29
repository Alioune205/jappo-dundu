"""
Outils partagés par les tests du module Sang.

Auteur : Ibrahima Khalilou Diallo
"""

from django.utils import timezone

from security.roles import Role
from users.tests.factories import birth_date_for_age, make_facility, make_user, next_phone, offset

from ..models import BloodRequest, Donor


def make_donor(
    username,
    blood_group='O+',
    *,
    north_km=0.0,
    east_km=0.0,
    located=True,
    sex='M',
    age=30,
    **fields,
):
    user = make_user(username, Role.DONOR, phone=next_phone())
    latitude, longitude = offset(north_km, east_km) if located else (None, None)
    return Donor.objects.create(
        user=user,
        blood_group=blood_group,
        sex=sex,
        date_of_birth=birth_date_for_age(age, timezone.localdate()),
        latitude=latitude,
        longitude=longitude,
        **fields,
    )


def make_request(facility, blood_group='O+', **fields):
    fields.setdefault('units_needed', 2)
    return BloodRequest.objects.create(facility=facility, blood_group=blood_group, **fields)


class SangFixturesMixin:
    """Deux hôpitaux (centre de Dakar, 5 km à l'est), leur personnel, un admin."""

    @classmethod
    def setUpTestData(cls):
        cls.hospital = make_facility("Hôpital A")
        cls.other_hospital = make_facility("Hôpital B", east_km=5)
        cls.admin = make_user('admin', Role.ADMIN)
        cls.staff = make_user('staff_a', Role.HOSPITAL_STAFF, facility=cls.hospital)
        cls.other_staff = make_user('staff_b', Role.HOSPITAL_STAFF, facility=cls.other_hospital)
