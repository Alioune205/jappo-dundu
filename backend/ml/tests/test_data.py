"""
Tests du générateur de données simulées et du calendrier sénégalais.

Auteur : El Hadji Massogui Diop
"""

from datetime import date, timedelta

import pandas as pd
from django.test import SimpleTestCase, TestCase

from ml.constants import BLOOD_GROUP_CODES, REGION_CODES
from ml.models import BloodStockRecord
from ml.services.data_generator import BLOOD_GROUP_SHARES, BloodDataGenerator
from ml.services.senegal_calendar import event_flags, events_for_year, islamic_to_gregorian

from .helpers import small_history

END = date(2026, 6, 30)


class GeneratorTests(SimpleTestCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.df = BloodDataGenerator(seed=42).generate(end_date=END, days=400)

    def test_shape_and_columns(self):
        self.assertEqual(
            list(self.df.columns),
            ['center_name', 'region', 'blood_group', 'date', 'units_available',
             'units_donated', 'units_used', 'units_expired'],
        )
        self.assertEqual(len(self.df), 16 * 8 * 401)

    def test_all_regions_and_blood_groups(self):
        self.assertEqual(set(self.df['region']), set(REGION_CODES))
        self.assertEqual(set(self.df['blood_group']), set(BLOOD_GROUP_CODES))

    def test_blood_group_shares_sum_to_one(self):
        self.assertAlmostEqual(sum(BLOOD_GROUP_SHARES.values()), 1.0)

    def test_counts_are_non_negative_integers(self):
        counts = self.df[['units_available', 'units_donated', 'units_used', 'units_expired']]
        self.assertTrue((counts >= 0).all().all())
        self.assertTrue(all(pd.api.types.is_integer_dtype(t) for t in counts.dtypes))

    def test_stock_accounting_identity(self):
        """stock(j) = stock(j-1) + dons(j) - utilisations(j) - péremptions(j)."""
        df = self.df.sort_values(['center_name', 'blood_group', 'date'])
        previous = df.groupby(['center_name', 'blood_group'])['units_available'].shift(1)
        expected = previous + df['units_donated'] - df['units_used'] - df['units_expired']
        mask = previous.notna()
        self.assertTrue((df.loc[mask, 'units_available'] == expected[mask]).all())

    def test_usage_never_exceeds_available_stock(self):
        df = self.df.sort_values(['center_name', 'blood_group', 'date'])
        previous = df.groupby(['center_name', 'blood_group'])['units_available'].shift(1)
        mask = previous.notna()
        available = previous[mask] + df.loc[mask, 'units_donated']
        self.assertTrue((df.loc[mask, 'units_used'] <= available).all())

    def test_simulation_contains_shortages(self):
        """Le modèle doit avoir des pénuries à apprendre."""
        self.assertGreater((self.df['units_available'] == 0).mean(), 0)

    def test_reproducible_with_seed(self):
        other = BloodDataGenerator(seed=42).generate(end_date=END, days=400)
        pd.testing.assert_frame_equal(self.df, other)
        different = BloodDataGenerator(seed=43).generate(end_date=END, days=400)
        self.assertFalse(self.df.equals(different))

    def test_invalid_period(self):
        with self.assertRaises(ValueError):
            BloodDataGenerator().generate(start_date=END, end_date=END - timedelta(days=1))


class GeneratorPersistenceTests(TestCase):

    def test_save_counts_created_rows_and_ignores_duplicates(self):
        df = small_history(days=60)
        self.assertEqual(BloodDataGenerator.save_to_db(df), len(df))
        self.assertEqual(BloodDataGenerator.save_to_db(df), 0)
        self.assertEqual(
            BloodStockRecord.objects.filter(source='synthetic').count(), len(df)
        )


class SenegalCalendarTests(SimpleTestCase):
    """Dates tabulaires comparées aux dates observées (± 1 jour)."""

    def assertNear(self, computed, expected):
        self.assertLessEqual(abs((computed - expected).days), 1, (computed, expected))

    def test_known_dates(self):
        self.assertNear(islamic_to_gregorian(1446, 9, 1), date(2025, 3, 1))    # Ramadan
        self.assertNear(islamic_to_gregorian(1446, 10, 1), date(2025, 3, 30))  # Korité
        self.assertNear(islamic_to_gregorian(1445, 12, 10), date(2024, 6, 17))  # Tabaski
        self.assertNear(islamic_to_gregorian(1446, 12, 10), date(2025, 6, 7))   # Tabaski
        self.assertNear(islamic_to_gregorian(1446, 2, 18), date(2024, 8, 23))   # Magal

    def test_events_for_year(self):
        events = {name: (start, end) for name, start, end in events_for_year(2025)}
        self.assertEqual(set(events), {'ramadan', 'tabaski', 'magal'})
        start, end = events['ramadan']
        self.assertIn((end - start).days + 1, (29, 30))

    def test_event_flags(self):
        flags = event_flags(pd.date_range('2025-03-10', '2025-03-11'))
        self.assertTrue(flags['is_ramadan'].all())
        self.assertFalse(flags['is_major_event'].any())
        self.assertTrue(event_flags(pd.DatetimeIndex([])).empty)
