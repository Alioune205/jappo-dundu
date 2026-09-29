"""
Tests du moteur géographique : distances, boîte englobante, recherche des
plus proches voisins (moteur portable et PostGIS), index GiST.

Les tests PostGIS ne s'exécutent que sur PostgreSQL.

Auteur : Ibrahima Khalilou Diallo
"""

import math
import random
from unittest import skipUnless

from django.db import connection
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError

from users.models import HealthFacility
from users.tests.factories import ORIGIN, make_facility, offset

from . import postgis
from .distance import EARTH_RADIUS_M, GeoPoint, bounding_box, haversine_m
from .operations import AddGeographyIndex
from .search import nearest, portable_nearest, postgis_nearest
from .serializers import parse_nearby_query

ON_POSTGRESQL = connection.vendor == 'postgresql'


class GeoPointTests(SimpleTestCase):
    def test_valid_point(self):
        point = GeoPoint(14, -17)
        self.assertEqual((point.latitude, point.longitude), (14.0, -17.0))
        self.assertIsInstance(point.latitude, float)

    def test_out_of_range_is_rejected(self):
        for latitude, longitude in ((91, 0), (-90.5, 0), (0, 180.1), (0, -181)):
            with self.assertRaises(ValueError):
                GeoPoint(latitude, longitude)

    def test_non_finite_and_non_numeric_are_rejected(self):
        with self.assertRaises(ValueError):
            GeoPoint(math.nan, 0)
        with self.assertRaises(ValueError):
            GeoPoint(0, math.inf)
        with self.assertRaises(TypeError):
            GeoPoint('14', 0)
        with self.assertRaises(TypeError):
            GeoPoint(True, 0)


class HaversineTests(SimpleTestCase):
    def test_zero_distance(self):
        self.assertEqual(haversine_m(GeoPoint(*ORIGIN), *ORIGIN), 0)

    def test_quarter_meridian(self):
        self.assertAlmostEqual(
            haversine_m(GeoPoint(0, 0), 90, 0), math.pi / 2 * EARTH_RADIUS_M, places=3
        )

    def test_antipodes(self):
        self.assertAlmostEqual(
            haversine_m(GeoPoint(0, 0), 0, 180), math.pi * EARTH_RADIUS_M, places=3
        )

    def test_symmetry(self):
        a, b = GeoPoint(14.69, -17.44), GeoPoint(12.56, -16.27)
        self.assertAlmostEqual(
            haversine_m(a, b.latitude, b.longitude),
            haversine_m(b, a.latitude, a.longitude),
            places=6,
        )

    def test_offset_helper_matches_distance(self):
        latitude, longitude = offset(north_km=3, east_km=4)
        self.assertAlmostEqual(haversine_m(GeoPoint(*ORIGIN), latitude, longitude), 5000, delta=5)


class BoundingBoxTests(SimpleTestCase):
    def test_box_contains_every_point_of_the_disc(self):
        rng = random.Random(42)
        for _ in range(200):
            origin = GeoPoint(rng.uniform(-80, 80), rng.uniform(-179, 179))
            radius = rng.uniform(100, 500_000)
            box = bounding_box(origin, radius)
            for _ in range(20):
                # Point aléatoire à l'intérieur du disque (cap et distance).
                bearing = rng.uniform(0, 2 * math.pi)
                angular = rng.uniform(0, radius) / EARTH_RADIUS_M
                lat1, lon1 = math.radians(origin.latitude), math.radians(origin.longitude)
                lat2 = math.asin(
                    math.sin(lat1) * math.cos(angular)
                    + math.cos(lat1) * math.sin(angular) * math.cos(bearing)
                )
                lon2 = lon1 + math.atan2(
                    math.sin(bearing) * math.sin(angular) * math.cos(lat1),
                    math.cos(angular) - math.sin(lat1) * math.sin(lat2),
                )
                latitude = math.degrees(lat2)
                longitude = (math.degrees(lon2) + 540) % 360 - 180
                self.assertLessEqual(box.min_latitude, latitude + 1e-9)
                self.assertGreaterEqual(box.max_latitude, latitude - 1e-9)
                if box.min_longitude is not None:
                    self.assertLessEqual(box.min_longitude, longitude + 1e-9)
                    self.assertGreaterEqual(box.max_longitude, longitude - 1e-9)

    def test_pole_disables_longitude_filter(self):
        box = bounding_box(GeoPoint(89.9, 0), 50_000)
        self.assertIsNone(box.min_longitude)
        self.assertEqual(box.max_latitude, 90)

    def test_antimeridian_disables_longitude_filter(self):
        box = bounding_box(GeoPoint(0, 179.99), 10_000)
        self.assertIsNone(box.min_longitude)

    def test_negative_radius_is_rejected(self):
        with self.assertRaises(ValueError):
            bounding_box(GeoPoint(0, 0), -1)


class NearbyQueryTests(SimpleTestCase):
    def test_defaults(self):
        query = parse_nearby_query(
            {'latitude': '14.7', 'longitude': '-17.4'}, default_radius_km=30
        )
        self.assertEqual(query['radius_m'], 30_000)
        self.assertEqual(query['limit'], 10)
        self.assertEqual(query['point'], GeoPoint(14.7, -17.4))

    def test_invalid_values(self):
        cases = [
            {'longitude': '-17.4'},
            {'latitude': '95', 'longitude': '0'},
            {'latitude': 'nan', 'longitude': '0'},
            {'latitude': '14', 'longitude': '-17', 'radius_km': '0'},
            {'latitude': '14', 'longitude': '-17', 'radius_km': '5000'},
            {'latitude': '14', 'longitude': '-17', 'limit': '0'},
            {'latitude': '14', 'longitude': '-17', 'limit': '1000'},
        ]
        for params in cases:
            with self.subTest(params=params), self.assertRaises(ValidationError):
                parse_nearby_query(params, default_radius_km=20)


class AddGeographyIndexTests(SimpleTestCase):
    def test_index_name_length_is_checked(self):
        with self.assertRaises(ValueError):
            AddGeographyIndex(model_name='donor', name='x' * 64)


class NearestSearchTests(TestCase):
    """Recherche sur le moteur de la base courante (PostGIS ou portable)."""

    @classmethod
    def setUpTestData(cls):
        cls.center = make_facility('Centre', north_km=0)
        cls.near = make_facility('Proche', north_km=2)
        cls.mid = make_facility('Moyen', east_km=-5)
        cls.far = make_facility('Lointain', north_km=40)
        cls.inactive = make_facility('Inactif', north_km=1, is_active=False)

    def search(self, radius_km=10, limit=10, queryset=None):
        queryset = (
            queryset if queryset is not None else HealthFacility.objects.filter(is_active=True)
        )
        return nearest(queryset, GeoPoint(*ORIGIN), radius_m=radius_km * 1000, limit=limit)

    def test_sorted_by_distance_within_radius(self):
        results = self.search()
        self.assertEqual([f.name for f in results], ['Centre', 'Proche', 'Moyen'])
        self.assertAlmostEqual(results[0].distance_m, 0, delta=0.01)
        self.assertAlmostEqual(results[1].distance_m, 2000, delta=5)
        self.assertAlmostEqual(results[2].distance_m, 5000, delta=5)

    def test_limit(self):
        self.assertEqual([f.name for f in self.search(limit=2)], ['Centre', 'Proche'])

    def test_larger_radius(self):
        self.assertEqual(len(self.search(radius_km=50)), 4)

    def test_business_filters_are_kept(self):
        results = self.search(queryset=HealthFacility.objects.filter(name__startswith='P'))
        self.assertEqual([f.name for f in results], ['Proche'])

    def test_ties_are_ordered_by_primary_key(self):
        twin = make_facility('Jumeau', north_km=2)
        results = self.search(limit=3)
        self.assertEqual([f.pk for f in results[1:3]], sorted([self.near.pk, twin.pk]))

    def test_invalid_arguments(self):
        with self.assertRaises(ValueError):
            self.search(radius_km=0)
        with self.assertRaises(ValueError):
            self.search(limit=0)


@skipUnless(ON_POSTGRESQL, "PostGIS : PostgreSQL requis.")
class PostGISEngineTests(TestCase):
    """Le moteur PostGIS et le moteur portable renvoient le même résultat."""

    @classmethod
    def setUpTestData(cls):
        rng = random.Random(2026)
        HealthFacility.objects.bulk_create(
            [
                HealthFacility(
                    name=f"Établissement {index}",
                    facility_type=HealthFacility.FacilityType.HOSPITAL,
                    region='dakar',
                    city='Dakar',
                    latitude=ORIGIN[0] + rng.uniform(-1, 1),
                    longitude=ORIGIN[1] + rng.uniform(-1, 1),
                )
                for index in range(300)
            ]
        )

    def test_engines_agree(self):
        queryset = HealthFacility.objects.all()
        rng = random.Random(7)
        for _ in range(10):
            origin = GeoPoint(
                ORIGIN[0] + rng.uniform(-0.5, 0.5), ORIGIN[1] + rng.uniform(-0.5, 0.5)
            )
            radius_m = rng.uniform(5_000, 80_000)
            kwargs = {
                'radius_m': radius_m,
                'limit': 25,
                'latitude_field': 'latitude',
                'longitude_field': 'longitude',
            }
            with_postgis = postgis_nearest(queryset, origin, **kwargs)
            portable = portable_nearest(queryset, origin, **kwargs)
            self.assertEqual([f.pk for f in with_postgis], [f.pk for f in portable])
            for a, b in zip(with_postgis, portable, strict=True):
                self.assertAlmostEqual(a.distance_m, b.distance_m, delta=0.01)

    def test_gist_index_is_used(self):
        column = postgis.column_point('latitude', 'longitude')
        target = postgis.constant_point(GeoPoint(*ORIGIN))
        queryset = (
            HealthFacility.objects.filter(postgis.within(column, target, 10_000)).order_by(
                postgis.KNNDistance(column, target)
            )
        )[:5]
        with connection.cursor() as cursor:
            # 300 lignes : sans cette consigne, un parcours séquentiel suffit.
            cursor.execute("SET LOCAL enable_seqscan = off")
        self.assertIn('users_facility_geography_gist', queryset.explain())

    def test_postgis_extension_is_installed(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
            self.assertIsNotNone(cursor.fetchone())
