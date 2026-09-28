"""
Classification du risque de pénurie et score de confiance.

Le risque s'exprime en jours de stock (stock prévu / consommation moyenne
journalière des 30 derniers jours), comme le font les services de
transfusion, et non en nombre absolu de poches : 10 poches, c'est une
pénurie pour O+ à Dakar mais un stock confortable pour AB- à Kédougou.

Auteur : El Hadji Massogui Diop
"""

import numpy as np
from django.conf import settings
from scipy.special import ndtr

CRITICAL = 'CRITICAL'
WARNING = 'WARNING'
NORMAL = 'NORMAL'
RISK_LEVELS = (CRITICAL, WARNING, NORMAL)

# Quantile de la loi normale à 90 % : [P10, P90] = point ± 1,2816 σ.
_Z_80 = 1.2815515655446004
_MIN_SIGMA_UNITS = 0.5


def thresholds():
    """Seuils (critique, alerte) en jours de stock depuis les settings."""
    critical = float(settings.ML_SHORTAGE_CRITICAL_DAYS)
    warning = float(settings.ML_SHORTAGE_WARNING_DAYS)
    if not 0 < critical < warning:
        raise ValueError(
            "Il faut 0 < ML_SHORTAGE_CRITICAL_DAYS < ML_SHORTAGE_WARNING_DAYS."
        )
    return critical, warning


def classify(units, daily_demand, critical_days, warning_days):
    """Niveau de risque pour des stocks (en poches) et une consommation."""
    days_of_supply = np.asarray(units, dtype=float) / np.asarray(daily_demand, dtype=float)
    return np.select(
        [days_of_supply < critical_days, days_of_supply < warning_days],
        [CRITICAL, WARNING],
        default=NORMAL,
    )


def confidence(point, lower, upper, daily_demand, levels, critical_days, warning_days):
    """Probabilité que le stock réel tombe dans la classe de risque annoncée.

    La distribution prédictive est approchée par une loi normale centrée
    sur la prédiction, dont l'écart-type est déduit de l'intervalle
    [P10, P90] fourni par les modèles quantiles.
    """
    point = np.asarray(point, dtype=float)
    daily_demand = np.asarray(daily_demand, dtype=float)
    sigma = np.maximum(
        (np.asarray(upper) - np.asarray(lower)) / (2 * _Z_80), _MIN_SIGMA_UNITS
    )
    p_below_critical = ndtr((critical_days * daily_demand - point) / sigma)
    p_below_warning = ndtr((warning_days * daily_demand - point) / sigma)

    levels = np.asarray(levels)
    return np.select(
        [levels == CRITICAL, levels == WARNING],
        [p_below_critical, p_below_warning - p_below_critical],
        default=1.0 - p_below_warning,
    )
