"""
Entraînement du modèle de prévision des pénuries de sang.

Pipeline :
1. chargement de l'historique (BloodStockRecord) ;
2. features sans fuite de données (voir ``forecasting``) ;
3. découpage temporel : la période de test suit strictement la période
   d'entraînement (aucune cible d'entraînement dans la période de test) ;
4. trois modèles HistGradientBoosting : prévision centrale et quantiles
   P10/P90 (intervalle de prédiction à 80 %) ;
5. calibration conformelle de l'intervalle sur une période intermédiaire,
   pour qu'il couvre réellement 80 % des cas ;
6. évaluation sur la période de test, comparée à la baseline naïve
   « le stock reste identique » (persistance) ;
7. ré-entraînement sur tout l'historique, puis sauvegarde et activation.

Chronologie : [ entraînement | calibration | test ], sans chevauchement
(aucune cible d'une période ne tombe dans la suivante).

Auteur : El Hadji Massogui Diop
"""

import logging
from datetime import datetime

import numpy as np
import pandas as pd
import sklearn
from django.db import transaction
from django.utils import timezone
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from . import registry, risk
from .forecasting import (
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    MAX_HORIZON,
    MIN_HISTORY_DAYS,
    RAW_COLUMNS,
    add_origin_features,
    build_panel,
    conformal_adjustment,
    make_training_rows,
    predict_units,
)

logger = logging.getLogger('jappo_dundu.ml')

QUANTILES = {'lower': 0.1, 'upper': 0.9}
HORIZON_BUCKETS = {'1-3': (1, 3), '4-7': (4, 7), '8-14': (8, 14), '15-30': (15, 30)}
MIN_TRAINING_ROWS = 500
CALIBRATION_FRACTION = 0.1


class BloodShortageTrainer:
    """Entraîne, évalue et enregistre le modèle de prévision."""

    ALGORITHM = 'HistGradientBoostingRegressor'

    def __init__(
        self,
        max_iter=300,
        horizons_per_origin=6,
        test_fraction=0.2,
        seed=42,
        max_horizon=MAX_HORIZON,
    ):
        if not 0 < test_fraction < 1:
            raise ValueError("test_fraction doit être compris entre 0 et 1.")
        self.max_iter = max_iter
        self.horizons_per_origin = horizons_per_origin
        self.test_fraction = test_fraction
        self.seed = seed
        self.max_horizon = max_horizon
        self.models = None
        self.interval_adjustment = 0.0
        self.metrics = {}
        self.data_end_date = None

    @staticmethod
    def load_data_from_db(sources=None):
        """Historique complet, éventuellement filtré par source."""
        from ml.models import BloodStockRecord

        queryset = BloodStockRecord.objects.all()
        if sources:
            queryset = queryset.filter(source__in=sources)
        df = pd.DataFrame(list(queryset.values_list(*RAW_COLUMNS)), columns=RAW_COLUMNS)
        if df.empty:
            raise ValueError(
                "Aucune donnée d'entraînement en base. Exécutez "
                "'python manage.py generate_training_data' ou "
                "'python manage.py import_stock_data <fichier.csv>'."
            )
        return df

    def train(self, df=None):
        """Entraîne et évalue le modèle ; retourne les métriques de test."""
        if df is None:
            df = self.load_data_from_db()

        featured = add_origin_features(build_panel(df))
        rows = make_training_rows(
            featured,
            rng=np.random.default_rng(self.seed),
            horizons_per_origin=self.horizons_per_origin,
            max_horizon=self.max_horizon,
        )

        start, end = featured['date'].min(), featured['date'].max()
        span_days = (end - start).days + 1
        test_days = max(self.max_horizon, int(round(span_days * self.test_fraction)))
        calibration_days = max(
            self.max_horizon, int(round(span_days * CALIBRATION_FRACTION))
        )
        required_days = test_days + calibration_days + MIN_HISTORY_DAYS + self.max_horizon
        if span_days < required_days:
            raise ValueError(
                f"Historique insuffisant ({span_days} jours) : au moins "
                f"{required_days} jours requis."
            )
        test_cutoff = end - pd.Timedelta(days=test_days)
        calibration_cutoff = test_cutoff - pd.Timedelta(days=calibration_days)
        fit_rows = rows[rows['target_date'] <= calibration_cutoff]
        calibration_rows = rows[
            (rows['date'] > calibration_cutoff) & (rows['target_date'] <= test_cutoff)
        ]
        test_rows = rows[rows['date'] > test_cutoff]
        if len(fit_rows) < MIN_TRAINING_ROWS or calibration_rows.empty or test_rows.empty:
            raise ValueError("Pas assez d'exemples pour entraîner et évaluer le modèle.")

        logger.info(
            "Entraînement : %d exemples, calibration : %d, test : %d (à partir du %s)",
            len(fit_rows), len(calibration_rows), len(test_rows),
            (test_cutoff + pd.Timedelta(days=1)).date(),
        )
        evaluation_models = self._fit(fit_rows)
        self.interval_adjustment = conformal_adjustment(evaluation_models, calibration_rows)
        self.metrics = self._evaluate(evaluation_models, test_rows, self.interval_adjustment)

        # Modèle final : tout l'historique, pour exploiter les données récentes.
        # La marge conformelle, mesurée avec des modèles entraînés sur moins de
        # données, est conservée : elle est légèrement prudente.
        self.models = self._fit(rows)
        self.data_end_date = end.date()
        self.metrics.update({
            'training_samples': int(len(rows)),
            'calibration_samples': int(len(calibration_rows)),
            'test_samples': int(len(test_rows)),
            'interval_adjustment': _round(self.interval_adjustment),
            'test_period_start': str((test_cutoff + pd.Timedelta(days=1)).date()),
            'data_start': str(start.date()),
            'data_end': str(end.date()),
            'series': int(featured[['center_name', 'blood_group']].drop_duplicates().shape[0]),
            'max_horizon_days': self.max_horizon,
        })
        logger.info(
            "Test : MAE=%.2f (persistance %.2f), couverture P10-P90=%.0f %%, "
            "rappel des pénuries=%.0f %%",
            self.metrics['mae'], self.metrics['baseline_mae'],
            100 * self.metrics['interval_coverage'],
            100 * (self.metrics['critical_recall'] or 0),
        )
        return self.metrics

    def _regressor(self, **loss):
        return HistGradientBoostingRegressor(
            learning_rate=0.05,
            max_iter=self.max_iter,
            max_leaf_nodes=31,
            min_samples_leaf=40,
            l2_regularization=1.0,
            categorical_features=[FEATURE_COLUMNS.index(c) for c in CATEGORICAL_COLUMNS],
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20,
            random_state=self.seed,
            **loss,
        )

    def _fit(self, rows):
        """Ajuste la prévision centrale et les deux quantiles."""
        features, target = rows[FEATURE_COLUMNS], rows['target']
        models = {'point': self._regressor(loss='squared_error')}
        for name, quantile in QUANTILES.items():
            models[name] = self._regressor(loss='quantile', quantile=quantile)
        for model in models.values():
            model.fit(features, target)
        return models

    def _evaluate(self, models, test_rows, interval_adjustment):
        critical_days, warning_days = risk.thresholds()
        actual = test_rows['target_units'].to_numpy()
        persistence = test_rows['units_available'].to_numpy()
        demand = test_rows['daily_demand'].to_numpy()
        horizon = test_rows['horizon'].to_numpy()
        point, lower, upper = predict_units(
            models, test_rows, interval_adjustment=interval_adjustment
        )
        _, raw_lower, raw_upper = predict_units(models, test_rows)

        mae = mean_absolute_error(actual, point)
        baseline_mae = mean_absolute_error(actual, persistence)
        actual_risk = risk.classify(actual, demand, critical_days, warning_days)
        predicted_risk = risk.classify(point, demand, critical_days, warning_days)
        baseline_risk = risk.classify(persistence, demand, critical_days, warning_days)
        actual_critical = actual_risk == risk.CRITICAL
        predicted_critical = predicted_risk == risk.CRITICAL

        by_horizon = {}
        for label, (low, high) in HORIZON_BUCKETS.items():
            mask = (horizon >= low) & (horizon <= high)
            if mask.any():
                by_horizon[label] = {
                    'mae': _round(mean_absolute_error(actual[mask], point[mask])),
                    'baseline_mae': _round(
                        mean_absolute_error(actual[mask], persistence[mask])
                    ),
                    'risk_accuracy': _round(
                        np.mean(actual_risk[mask] == predicted_risk[mask])
                    ),
                    'baseline_risk_accuracy': _round(
                        np.mean(actual_risk[mask] == baseline_risk[mask])
                    ),
                }

        return {
            'mae': _round(mae),
            'rmse': _round(np.sqrt(mean_squared_error(actual, point))),
            'r2_score': _round(r2_score(actual, point)),
            'baseline_mae': _round(baseline_mae),
            'skill_vs_baseline': _round(1 - mae / baseline_mae) if baseline_mae else None,
            'interval_coverage': _round(np.mean((actual >= lower) & (actual <= upper))),
            'interval_coverage_uncalibrated': _round(
                np.mean((actual >= raw_lower) & (actual <= raw_upper))
            ),
            'risk_accuracy': _round(np.mean(actual_risk == predicted_risk)),
            'baseline_risk_accuracy': _round(np.mean(actual_risk == baseline_risk)),
            'critical_recall': _share(predicted_risk[actual_critical] != risk.NORMAL),
            'baseline_critical_recall': _share(
                baseline_risk[actual_critical] != risk.NORMAL
            ),
            'critical_precision': _share(actual_risk[predicted_critical] != risk.NORMAL),
            'thresholds_days': {'critical': critical_days, 'warning': warning_days},
            'by_horizon': by_horizon,
        }

    def save_model(self, version=None):
        """Sauvegarde le modèle, l'enregistre et l'active.

        Returns:
            MLModelMetadata: l'entrée de registre créée.
        """
        from ml.models import MLModelMetadata

        if self.models is None:
            raise ValueError("Aucun modèle entraîné à sauvegarder.")

        version = registry.validate_version(
            version or timezone.now().strftime('%Y%m%d_%H%M%S')
        )
        if MLModelMetadata.objects.filter(version=version).exists():
            raise ValueError(f"La version {version} existe déjà.")

        bundle = {
            'format_version': registry.MODEL_FORMAT_VERSION,
            'version': version,
            'trained_at': datetime.now().astimezone().isoformat(),
            'sklearn_version': sklearn.__version__,
            'algorithm': self.ALGORITHM,
            'models': self.models,
            'feature_columns': FEATURE_COLUMNS,
            'max_horizon': self.max_horizon,
            'quantiles': QUANTILES,
            'interval_adjustment': self.interval_adjustment,
            'data_end_date': str(self.data_end_date),
            'metrics': self.metrics,
        }
        filename = registry.save_bundle(bundle, version)

        with transaction.atomic():
            metadata = MLModelMetadata.objects.create(
                version=version,
                algorithm=self.ALGORITHM,
                training_samples=self.metrics.get('training_samples', 0),
                mae=self.metrics.get('mae', 0.0),
                rmse=self.metrics.get('rmse', 0.0),
                r2_score=self.metrics.get('r2_score', 0.0),
                metrics=self.metrics,
                model_file_path=filename,
                is_active=True,
                notes=(
                    f"Baseline persistance MAE={self.metrics.get('baseline_mae')} ; "
                    f"couverture P10-P90={self.metrics.get('interval_coverage')}"
                ),
            )
        registry.clear_cache()
        return metadata


def _round(value, digits=4):
    return round(float(value), digits)


def _share(flags):
    """Proportion de vrais (None si l'ensemble est vide)."""
    return _round(np.mean(flags)) if len(flags) else None
