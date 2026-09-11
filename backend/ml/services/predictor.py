"""
Service de prédiction des pénuries de sang.

Charge le modèle entraîné et génère des prédictions sur les
stocks futurs de sang par centre et groupe sanguin.

Auteur : El Hadji Massogui Diop
"""

import logging
import os
from datetime import date, timedelta

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger('jappo_dundu.ml')


class BloodShortagePredictor:
    """Service de prédiction des pénuries de sang.

    Charge un modèle RandomForest pré-entraîné et prédit les
    stocks de sang pour les jours à venir.
    """

    # Seuils de risque (en nombre d'unités)
    CRITICAL_THRESHOLD = 5    # Moins de 5 unités = CRITICAL
    WARNING_THRESHOLD = 15    # Moins de 15 unités = WARNING

    def __init__(self, model_path=None):
        """Initialise le prédicteur.

        Args:
            model_path: Chemin vers le fichier modèle .pkl.
                        Si None, charge le modèle actif depuis la DB.
        """
        self.model = None
        self.label_encoders = {}
        self.feature_columns = []
        self.version = 'unknown'
        self.model_path = model_path

    def load_model(self):
        """Charge le modèle depuis le disque.

        Si aucun chemin n'est spécifié, recherche le modèle actif
        dans la base de données.
        """
        if self.model_path is None:
            self.model_path = self._find_active_model_path()

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Fichier modèle introuvable : {self.model_path}. "
                "Exécutez 'python manage.py train_model' d'abord."
            )

        model_bundle = joblib.load(self.model_path)

        self.model = model_bundle['model']
        self.label_encoders = model_bundle['label_encoders']
        self.feature_columns = model_bundle['feature_columns']
        self.version = model_bundle.get('version', 'unknown')

        logger.info(
            "Modèle chargé — version=%s, features=%d",
            self.version, len(self.feature_columns),
        )

    def predict(self, region=None, blood_group=None, days_ahead=7):
        """Génère les prédictions de stock sanguin.

        Args:
            region: Filtrer par région (optionnel).
            blood_group: Filtrer par groupe sanguin (optionnel).
            days_ahead: Nombre de jours à prédire (1-30).

        Returns:
            list[dict]: Liste des prédictions avec :
                - center_name, region, blood_group
                - prediction_date, predicted_units
                - risk_level, confidence_score
        """
        if self.model is None:
            self.load_model()

        # Charger les dernières données connues depuis la DB
        recent_data = self._get_recent_data(region, blood_group)

        if recent_data.empty:
            logger.warning("Aucune donnée récente trouvée pour la prédiction.")
            return []

        predictions = []

        # Grouper par centre et groupe sanguin
        groups = recent_data.groupby(['center_name', 'region', 'blood_group'])

        for (center, reg, bg), group_df in groups:
            group_df = group_df.sort_values('date').reset_index(drop=True)

            for day_offset in range(1, days_ahead + 1):
                prediction_date = date.today() + timedelta(days=day_offset)

                # Construire les features pour cette prédiction
                features = self._build_prediction_features(
                    group_df, prediction_date, reg, bg
                )

                if features is not None:
                    predicted_units = max(
                        0, float(self.model.predict([features])[0])
                    )

                    risk_level = self._classify_risk(predicted_units)
                    confidence = self._compute_confidence(
                        group_df, predicted_units, day_offset
                    )

                    predictions.append({
                        'center_name': center,
                        'region': reg,
                        'blood_group': bg,
                        'prediction_date': prediction_date,
                        'predicted_units': round(predicted_units, 1),
                        'risk_level': risk_level,
                        'confidence_score': round(confidence, 3),
                        'model_version': self.version,
                    })

        logger.info(
            "Prédictions générées : %d résultats pour %d jours",
            len(predictions), days_ahead,
        )
        return predictions

    def predict_and_save(self, region=None, blood_group=None, days_ahead=7):
        """Génère les prédictions et les sauvegarde en base.

        Args:
            region: Filtrer par région (optionnel).
            blood_group: Filtrer par groupe sanguin (optionnel).
            days_ahead: Nombre de jours à prédire.

        Returns:
            int: Nombre de prédictions sauvegardées.
        """
        from ml.models import PredictionResult

        predictions = self.predict(region, blood_group, days_ahead)

        if not predictions:
            return 0

        # Supprimer les anciennes prédictions pour les mêmes critères
        PredictionResult.objects.filter(
            model_version=self.version,
        ).delete()

        records = [
            PredictionResult(
                center_name=p['center_name'],
                region=p['region'],
                blood_group=p['blood_group'],
                prediction_date=p['prediction_date'],
                predicted_units=p['predicted_units'],
                risk_level=p['risk_level'],
                confidence_score=p['confidence_score'],
                model_version=p['model_version'],
            )
            for p in predictions
        ]

        PredictionResult.objects.bulk_create(records, batch_size=2000)

        logger.info(
            "%d prédictions sauvegardées en base.", len(records)
        )
        return len(records)

    def _get_recent_data(self, region=None, blood_group=None, lookback_days=60):
        """Charge les données récentes depuis la base.

        Args:
            region: Filtrer par région.
            blood_group: Filtrer par groupe sanguin.
            lookback_days: Nombre de jours d'historique à charger.

        Returns:
            pd.DataFrame des données récentes.
        """
        from ml.models import BloodStockRecord

        cutoff_date = date.today() - timedelta(days=lookback_days)
        queryset = BloodStockRecord.objects.filter(date__gte=cutoff_date)

        if region:
            queryset = queryset.filter(region=region)
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)

        df = pd.DataFrame(
            list(queryset.values(
                'center_name', 'region', 'blood_group', 'date',
                'units_available', 'units_donated', 'units_used',
                'units_expired',
            ))
        )

        if not df.empty:
            df['date'] = pd.to_datetime(df['date'])

        return df

    def _build_prediction_features(self, group_df, pred_date, region, blood_group):
        """Construit le vecteur de features pour une prédiction.

        Utilise les données historiques du groupe pour calculer
        les features nécessaires au modèle.
        """
        try:
            # Encodage catégoriel
            region_enc = self.label_encoders['region'].transform([region])[0]
            bg_enc = self.label_encoders['blood_group'].transform(
                [blood_group]
            )[0]
        except (KeyError, ValueError):
            logger.warning(
                "Encodage échoué pour region=%s, blood_group=%s",
                region, blood_group,
            )
            return None

        # Prédiction date features
        pred_dt = pd.Timestamp(pred_date)
        day_of_week = pred_dt.dayofweek
        day_of_month = pred_dt.day
        month = pred_dt.month
        day_of_year = pred_dt.dayofyear
        is_weekend = 1 if day_of_week >= 5 else 0

        # Séries récentes pour les lags et rolling
        stock_series = group_df['units_available'].values
        donated_series = group_df['units_donated'].values
        used_series = group_df['units_used'].values

        def safe_get(series, idx, default=0):
            """Accède à un index négatif de manière sécurisée."""
            if abs(idx) <= len(series):
                return float(series[idx])
            return default

        def safe_mean(series, window, default=0):
            """Calcule la moyenne sur les N dernières valeurs."""
            if len(series) >= window:
                return float(np.mean(series[-window:]))
            elif len(series) > 0:
                return float(np.mean(series))
            return default

        def safe_std(series, window, default=0):
            """Calcule l'écart-type sur les N dernières valeurs."""
            if len(series) >= window:
                return float(np.std(series[-window:]))
            elif len(series) > 1:
                return float(np.std(series))
            return default

        # Net flow
        net_flow_last = safe_get(donated_series, -1) - safe_get(used_series, -1)
        net_flow_series = donated_series - used_series
        net_flow_mean_7 = safe_mean(net_flow_series, 7)

        features = [
            region_enc,
            bg_enc,
            day_of_week,
            day_of_month,
            month,
            day_of_year,
            is_weekend,
            safe_get(donated_series, -1),     # units_donated_lag1
            safe_get(donated_series, -7),     # units_donated_lag7
            safe_get(used_series, -1),        # units_used_lag1
            safe_get(used_series, -7),        # units_used_lag7
            safe_get(stock_series, -1),       # stock_lag1
            safe_get(stock_series, -7),       # stock_lag7
            safe_get(stock_series, -14),      # stock_lag14
            safe_mean(stock_series, 7),       # stock_rolling_mean_7
            safe_mean(stock_series, 14),      # stock_rolling_mean_14
            safe_mean(stock_series, 30),      # stock_rolling_mean_30
            safe_std(stock_series, 7),        # stock_rolling_std_7
            safe_mean(donated_series, 7),     # donation_rolling_mean_7
            safe_mean(used_series, 7),        # usage_rolling_mean_7
            net_flow_last,                    # net_flow_lag1
            net_flow_mean_7,                  # net_flow_rolling_mean_7
        ]

        return features

    def _classify_risk(self, predicted_units):
        """Classifie le niveau de risque basé sur le stock prédit.

        Returns:
            str: 'CRITICAL', 'WARNING' ou 'NORMAL'
        """
        if predicted_units <= self.CRITICAL_THRESHOLD:
            return 'CRITICAL'
        elif predicted_units <= self.WARNING_THRESHOLD:
            return 'WARNING'
        return 'NORMAL'

    def _compute_confidence(self, group_df, predicted_units, day_offset):
        """Calcule un score de confiance pour la prédiction.

        La confiance diminue avec :
        - L'éloignement dans le futur (day_offset)
        - La volatilité des données récentes

        Returns:
            float: Score de confiance entre 0 et 1.
        """
        # Base de confiance : diminue avec le nombre de jours
        base_confidence = max(0.3, 1.0 - (day_offset * 0.05))

        # Pénalité pour volatilité
        if len(group_df) >= 7:
            recent_stock = group_df['units_available'].tail(7).values
            cv = np.std(recent_stock) / max(1, np.mean(recent_stock))
            volatility_penalty = min(0.3, cv * 0.5)
        else:
            volatility_penalty = 0.1

        confidence = max(0.1, base_confidence - volatility_penalty)
        return min(1.0, confidence)

    @staticmethod
    def _find_active_model_path():
        """Trouve le chemin du modèle actif depuis la base Django."""
        from ml.models import MLModelMetadata

        active_model = MLModelMetadata.objects.filter(
            is_active=True
        ).first()

        if active_model is None:
            raise FileNotFoundError(
                "Aucun modèle actif trouvé en base. "
                "Exécutez 'python manage.py train_model' d'abord."
            )

        return active_model.model_file_path
