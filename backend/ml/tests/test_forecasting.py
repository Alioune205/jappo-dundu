"""
Tests du cœur de prévision : absence de fuite de données, construction des
exemples et cohérence entre entraînement et prédiction.

Auteur : El Hadji Massogui Diop
"""

from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd
from django.test import SimpleTestCase

from ml.services.forecasting import (
    FEATURE_COLUMNS,
    MAX_HORIZON,
    EventCalendar,
    add_origin_features,
    add_target_features,
    build_panel,
    calendar_for,
    conformal_adjustment,
    make_prediction_rows,
    make_training_rows,
    predict_units,
)

from .helpers import TEST_SERIES, small_history

END = date(2026, 6, 30)
ORIGIN_COLUMNS = [
    c for c in FEATURE_COLUMNS
    if not c.startswith('target_') and c not in ('horizon', 'ramadan_share', 'event_share')
] + ['scale', 'daily_demand']


class PanelTests(SimpleTestCase):

    def test_missing_days_are_filled_and_flagged(self):
        df = small_history(days=60, end_date=END)
        gap_day = pd.Timestamp(END - timedelta(days=10))
        df = df[pd.to_datetime(df['date']) != gap_day]

        panel = build_panel(df)
        gap = panel[panel['date'] == gap_day]
        self.assertEqual(len(gap), TEST_SERIES)
        self.assertFalse(gap['observed'].any())
        self.assertTrue(gap['units_available'].notna().all())  # stock reporté
        self.assertTrue(gap['units_donated'].isna().all())     # flux inconnus


class NoLeakageTests(SimpleTestCase):
    """Modifier le futur ne doit changer aucune feature du passé."""

    def test_origin_features_ignore_future_data(self):
        df = small_history(days=120, end_date=END)
        cutoff = pd.Timestamp(END - timedelta(days=40))
        reference = add_origin_features(build_panel(df))

        tampered = df.copy()
        future = pd.to_datetime(tampered['date']) > cutoff
        tampered.loc[future, 'units_available'] *= 50
        tampered.loc[future, ['units_donated', 'units_used', 'units_expired']] = 999
        recomputed = add_origin_features(build_panel(tampered))

        past = reference['date'] <= cutoff
        pd.testing.assert_frame_equal(
            reference.loc[past, ORIGIN_COLUMNS], recomputed.loc[past, ORIGIN_COLUMNS]
        )
        # Contrôle : le futur modifié change bien les features futures.
        self.assertFalse(
            reference.loc[~past, 'stock_now'].equals(recomputed.loc[~past, 'stock_now'])
        )


class TrainingRowsTests(SimpleTestCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.featured = add_origin_features(build_panel(small_history(days=120, end_date=END)))
        cls.rows = make_training_rows(cls.featured, np.random.default_rng(0))

    def test_all_horizons_are_represented(self):
        self.assertEqual(set(self.rows['horizon']), set(range(1, MAX_HORIZON + 1)))

    def test_targets_are_the_observed_future_stock(self):
        stock = self.featured.set_index(['center_name', 'blood_group', 'date'])['units_available']
        sample = self.rows.sample(200, random_state=0)
        expected = stock.loc[list(zip(
            sample['center_name'], sample['blood_group'], sample['target_date'], strict=True
        ))].to_numpy()
        np.testing.assert_array_equal(sample['target_units'].to_numpy(), expected)

    def test_targets_never_exceed_available_history(self):
        self.assertLessEqual(self.rows['target_date'].max(), pd.Timestamp(END))

    def test_features_are_complete_where_required(self):
        required = ['stock_now', 'horizon', 'region_code', 'blood_group_code', 'target_dow']
        self.assertFalse(self.rows[required].isna().any().any())


class PredictionRowsTests(SimpleTestCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.featured = add_origin_features(build_panel(small_history(days=90, end_date=END)))

    def test_rows_cover_requested_dates(self):
        rows, skipped = make_prediction_rows(self.featured, END, days_ahead=7)
        self.assertEqual(skipped, 0)
        self.assertEqual(len(rows), TEST_SERIES * 7)
        self.assertEqual(
            sorted(rows['target_date'].unique()),
            [pd.Timestamp(END + timedelta(days=d)) for d in range(1, 8)],
        )
        self.assertTrue((rows['date'] == pd.Timestamp(END)).all())

    def test_stale_series_are_skipped(self):
        rows, skipped = make_prediction_rows(
            self.featured, END + timedelta(days=MAX_HORIZON + 5), days_ahead=7
        )
        self.assertTrue(rows.empty)
        self.assertEqual(skipped, TEST_SERIES)

    def test_train_serve_parity(self):
        """Une ligne de prédiction a les mêmes features qu'un exemple d'entraînement."""
        rows, _ = make_prediction_rows(self.featured, END, days_ahead=5)
        served = rows.iloc[[0]]
        origin = self.featured[
            (self.featured['center_name'] == served['center_name'].iloc[0])
            & (self.featured['blood_group'] == served['blood_group'].iloc[0])
            & (self.featured['date'] == served['date'].iloc[0])
        ].assign(horizon=int(served['horizon'].iloc[0]))
        trained = add_target_features(origin, calendar_for(self.featured, until=END + timedelta(days=5)))
        np.testing.assert_allclose(
            served[FEATURE_COLUMNS].to_numpy(dtype=float),
            trained[FEATURE_COLUMNS].to_numpy(dtype=float),
        )


class EventCalendarTests(SimpleTestCase):

    def test_window_share(self):
        calendar = EventCalendar('2025-02-20', '2025-04-30')
        # ]28 fév, 28 fév + 4j] = 1er → 4 mars : tous en Ramadan 1446
        share = calendar.window_share('is_ramadan', pd.to_datetime(['2025-02-28']), [4])
        self.assertAlmostEqual(share[0], 1.0)
        share = calendar.window_share('is_ramadan', pd.to_datetime(['2025-02-26']), [4])
        self.assertAlmostEqual(share[0], 0.5)

    def test_window_outside_calendar_is_refused(self):
        calendar = EventCalendar('2025-01-01', '2025-01-10')
        with self.assertRaises(ValueError):
            calendar.window_share('is_ramadan', pd.to_datetime(['2025-01-08']), [5])


def constant(value):
    """Modèle factice renvoyant toujours la même valeur."""
    return SimpleNamespace(predict=lambda features: np.full(len(features), value))


class ConformalAdjustmentTests(SimpleTestCase):

    def rows(self, target):
        return pd.DataFrame({
            'target': target,
            **{c: np.zeros(len(target)) for c in FEATURE_COLUMNS},
        })

    def test_interval_is_widened_to_reach_target_coverage(self):
        target = np.random.default_rng(0).uniform(-3, 3, size=4000)
        models = {'lower': constant(-1.0), 'upper': constant(1.0)}
        margin = conformal_adjustment(models, self.rows(target))
        # Couverture visée 80 % sur U(-3, 3) : |y| ≤ 2,4, soit une marge de 1,4
        self.assertAlmostEqual(margin, 1.4, delta=0.05)
        coverage = np.mean(np.abs(target) <= 1 + margin)
        self.assertGreaterEqual(coverage, 0.8)
        self.assertLess(coverage, 0.82)

    def test_too_wide_interval_is_narrowed(self):
        target = np.random.default_rng(1).uniform(-1, 1, size=2000)
        models = {'lower': constant(-5.0), 'upper': constant(5.0)}
        self.assertLess(conformal_adjustment(models, self.rows(target)), 0)

    def test_empty_calibration_period_is_refused(self):
        with self.assertRaises(ValueError):
            conformal_adjustment({}, self.rows(np.array([])))


class PredictUnitsTests(SimpleTestCase):

    def test_bounds_are_ordered_and_non_negative(self):
        rows = pd.DataFrame({
            'units_available': [10.0, 2.0],
            'scale': [5.0, 5.0],
            'horizon': [1, 4],
            **{c: [0.0, 0.0] for c in FEATURE_COLUMNS if c != 'horizon'},
        })
        # Quantiles croisés et prévision négative
        models = {'point': constant(-1.0), 'lower': constant(0.5), 'upper': constant(-2.0)}
        point, lower, upper = predict_units(models, rows)
        self.assertTrue((lower <= point).all() and (point <= upper).all())
        self.assertTrue((point >= 0).all() and (lower >= 0).all())
        np.testing.assert_allclose(point, [10 - 5 ** 0.5, 0.0])  # 10 - √(5×1) ; max(0, 2 - √(5×4))

    def test_conformal_margin_widens_bounds_in_units(self):
        rows = pd.DataFrame({
            'units_available': [20.0],
            'scale': [4.0],
            'horizon': [1],
            **{c: [0.0] for c in FEATURE_COLUMNS if c != 'horizon'},
        })
        models = {'point': constant(0.0), 'lower': constant(-1.0), 'upper': constant(1.0)}
        _, lower, upper = predict_units(models, rows, interval_adjustment=0.5)
        # √(4×1) = 2 poches par unité normalisée : 20 ± (1 + 0,5) × 2
        np.testing.assert_allclose([lower[0], upper[0]], [17.0, 23.0])
