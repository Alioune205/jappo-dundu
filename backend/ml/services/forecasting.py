"""
Cœur du modèle de prévision : features partagées entraînement / prédiction.

Formulation (prévision directe multi-horizon) :
    à une date d'origine t, avec uniquement l'information connue à t,
    prédire le stock à la date t + h, pour h = 1 … MAX_HORIZON jours.

Garanties :
- aucune fuite de données : chaque feature d'origine n'utilise que des
  observations ≤ t (testé dans ml/tests/test_forecasting.py) ;
- le même code construit les features à l'entraînement et en production ;
- la cible est la variation du stock entre t et t + h, divisée par
  √(échelle × h) (échelle = stock moyen sur 30 jours) :
  * la persistance (« le stock ne change pas ») est le point de départ
    naturel du modèle ;
  * les dons et utilisations quotidiens se comportent comme des comptages
    (bruit de type Poisson) : la variance de leur cumul croît comme
    échelle × h. Cette normalisation la stabilise, si bien qu'un seul
    modèle traite à égalité un grand centre (O+ à Dakar) et une petite
    banque de sang (AB- à Kédougou), les prochains jours comme les
    horizons lointains.

Auteur : El Hadji Massogui Diop
"""

import numpy as np
import pandas as pd

from ml.constants import BLOOD_GROUP_CODES, REGION_CODES

from .senegal_calendar import event_flags

SERIES_KEYS = ['center_name', 'blood_group']
RAW_COLUMNS = [
    'center_name', 'region', 'blood_group', 'date', 'units_available',
    'units_donated', 'units_used', 'units_expired',
]

MAX_HORIZON = 30
MIN_HISTORY_DAYS = 14
# Historique nécessaire pour calculer les features d'une date d'origine.
HISTORY_WINDOW_DAYS = 45
# Plancher de consommation (poches/jour) pour le calcul des jours de stock.
MIN_DAILY_DEMAND = 0.5
MAX_DAYS_OF_SUPPLY_FEATURE = 60.0

REGION_INDEX = {code: i for i, code in enumerate(REGION_CODES)}
BLOOD_GROUP_INDEX = {code: i for i, code in enumerate(BLOOD_GROUP_CODES)}

CATEGORICAL_COLUMNS = ['region_code', 'blood_group_code']
FEATURE_COLUMNS = [
    *CATEGORICAL_COLUMNS,
    'horizon',
    'log_scale',
    'stock_now',
    'stock_lag7',
    'stock_lag14',
    'stock_mean7',
    'stock_std7',
    'stock_change7',
    'donated_mean7',
    'donated_mean30',
    'used_mean7',
    'used_mean30',
    'expired_mean30',
    'days_of_supply_now',
    'origin_dow',
    'target_dow',
    'target_is_weekend',
    'target_month',
    'target_doy_sin',
    'target_doy_cos',
    'ramadan_share',
    'event_share',
]


def build_panel(records):
    """Aligne chaque série (centre, groupe) sur une grille journalière.

    Les jours manquants sont ajoutés : le stock est reporté (ffill), les
    flux restent inconnus (NaN) et ``observed`` vaut False.
    """
    df = records[RAW_COLUMNS].copy()
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values([*SERIES_KEYS, 'date'])

    frames = []
    for (center, group), series in df.groupby(SERIES_KEYS, sort=False):
        series = series.drop_duplicates('date', keep='last').set_index('date')
        full = series.reindex(
            pd.date_range(series.index.min(), series.index.max(), freq='D'),
        )
        full.index.name = 'date'
        full['observed'] = full['units_available'].notna()
        full['center_name'] = center
        full['blood_group'] = group
        full['region'] = full['region'].ffill().bfill()
        full['units_available'] = full['units_available'].ffill()
        frames.append(full.reset_index())

    if not frames:
        return pd.DataFrame(columns=[*RAW_COLUMNS, 'observed'])
    panel = pd.concat(frames, ignore_index=True)
    for column in RAW_COLUMNS[4:]:
        panel[column] = panel[column].astype(float)
    return panel


def add_origin_features(panel):
    """Ajoute les features connues à chaque date d'origine (≤ t)."""
    grouped = panel.groupby(SERIES_KEYS, sort=False)

    def rolling(column, window, stat='mean', min_periods=1):
        return grouped[column].transform(
            lambda s: getattr(s.rolling(window, min_periods=min_periods), stat)()
        )

    stock = panel['units_available']
    scale = rolling('units_available', 30, min_periods=7).clip(lower=1.0)
    used_mean30 = rolling('units_used', 30, min_periods=7)
    daily_demand = used_mean30.clip(lower=MIN_DAILY_DEMAND).fillna(MIN_DAILY_DEMAND)

    features = pd.DataFrame({
        'scale': scale,
        'daily_demand': daily_demand,
        'history_days': grouped.cumcount() + 1,
        'region_code': panel['region'].map(REGION_INDEX),
        'blood_group_code': panel['blood_group'].map(BLOOD_GROUP_INDEX),
        'log_scale': np.log1p(scale),
        'stock_now': stock / scale,
        'stock_lag7': grouped['units_available'].shift(7) / scale,
        'stock_lag14': grouped['units_available'].shift(14) / scale,
        'stock_mean7': rolling('units_available', 7) / scale,
        'stock_std7': rolling('units_available', 7, 'std', min_periods=2) / scale,
        'donated_mean7': rolling('units_donated', 7) / scale,
        'donated_mean30': rolling('units_donated', 30) / scale,
        'used_mean7': rolling('units_used', 7) / scale,
        'used_mean30': used_mean30 / scale,
        'expired_mean30': rolling('units_expired', 30) / scale,
        'days_of_supply_now': (stock / daily_demand).clip(
            upper=MAX_DAYS_OF_SUPPLY_FEATURE
        ),
        'origin_dow': panel['date'].dt.dayofweek,
    }, index=panel.index)
    features['stock_change7'] = features['stock_now'] - features['stock_lag7']
    return pd.concat([panel, features], axis=1)


class EventCalendar:
    """Part des jours de Ramadan / grands événements dans une fenêtre."""

    def __init__(self, start, end):
        self.start = pd.Timestamp(start).normalize()
        dates = pd.date_range(self.start, pd.Timestamp(end).normalize(), freq='D')
        flags = event_flags(dates)
        self._cumulative = {
            name: np.concatenate(([0], np.cumsum(flags[name].to_numpy())))
            for name in ('is_ramadan', 'is_major_event')
        }
        self._size = len(dates)

    def window_share(self, name, origins, horizons):
        """Part des jours dans ]origine, origine + horizon] marqués ``name``."""
        start_idx = (pd.DatetimeIndex(origins) - self.start).days.to_numpy()
        horizons = np.asarray(horizons)
        end_idx = start_idx + horizons
        if start_idx.min(initial=0) < 0 or end_idx.max(initial=0) >= self._size:
            raise ValueError("Fenêtre hors de la période du calendrier.")
        cumulative = self._cumulative[name]
        return (cumulative[end_idx + 1] - cumulative[start_idx + 1]) / horizons


def add_target_features(rows, calendar):
    """Ajoute l'horizon et les features calendaires de la date cible."""
    rows = rows.copy()
    rows['target_date'] = rows['date'] + pd.to_timedelta(rows['horizon'], unit='D')
    target = rows['target_date'].dt
    day_angle = 2 * np.pi * target.dayofyear / 365.25
    rows['target_dow'] = target.dayofweek
    rows['target_is_weekend'] = (target.dayofweek >= 5).astype(int)
    rows['target_month'] = target.month
    rows['target_doy_sin'] = np.sin(day_angle)
    rows['target_doy_cos'] = np.cos(day_angle)
    rows['ramadan_share'] = calendar.window_share(
        'is_ramadan', rows['date'], rows['horizon']
    )
    rows['event_share'] = calendar.window_share(
        'is_major_event', rows['date'], rows['horizon']
    )
    return rows


def calendar_for(featured, max_horizon=MAX_HORIZON, until=None):
    """Calendrier couvrant les origines et leurs horizons."""
    end = featured['date'].max() + pd.Timedelta(days=max_horizon + 1)
    if until is not None:
        end = max(end, pd.Timestamp(until) + pd.Timedelta(days=1))
    return EventCalendar(featured['date'].min(), end)


def valid_origins(featured):
    """Masque des dates d'origine exploitables (observées, historique suffisant)."""
    return featured['observed'] & (featured['history_days'] >= MIN_HISTORY_DAYS)


def make_training_rows(featured, rng, horizons_per_origin=6, max_horizon=MAX_HORIZON):
    """Construit les exemples (origine, horizon) → stock observé à la cible.

    Pour limiter le volume, chaque horizon ne retient qu'une fraction
    aléatoire (reproductible) des origines : en moyenne
    ``horizons_per_origin`` horizons par date d'origine.
    """
    grouped = featured.groupby(SERIES_KEYS, sort=False)
    stock_by_series = grouped['units_available']
    observed_by_series = featured['observed'].astype(float).groupby(
        [featured[key] for key in SERIES_KEYS], sort=False
    )
    origin_ok = valid_origins(featured)
    fraction = min(1.0, horizons_per_origin / max_horizon)

    frames = []
    for horizon in range(1, max_horizon + 1):
        target_units = stock_by_series.shift(-horizon)
        target_observed = observed_by_series.shift(-horizon) == 1.0
        index = featured.index[origin_ok & target_observed]
        if fraction < 1.0 and len(index):
            size = max(1, int(round(len(index) * fraction)))
            index = np.sort(rng.choice(index, size=size, replace=False))
        rows = featured.loc[index].copy()
        rows['horizon'] = horizon
        rows['target_units'] = target_units.loc[index]
        frames.append(rows)

    rows = pd.concat(frames, ignore_index=True)
    rows = add_target_features(rows, calendar_for(featured, max_horizon))
    rows['target'] = (rows['target_units'] - rows['units_available']) / target_scale(rows)
    return rows


def target_scale(rows):
    """Facteur de normalisation de la cible : √(échelle de la série × h)."""
    return np.sqrt(
        rows['scale'].to_numpy(dtype=float) * rows['horizon'].to_numpy(dtype=float)
    )


def make_prediction_rows(featured, today, days_ahead, max_horizon=MAX_HORIZON):
    """Construit les lignes à prédire pour les dates today+1 … today+days_ahead.

    L'origine de chaque série est sa dernière date observée. Une série dont
    les données sont trop anciennes (horizon > ``max_horizon``) ou trop
    courtes est ignorée.

    Returns:
        (rows, skipped_series)
    """
    today = pd.Timestamp(today).normalize()
    latest = featured[featured['observed']].groupby(SERIES_KEYS, sort=False).tail(1)
    total_series = len(latest)
    latest = latest[latest['history_days'] >= MIN_HISTORY_DAYS]

    targets = pd.DataFrame({
        'target_date': [today + pd.Timedelta(days=d) for d in range(1, days_ahead + 1)],
    })
    rows = latest.merge(targets, how='cross')
    rows['horizon'] = (rows['target_date'] - rows['date']).dt.days
    rows = rows[(rows['horizon'] >= 1) & (rows['horizon'] <= max_horizon)]
    rows = rows.drop(columns='target_date').reset_index(drop=True)

    kept_series = rows[SERIES_KEYS].drop_duplicates().shape[0] if len(rows) else 0
    if rows.empty:
        return rows, total_series

    calendar = calendar_for(featured, max_horizon, until=today + pd.Timedelta(days=days_ahead))
    rows = add_target_features(rows, calendar)
    return rows, total_series - kept_series


INTERVAL_COVERAGE = 0.8


def conformal_adjustment(models, rows, coverage=INTERVAL_COVERAGE):
    """Marge à ajouter aux quantiles pour garantir la couverture visée.

    Régression quantile conformalisée (CQR, Romano et al., 2019) : sur une
    période de calibration jamais vue à l'entraînement, on mesure de combien
    les bornes P10/P90 doivent être élargies (ou resserrées si la marge est
    négative) pour que ``coverage`` des valeurs réelles tombent dedans. La
    marge est exprimée dans l'espace normalisé de la cible, donc valable
    pour toutes les séries et tous les horizons.
    """
    if rows.empty:
        raise ValueError("Période de calibration vide.")
    features = rows[FEATURE_COLUMNS]
    target = rows['target'].to_numpy(dtype=float)
    scores = np.maximum(
        models['lower'].predict(features) - target,
        target - models['upper'].predict(features),
    )
    level = min(1.0, np.ceil((len(scores) + 1) * coverage) / len(scores))
    return float(np.quantile(scores, level, method='higher'))


def predict_units(models, rows, feature_columns=FEATURE_COLUMNS, interval_adjustment=0.0):
    """Prédictions en poches : (point, borne basse P10, borne haute P90).

    Les modèles prédisent la variation normalisée du stock (voir
    ``target_scale``) ; elle est reconvertie en stock à partir du stock à
    la date d'origine. ``interval_adjustment`` est la marge conformelle
    (voir ``conformal_adjustment``). Les bornes sont réordonnées pour
    garantir basse ≤ point ≤ haute (les modèles quantiles, entraînés
    séparément, peuvent se croiser).
    """
    features = rows[feature_columns]
    scale = target_scale(rows)
    current = rows['units_available'].to_numpy(dtype=float)

    point = np.clip(current + models['point'].predict(features) * scale, 0, None)
    lower = current + (models['lower'].predict(features) - interval_adjustment) * scale
    upper = current + (models['upper'].predict(features) + interval_adjustment) * scale
    lower = np.clip(np.minimum(lower, point), 0, None)
    upper = np.maximum(upper, point)
    return point, lower, upper
