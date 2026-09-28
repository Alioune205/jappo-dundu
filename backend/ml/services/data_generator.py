"""
Générateur de données synthétiques de stock sanguin pour le Sénégal.

En l'absence d'historique réel exploitable (voir la commande
``import_stock_data`` pour charger les données du CNTS), le modèle est
entraîné sur une simulation dont les hypothèses sont explicites :

- demande et dons journaliers tirés selon des lois de Poisson ;
- comptabilité cohérente : stock(j) = stock(j-1) + dons - utilisations -
  péremptions, et l'utilisation ne peut dépasser le stock disponible ;
- saisonnalité : hivernage (juillet-octobre) et vacances scolaires
  (mi-juillet à mi-septembre) réduisent les dons ; le paludisme
  (septembre-novembre) augmente les besoins ;
- calendrier religieux calculé (Ramadan, Tabaski, Grand Magal), voir
  ``senegal_calendar`` ;
- campagnes d'appel au don quand le stock passe sous 3 jours de besoins ;
- péremption des poches au-delà d'environ 25 jours de stock ;
- croissance annuelle de la demande.

Les coefficients sont des hypothèses de simulation plausibles, pas des
statistiques officielles : ils doivent être recalibrés sur données réelles.

Auteur : El Hadji Massogui Diop
"""

import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd

from .senegal_calendar import event_flags

logger = logging.getLogger('jappo_dundu.ml')

# (centre, région, taille)
CENTER_CATALOG = (
    ('CNTS Dakar', 'dakar', 'large'),
    ('Hôpital Principal de Dakar', 'dakar', 'large'),
    ('Hôpital Aristide Le Dantec', 'dakar', 'large'),
    ('CTS Thiès', 'thies', 'medium'),
    ('CTS Saint-Louis', 'saint_louis', 'medium'),
    ('CTS Kaolack', 'kaolack', 'medium'),
    ('CTS Ziguinchor', 'ziguinchor', 'medium'),
    ('CTS Tambacounda', 'tambacounda', 'medium'),
    ('CTS Diourbel', 'diourbel', 'medium'),
    ('CTS Louga', 'louga', 'small'),
    ('CTS Fatick', 'fatick', 'small'),
    ('CTS Kolda', 'kolda', 'small'),
    ('CTS Matam', 'matam', 'small'),
    ('CTS Kaffrine', 'kaffrine', 'small'),
    ('CTS Kédougou', 'kedougou', 'small'),
    ('CTS Sédhiou', 'sedhiou', 'small'),
)

# Besoin moyen journalier du centre, tous groupes confondus (poches/jour).
DAILY_DEMAND_BY_SIZE = {'large': 24.0, 'medium': 8.0, 'small': 3.0}

# Répartition des groupes sanguins (approximation pour l'Afrique de
# l'Ouest, somme = 1).
BLOOD_GROUP_SHARES = {
    'O+': 0.46,
    'A+': 0.23,
    'B+': 0.20,
    'AB+': 0.04,
    'O-': 0.03,
    'A-': 0.02,
    'B-': 0.015,
    'AB-': 0.005,
}

INITIAL_DAYS_OF_SUPPLY = 10.0
APPEAL_THRESHOLD_DAYS = 3.0     # stock bas → campagne d'appel au don
APPEAL_DONATION_BOOST = 1.6
SHELF_DAYS_OF_SUPPLY = 25.0     # au-delà, les poches les plus anciennes périment
EXPIRY_RATE = 0.08
ANNUAL_DEMAND_GROWTH = 0.03
SUPPLY_RATIO_RANGE = (1.12, 1.30)

# Lundi → dimanche
DONATION_WEEKDAY_FACTORS = np.array([1.15, 1.15, 1.15, 1.15, 1.15, 0.80, 0.45])
DEMAND_WEEKDAY_FACTORS = np.array([0.97, 0.97, 0.97, 0.97, 0.97, 1.05, 1.10])

OUTPUT_COLUMNS = [
    'center_name', 'region', 'blood_group', 'date', 'units_available',
    'units_donated', 'units_used', 'units_expired',
]


def calendar_factors(dates):
    """Facteurs multiplicatifs journaliers (dons, demande) du calendrier."""
    dates = pd.DatetimeIndex(dates)
    month = dates.month.to_numpy()
    day = dates.day.to_numpy()
    flags = event_flags(dates)

    donation = DONATION_WEEKDAY_FACTORS[dates.dayofweek.to_numpy()].copy()
    demand = DEMAND_WEEKDAY_FACTORS[dates.dayofweek.to_numpy()].copy()

    rainy_season = (month >= 7) & (month <= 10)
    school_holidays = (
        ((month == 7) & (day >= 15)) | (month == 8) | ((month == 9) & (day <= 15))
    )
    malaria_season = (month >= 9) & (month <= 11)
    ramadan = flags['is_ramadan'].to_numpy()
    major_event = flags['is_major_event'].to_numpy()

    donation[rainy_season] *= 0.85
    donation[school_holidays] *= 0.80
    donation[ramadan] *= 0.65
    donation[major_event] *= 0.70
    demand[malaria_season] *= 1.15
    demand[major_event] *= 1.30
    return donation, demand


class BloodDataGenerator:
    """Simule l'historique quotidien de stock de chaque centre/groupe."""

    def __init__(self, seed=42, centers=CENTER_CATALOG):
        self.seed = seed
        self.centers = tuple(centers)

    def generate(self, start_date=None, end_date=None, days=730):
        """Génère l'historique entre ``start_date`` et ``end_date`` inclus.

        Args:
            start_date: début (défaut : ``end_date - days``).
            end_date: fin (défaut : aujourd'hui).
            days: profondeur d'historique si ``start_date`` est absent.

        Returns:
            pd.DataFrame aux colonnes ``OUTPUT_COLUMNS``.
        """
        rng = np.random.default_rng(self.seed)
        end_date = end_date or date.today()
        start_date = start_date or end_date - timedelta(days=days)
        if start_date > end_date:
            raise ValueError("start_date doit précéder end_date.")

        dates = pd.date_range(start_date, end_date, freq='D')
        series = [
            (center, region, group, size)
            for center, region, size in self.centers
            for group in BLOOD_GROUP_SHARES
        ]
        base_demand = np.array([
            DAILY_DEMAND_BY_SIZE[size] * BLOOD_GROUP_SHARES[group]
            for _, _, group, size in series
        ])
        supply_ratio = rng.uniform(*SUPPLY_RATIO_RANGE, size=len(series))
        donation_factor, demand_factor = calendar_factors(dates)
        years_elapsed = np.arange(len(dates)) / 365.25

        shape = (len(dates), len(series))
        stock_hist = np.empty(shape, dtype=np.int64)
        donated_hist = np.empty(shape, dtype=np.int64)
        used_hist = np.empty(shape, dtype=np.int64)
        expired_hist = np.empty(shape, dtype=np.int64)

        stock = rng.poisson(base_demand * INITIAL_DAYS_OF_SUPPLY)
        shelf_capacity = SHELF_DAYS_OF_SUPPLY * base_demand
        appeal_threshold = APPEAL_THRESHOLD_DAYS * base_demand

        for t in range(len(dates)):
            demand_rate = (
                base_demand
                * demand_factor[t]
                * (1 + ANNUAL_DEMAND_GROWTH * years_elapsed[t])
            )
            appeal = np.where(stock < appeal_threshold, APPEAL_DONATION_BOOST, 1.0)
            donation_rate = base_demand * supply_ratio * donation_factor[t] * appeal

            donated = rng.poisson(donation_rate)
            demand = rng.poisson(demand_rate)
            available = stock + donated
            used = np.minimum(demand, available)
            remaining = available - used
            excess = np.maximum(0, remaining - shelf_capacity).astype(np.int64)
            expired = rng.binomial(excess, EXPIRY_RATE)
            stock = remaining - expired

            stock_hist[t] = stock
            donated_hist[t] = donated
            used_hist[t] = used
            expired_hist[t] = expired

        n_dates, n_series = shape
        df = pd.DataFrame({
            'center_name': np.tile([s[0] for s in series], n_dates),
            'region': np.tile([s[1] for s in series], n_dates),
            'blood_group': np.tile([s[2] for s in series], n_dates),
            'date': np.repeat(dates.date, n_series),
            'units_available': stock_hist.ravel(),
            'units_donated': donated_hist.ravel(),
            'units_used': used_hist.ravel(),
            'units_expired': expired_hist.ravel(),
        })
        logger.info(
            "Données simulées : %d lignes, %d séries, du %s au %s",
            len(df), n_series, start_date, end_date,
        )
        return df[OUTPUT_COLUMNS]

    @staticmethod
    def save_to_db(df, batch_size=5000):
        """Enregistre les lignes simulées (les doublons existants sont ignorés).

        Returns:
            int: nombre de lignes réellement créées.
        """
        from django.db import transaction

        from ml.models import BloodStockRecord

        source = BloodStockRecord.Source.SYNTHETIC
        with transaction.atomic():
            before = BloodStockRecord.objects.count()
            records = (
                BloodStockRecord(
                    center_name=row.center_name,
                    region=row.region,
                    blood_group=row.blood_group,
                    date=row.date,
                    units_available=int(row.units_available),
                    units_donated=int(row.units_donated),
                    units_used=int(row.units_used),
                    units_expired=int(row.units_expired),
                    source=source,
                )
                for row in df.itertuples(index=False)
            )
            BloodStockRecord.objects.bulk_create(
                records, batch_size=batch_size, ignore_conflicts=True
            )
            created = BloodStockRecord.objects.count() - before
        logger.info("%d enregistrements simulés sauvegardés.", created)
        return created
