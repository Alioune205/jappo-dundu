"""
Service de prédiction des pénuries de sang.

Utilise le modèle actif du registre pour prévoir, pour chaque centre et
groupe sanguin, le stock des ``days_ahead`` prochains jours, avec un
intervalle P10-P90, les jours de stock et un niveau de risque.

Auteur : El Hadji Massogui Diop
"""

import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta

import pandas as pd
from django.db import transaction
from django.utils import timezone

from . import registry, risk
from .forecasting import (
    HISTORY_WINDOW_DAYS,
    RAW_COLUMNS,
    add_origin_features,
    build_panel,
    make_prediction_rows,
    predict_units,
)

logger = logging.getLogger('jappo_dundu.ml')

MAX_DAYS_AHEAD = 30


@dataclass
class PredictionRun:
    """Résultat d'une exécution de prédiction."""

    model_version: str
    days_ahead: int
    region: str | None = None
    blood_group: str | None = None
    predictions: list = field(default_factory=list)
    skipped_series: int = 0

    @property
    def count(self):
        return len(self.predictions)

    def risk_summary(self):
        counts = Counter(p['risk_level'] for p in self.predictions)
        return {level: counts.get(level, 0) for level in risk.RISK_LEVELS}


class BloodShortagePredictor:
    """Prévoit les stocks et classe le risque de pénurie."""

    def __init__(self, today=None):
        self.today = today

    def predict(self, region=None, blood_group=None, days_ahead=7):
        """Calcule les prédictions sans les enregistrer.

        Raises:
            ModelNotAvailableError: aucun modèle actif utilisable.
            ValueError: ``days_ahead`` hors de [1, 30].
        """
        if not 1 <= days_ahead <= MAX_DAYS_AHEAD:
            raise ValueError(f"days_ahead doit être compris entre 1 et {MAX_DAYS_AHEAD}.")

        bundle = registry.load_active_bundle()
        today = self.today or timezone.localdate()
        run = PredictionRun(
            model_version=bundle['version'],
            days_ahead=days_ahead,
            region=region,
            blood_group=blood_group,
        )

        history = self._load_history(region, blood_group, today, bundle['max_horizon'])
        if history.empty:
            logger.warning("Aucune donnée récente pour la prédiction.")
            return run

        featured = add_origin_features(build_panel(history))
        rows, run.skipped_series = make_prediction_rows(
            featured, today, days_ahead, bundle['max_horizon']
        )
        if run.skipped_series:
            logger.warning(
                "%d série(s) ignorée(s) : données trop anciennes ou trop courtes.",
                run.skipped_series,
            )
        if rows.empty:
            return run

        critical_days, warning_days = risk.thresholds()
        point, lower, upper = predict_units(
            bundle['models'], rows, bundle['feature_columns']
        )
        demand = rows['daily_demand'].to_numpy()
        levels = risk.classify(point, demand, critical_days, warning_days)
        confidence = risk.confidence(
            point, lower, upper, demand, levels, critical_days, warning_days
        )

        run.predictions = [
            {
                'center_name': center,
                'region': region_code,
                'blood_group': group,
                'prediction_date': target_date.date(),
                'predicted_units': round(float(p), 1),
                'lower_bound': round(float(lo), 1),
                'upper_bound': round(float(hi), 1),
                'days_of_supply': round(float(p / d), 1),
                'risk_level': str(level),
                'confidence_score': round(float(c), 3),
                'model_version': run.model_version,
            }
            for center, region_code, group, target_date, p, lo, hi, d, level, c in zip(
                rows['center_name'], rows['region'], rows['blood_group'],
                rows['target_date'], point, lower, upper, demand, levels, confidence,
                strict=True,
            )
        ]
        logger.info(
            "Prédictions calculées : %d (%s)", run.count, run.risk_summary()
        )
        return run

    def predict_and_save(self, region=None, blood_group=None, days_ahead=7, notify=True):
        """Calcule, remplace les prédictions du même périmètre et notifie.

        Seules les prédictions de la période et du filtre demandés sont
        remplacées (une prédiction limitée à Dakar ne touche pas Thiès).
        La diffusion temps réel a lieu après validation de la transaction.
        """
        from ml.models import PredictionResult

        run = self.predict(region, blood_group, days_ahead)
        today = self.today or timezone.localdate()

        scope = PredictionResult.objects.filter(
            prediction_date__gt=today,
            prediction_date__lte=today + timedelta(days=days_ahead),
        )
        if region:
            scope = scope.filter(region=region)
        if blood_group:
            scope = scope.filter(blood_group=blood_group)

        with transaction.atomic():
            scope.delete()
            PredictionResult.objects.bulk_create(
                [PredictionResult(**p) for p in run.predictions], batch_size=1000
            )
            if notify:
                from .notifications import notify_prediction_run

                transaction.on_commit(lambda: notify_prediction_run(run))

        logger.info("%d prédictions enregistrées.", run.count)
        return run

    @staticmethod
    def _load_history(region, blood_group, today, max_horizon):
        from ml.models import BloodStockRecord

        since = today - timedelta(days=max_horizon + HISTORY_WINDOW_DAYS)
        queryset = BloodStockRecord.objects.filter(date__gte=since, date__lte=today)
        if region:
            queryset = queryset.filter(region=region)
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)
        return pd.DataFrame(list(queryset.values_list(*RAW_COLUMNS)), columns=RAW_COLUMNS)
