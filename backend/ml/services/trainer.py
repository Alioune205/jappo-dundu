"""
Service d'entraînement du modèle ML de prédiction des pénuries de sang.

Pipeline complet :
1. Extraction des données depuis la base Django
2. Feature engineering (temporelles, moyennes mobiles, lags)
3. Entraînement RandomForestRegressor
4. Validation croisée temporelle (TimeSeriesSplit)
5. Évaluation (MAE, RMSE, R²)
6. Sauvegarde du modèle et des métadonnées

Auteur : El Hadji Massogui Diop
"""

import logging
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger('jappo_dundu.ml')


class BloodShortageTrainer:
    """Pipeline d'entraînement pour la prédiction des pénuries de sang.

    Entraîne un modèle RandomForest sur les données historiques
    de stock sanguin pour prédire les stocks futurs.
    """

    # Features utilisées par le modèle
    FEATURE_COLUMNS = [
        'region_encoded',
        'blood_group_encoded',
        'day_of_week',
        'day_of_month',
        'month',
        'day_of_year',
        'is_weekend',
        'units_donated_lag1',
        'units_donated_lag7',
        'units_used_lag1',
        'units_used_lag7',
        'stock_lag1',
        'stock_lag7',
        'stock_lag14',
        'stock_rolling_mean_7',
        'stock_rolling_mean_14',
        'stock_rolling_mean_30',
        'stock_rolling_std_7',
        'donation_rolling_mean_7',
        'usage_rolling_mean_7',
        'net_flow_lag1',
        'net_flow_rolling_mean_7',
    ]

    TARGET_COLUMN = 'units_available'

    def __init__(self, model_dir=None):
        """Initialise le trainer.

        Args:
            model_dir: Répertoire de sauvegarde des modèles.
                       Défaut : 'ml/trained_models/'
        """
        if model_dir is None:
            from django.conf import settings
            model_dir = os.path.join(
                settings.BASE_DIR,
                getattr(settings, 'ML_MODEL_DIR', 'ml/trained_models'),
            )
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)

        self.model = None
        self.label_encoders = {}
        self.metrics = {}

    def load_data_from_db(self):
        """Charge les données d'entraînement depuis la base Django.

        Returns:
            pd.DataFrame: Données brutes depuis BloodStockRecord.
        """
        from ml.models import BloodStockRecord

        queryset = BloodStockRecord.objects.all().values(
            'center_name', 'region', 'blood_group', 'date',
            'units_available', 'units_donated', 'units_used', 'units_expired',
        )

        df = pd.DataFrame(list(queryset))
        if df.empty:
            raise ValueError(
                "Aucune donnée d'entraînement trouvée en base. "
                "Exécutez 'python manage.py generate_training_data' d'abord."
            )

        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values(['center_name', 'blood_group', 'date'])
        df = df.reset_index(drop=True)

        logger.info(
            "Données chargées : %d enregistrements, %d centres",
            len(df), df['center_name'].nunique(),
        )
        return df

    def engineer_features(self, df):
        """Crée les features pour le modèle.

        Args:
            df: DataFrame avec les données brutes.

        Returns:
            pd.DataFrame enrichi avec les features temporelles,
            les lags et les moyennes mobiles.
        """
        df = df.copy()

        # === Encodage catégoriel ===
        for col in ['region', 'blood_group']:
            if col not in self.label_encoders:
                le = LabelEncoder()
                df[f'{col}_encoded'] = le.fit_transform(df[col])
                self.label_encoders[col] = le
            else:
                le = self.label_encoders[col]
                df[f'{col}_encoded'] = le.transform(df[col])

        # === Features temporelles ===
        df['day_of_week'] = df['date'].dt.dayofweek
        df['day_of_month'] = df['date'].dt.day
        df['month'] = df['date'].dt.month
        df['day_of_year'] = df['date'].dt.dayofyear
        df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)

        # === Lags et moyennes mobiles ===
        # Grouper par centre et groupe sanguin pour les calculs
        group_cols = ['center_name', 'blood_group']

        for lag in [1, 7]:
            df[f'units_donated_lag{lag}'] = (
                df.groupby(group_cols)['units_donated']
                .shift(lag)
            )
            df[f'units_used_lag{lag}'] = (
                df.groupby(group_cols)['units_used']
                .shift(lag)
            )

        for lag in [1, 7, 14]:
            df[f'stock_lag{lag}'] = (
                df.groupby(group_cols)['units_available']
                .shift(lag)
            )

        # Moyennes mobiles du stock
        for window in [7, 14, 30]:
            df[f'stock_rolling_mean_{window}'] = (
                df.groupby(group_cols)['units_available']
                .transform(lambda x: x.rolling(window, min_periods=1).mean())
            )

        # Écart-type mobile (volatilité)
        df['stock_rolling_std_7'] = (
            df.groupby(group_cols)['units_available']
            .transform(lambda x: x.rolling(7, min_periods=1).std())
        )

        # Moyennes mobiles des flux
        df['donation_rolling_mean_7'] = (
            df.groupby(group_cols)['units_donated']
            .transform(lambda x: x.rolling(7, min_periods=1).mean())
        )
        df['usage_rolling_mean_7'] = (
            df.groupby(group_cols)['units_used']
            .transform(lambda x: x.rolling(7, min_periods=1).mean())
        )

        # Flux net (dons - utilisations)
        df['net_flow_lag1'] = (
            df.groupby(group_cols)['units_donated'].shift(1).fillna(0)
            - df.groupby(group_cols)['units_used'].shift(1).fillna(0)
        )
        df['net_flow_rolling_mean_7'] = (
            df.groupby(group_cols)['net_flow_lag1']
            .transform(lambda x: x.rolling(7, min_periods=1).mean())
        )

        # Remplir les NaN restants
        df = df.fillna(0)

        logger.info(
            "Feature engineering terminé : %d features créées",
            len(self.FEATURE_COLUMNS),
        )
        return df

    def train(self, df=None, n_estimators=200, test_size=0.2):
        """Entraîne le modèle de prédiction.

        Args:
            df: DataFrame (optionnel, charge depuis la DB sinon).
            n_estimators: Nombre d'arbres du RandomForest.
            test_size: Proportion des données de test.

        Returns:
            dict: Métriques de performance du modèle.
        """
        if df is None:
            df = self.load_data_from_db()

        logger.info("Début de l'entraînement du modèle...")

        # Feature engineering
        df = self.engineer_features(df)

        # Séparer features et target
        X = df[self.FEATURE_COLUMNS].values
        y = df[self.TARGET_COLUMN].values

        # Split temporel (pas de mélange aléatoire pour les séries temporelles)
        split_idx = int(len(X) * (1 - test_size))
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        logger.info(
            "Split : %d entraînement, %d test",
            len(X_train), len(X_test),
        )

        # Entraînement du modèle
        self.model = RandomForestRegressor(
            n_estimators=n_estimators,
            max_depth=20,
            min_samples_split=10,
            min_samples_leaf=5,
            max_features='sqrt',
            n_jobs=-1,
            random_state=42,
        )
        self.model.fit(X_train, y_train)

        # Prédictions sur le jeu de test
        y_pred = self.model.predict(X_test)

        # Métriques
        self.metrics = {
            'mae': round(mean_absolute_error(y_test, y_pred), 4),
            'rmse': round(np.sqrt(mean_squared_error(y_test, y_pred)), 4),
            'r2_score': round(r2_score(y_test, y_pred), 4),
            'training_samples': len(X_train),
            'test_samples': len(X_test),
            'n_estimators': n_estimators,
        }

        logger.info(
            "Entraînement terminé — MAE=%.4f, RMSE=%.4f, R²=%.4f",
            self.metrics['mae'],
            self.metrics['rmse'],
            self.metrics['r2_score'],
        )

        # Validation croisée temporelle
        self._cross_validate(X, y)

        # Feature importance
        self._log_feature_importance()

        return self.metrics

    def _cross_validate(self, X, y, n_splits=5):
        """Validation croisée temporelle.

        Utilise TimeSeriesSplit pour respecter l'ordre chronologique
        et valider la robustesse du modèle.
        """
        tscv = TimeSeriesSplit(n_splits=n_splits)
        cv_scores = []

        for fold, (train_idx, test_idx) in enumerate(tscv.split(X), 1):
            X_cv_train, X_cv_test = X[train_idx], X[test_idx]
            y_cv_train, y_cv_test = y[train_idx], y[test_idx]

            cv_model = RandomForestRegressor(
                n_estimators=100,
                max_depth=15,
                n_jobs=-1,
                random_state=42,
            )
            cv_model.fit(X_cv_train, y_cv_train)
            y_cv_pred = cv_model.predict(X_cv_test)

            fold_r2 = r2_score(y_cv_test, y_cv_pred)
            cv_scores.append(fold_r2)
            logger.info("  CV Fold %d : R² = %.4f", fold, fold_r2)

        self.metrics['cv_r2_mean'] = round(np.mean(cv_scores), 4)
        self.metrics['cv_r2_std'] = round(np.std(cv_scores), 4)

        logger.info(
            "Validation croisée : R² moyen = %.4f (±%.4f)",
            self.metrics['cv_r2_mean'],
            self.metrics['cv_r2_std'],
        )

    def _log_feature_importance(self):
        """Affiche l'importance des features du modèle."""
        if self.model is None:
            return

        importances = self.model.feature_importances_
        feature_importance = sorted(
            zip(self.FEATURE_COLUMNS, importances),
            key=lambda x: x[1],
            reverse=True,
        )

        logger.info("Top 10 features les plus importantes :")
        for feat, imp in feature_importance[:10]:
            logger.info("  %s : %.4f", feat, imp)

    def save_model(self, version=None):
        """Sauvegarde le modèle entraîné et ses métadonnées.

        Args:
            version: Version du modèle (défaut : timestamp).

        Returns:
            str: Chemin du fichier modèle sauvegardé.
        """
        if self.model is None:
            raise ValueError("Aucun modèle entraîné à sauvegarder.")

        if version is None:
            version = datetime.now().strftime('%Y%m%d_%H%M%S')

        model_filename = f'blood_shortage_model_v{version}.pkl'
        model_path = os.path.join(self.model_dir, model_filename)

        # Sauvegarder le modèle et les encodeurs ensemble
        model_bundle = {
            'model': self.model,
            'label_encoders': self.label_encoders,
            'feature_columns': self.FEATURE_COLUMNS,
            'metrics': self.metrics,
            'version': version,
            'trained_at': datetime.now().isoformat(),
        }

        joblib.dump(model_bundle, model_path)
        logger.info("Modèle sauvegardé : %s", model_path)

        # Sauvegarder les métadonnées en base
        self._save_metadata_to_db(version, model_path)

        return model_path

    def _save_metadata_to_db(self, version, model_path):
        """Sauvegarde les métadonnées du modèle en base Django."""
        from ml.models import MLModelMetadata

        MLModelMetadata.objects.create(
            version=version,
            algorithm='RandomForestRegressor',
            training_samples=self.metrics.get('training_samples', 0),
            mae=self.metrics.get('mae', 0),
            rmse=self.metrics.get('rmse', 0),
            r2_score=self.metrics.get('r2_score', 0),
            model_file_path=model_path,
            is_active=True,
            notes=(
                f"CV R²={self.metrics.get('cv_r2_mean', 'N/A')} "
                f"(±{self.metrics.get('cv_r2_std', 'N/A')})"
            ),
        )
        logger.info("Métadonnées du modèle sauvegardées en base.")
