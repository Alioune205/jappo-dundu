"""
Générateur de données synthétiques réalistes pour l'entraînement ML.

Génère des données de stock sanguin conformes à la réalité sénégalaise :
- 14 régions avec leurs centres de transfusion
- Distribution réaliste des groupes sanguins
- Saisonnalité (climat, fêtes religieuses, événements)
- Tendances et bruit réalistes

Auteur : El Hadji Massogui Diop
"""

import logging
import random
from datetime import date, timedelta

import numpy as np
import pandas as pd

logger = logging.getLogger('jappo_dundu.ml')


class BloodDataGenerator:
    """Générateur de données synthétiques de stock sanguin pour le Sénégal.

    Produit des séries temporelles réalistes de stock sanguin par
    centre de transfusion, groupe sanguin et jour.
    """

    # Centres de transfusion par région (réaliste pour le Sénégal)
    CENTERS = {
        'dakar': [
            'CNTS Dakar',
            'Hôpital Principal de Dakar',
            'Hôpital Aristide Le Dantec',
        ],
        'thies': ['CTS Thiès'],
        'saint_louis': ['CTS Saint-Louis'],
        'kaolack': ['CTS Kaolack'],
        'ziguinchor': ['CTS Ziguinchor'],
        'tambacounda': ['CTS Tambacounda'],
        'louga': ['CTS Louga'],
        'fatick': ['CTS Fatick'],
        'kolda': ['CTS Kolda'],
        'matam': ['CTS Matam'],
        'kaffrine': ['CTS Kaffrine'],
        'kedougou': ['CTS Kédougou'],
        'sedhiou': ['CTS Sédhiou'],
        'diourbel': ['CTS Diourbel'],
    }

    BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

    # Distribution réaliste des groupes sanguins en Afrique de l'Ouest
    # Source : approximation basée sur les données OMS pour la région
    BLOOD_GROUP_WEIGHTS = {
        'O+': 0.47,
        'O-': 0.04,
        'A+': 0.22,
        'A-': 0.03,
        'B+': 0.20,
        'B-': 0.02,
        'AB+': 0.04,
        'AB-': 0.01,
    }

    # Capacité moyenne de stock par taille de centre
    CENTER_CAPACITY = {
        'large': 200,   # CNTS Dakar, grands hôpitaux
        'medium': 80,    # CTS régionaux capitales
        'small': 35,     # CTS petites régions
    }

    def __init__(self, seed=42):
        """Initialise le générateur avec une graine reproductible."""
        self.rng = np.random.default_rng(seed)
        random.seed(seed)

    def generate(self, start_date=None, end_date=None, days=730):
        """Génère le dataset complet de stock sanguin.

        Args:
            start_date: Date de début (défaut : 2 ans avant aujourd'hui).
            end_date: Date de fin (défaut : aujourd'hui).
            days: Nombre de jours si start_date non spécifié.

        Returns:
            pd.DataFrame avec les colonnes :
            center_name, region, blood_group, date, units_available,
            units_donated, units_used, units_expired
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=days)

        logger.info(
            "Génération de données du %s au %s (%d jours)",
            start_date, end_date, (end_date - start_date).days,
        )

        all_records = []
        date_range = pd.date_range(start=start_date, end=end_date, freq='D')

        for region, centers in self.CENTERS.items():
            for center_name in centers:
                center_size = self._get_center_size(center_name)
                base_capacity = self.CENTER_CAPACITY[center_size]

                for blood_group in self.BLOOD_GROUPS:
                    weight = self.BLOOD_GROUP_WEIGHTS[blood_group]
                    records = self._generate_center_series(
                        center_name=center_name,
                        region=region,
                        blood_group=blood_group,
                        date_range=date_range,
                        base_capacity=base_capacity,
                        group_weight=weight,
                    )
                    all_records.extend(records)

        df = pd.DataFrame(all_records)
        logger.info(
            "Données générées : %d enregistrements, %d centres, %d jours",
            len(df),
            len(df['center_name'].unique()),
            len(date_range),
        )
        return df

    def _generate_center_series(
        self, center_name, region, blood_group, date_range,
        base_capacity, group_weight,
    ):
        """Génère la série temporelle pour un centre/groupe sanguin.

        Modélise :
        - Stock de base proportionnel au groupe sanguin
        - Saisonnalité (saison sèche/pluies, fêtes)
        - Tendance légère
        - Bruit aléatoire
        - Flux de dons, utilisations et péremptions
        """
        n_days = len(date_range)
        records = []

        # Stock de base pour ce groupe sanguin
        base_stock = max(3, int(base_capacity * group_weight))

        # Tendance linéaire légère (croissance ou décroissance)
        trend = self.rng.uniform(-0.01, 0.02)

        # Stock initial
        current_stock = base_stock + self.rng.integers(-5, 5)
        current_stock = max(0, current_stock)

        for i, dt in enumerate(date_range):
            d = dt.date() if hasattr(dt, 'date') else dt
            day_of_week = dt.dayofweek
            month = dt.month
            day_of_year = dt.dayofyear

            # === Facteurs saisonniers ===
            seasonal_factor = self._compute_seasonal_factor(
                month, day_of_year, d
            )

            # === Dons du jour ===
            # Plus de dons en semaine, moins le weekend
            base_donations = max(1, base_stock * 0.08)
            weekday_factor = 1.2 if day_of_week < 5 else 0.5
            donations = max(0, int(
                base_donations
                * weekday_factor
                * seasonal_factor
                * self.rng.uniform(0.3, 1.8)
                + self.rng.normal(0, 1)
            ))

            # === Utilisation du jour ===
            # Urgences plus fréquentes la nuit/weekend
            base_usage = max(1, base_stock * 0.06)
            usage_factor = 1.3 if day_of_week >= 5 else 1.0
            usage = max(0, int(
                base_usage
                * usage_factor
                * (1 / max(0.5, seasonal_factor))
                * self.rng.uniform(0.2, 2.0)
                + self.rng.normal(0, 1)
            ))

            # === Péremption ===
            # Environ 2-5% du stock périme chaque jour
            expired = 0
            if current_stock > base_stock * 1.5 and self.rng.random() < 0.15:
                expired = self.rng.integers(1, max(2, int(current_stock * 0.05)))

            # === Mise à jour du stock ===
            current_stock = current_stock + donations - usage - expired

            # Appliquer la tendance
            current_stock = int(current_stock * (1 + trend / n_days))

            # Borner le stock (min 0, max 3x la capacité)
            current_stock = max(0, min(current_stock, base_stock * 3))

            records.append({
                'center_name': center_name,
                'region': region,
                'blood_group': blood_group,
                'date': d,
                'units_available': current_stock,
                'units_donated': donations,
                'units_used': usage,
                'units_expired': expired,
            })

        return records

    def _compute_seasonal_factor(self, month, day_of_year, d):
        """Calcule le facteur saisonnier pour une date donnée.

        Modélise :
        - Saison des pluies (juillet-octobre) : moins de dons
        - Saison sèche (novembre-juin) : plus de dons
        - Ramadan : légère hausse des dons (solidarité)
        - Tabaski/Magal : pics de dons communautaires
        - Période de chaleur extrême (avril-mai) : moins de donneurs
        """
        # Base saisonnière sinusoïdale
        seasonal = 1.0 + 0.15 * np.sin(2 * np.pi * (day_of_year - 90) / 365)

        # Saison des pluies : baisse des dons (-20%)
        if 7 <= month <= 10:
            seasonal *= 0.80

        # Chaleur extrême avril-mai : baisse (-10%)
        if month in (4, 5):
            seasonal *= 0.90

        # Période post-Tabaski (approximation, varie chaque année)
        # Simulation d'un pic de solidarité
        if month == 6 and 15 <= d.day <= 25:
            seasonal *= 1.30

        # Grand Magal (approximation)
        if month == 10 and 10 <= d.day <= 20:
            seasonal *= 1.25

        return seasonal

    @staticmethod
    def _get_center_size(center_name):
        """Détermine la taille du centre basée sur son nom."""
        large_keywords = ['CNTS', 'Principal', 'Dantec']
        if any(kw in center_name for kw in large_keywords):
            return 'large'

        medium_keywords = [
            'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor',
            'Tambacounda', 'Diourbel',
        ]
        if any(kw in center_name for kw in medium_keywords):
            return 'medium'

        return 'small'

    def save_to_db(self, df):
        """Sauvegarde le DataFrame en base de données Django.

        Args:
            df: DataFrame généré par `self.generate()`.

        Returns:
            int: Nombre d'enregistrements créés.
        """
        from ml.models import BloodStockRecord

        records = [
            BloodStockRecord(
                center_name=row['center_name'],
                region=row['region'],
                blood_group=row['blood_group'],
                date=row['date'],
                units_available=row['units_available'],
                units_donated=row['units_donated'],
                units_used=row['units_used'],
                units_expired=row['units_expired'],
            )
            for _, row in df.iterrows()
        ]

        # Bulk create par lot de 5000 pour éviter les problèmes de mémoire
        created_count = 0
        batch_size = 5000
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            BloodStockRecord.objects.bulk_create(
                batch, ignore_conflicts=True
            )
            created_count += len(batch)
            logger.info(
                "Lot %d/%d sauvegardé (%d enregistrements)",
                (i // batch_size) + 1,
                (len(records) + batch_size - 1) // batch_size,
                len(batch),
            )

        return created_count
