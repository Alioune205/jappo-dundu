"""
Calendrier des événements qui influencent les dons et besoins en sang.

Les fêtes musulmanes suivent le calendrier hégirien (lunaire) et se
décalent d'environ 11 jours par an dans le calendrier grégorien. Les dates
sont calculées avec le calendrier hégirien tabulaire (arithmétique) :
précision de ±1 à 2 jours par rapport à l'observation de la lune, ce qui
suffit pour la modélisation.

Événements retenus :
- Ramadan (1er Ramadan → veille de Korité) : baisse des dons, les donneurs
  jeûnant en journée ;
- Tabaski (10 Dhou al-hijja) et Grand Magal de Touba (18 Safar) : grands
  déplacements, hausse des accidents de la route et des besoins.

Auteur : El Hadji Massogui Diop
"""

import math
from datetime import date, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd

_ISLAMIC_EPOCH_JD = 1948439.5  # 1er Muharram 1 AH (16 juillet 622, julien)
_GREGORIAN_ORDINAL_JD_OFFSET = 1721424.5  # date.toordinal() → jour julien

RAMADAN_MONTH = 9
SHAWWAL_MONTH = 10
DHU_AL_HIJJA_MONTH = 12
SAFAR_MONTH = 2

# Fenêtres autour des fêtes (jours avant, jours après).
TABASKI_WINDOW = (2, 3)
MAGAL_WINDOW = (2, 2)


def islamic_to_gregorian(year, month, day):
    """Convertit une date hégirienne (tabulaire) en date grégorienne."""
    julian_day = (
        day
        + math.ceil(29.5 * (month - 1))
        + (year - 1) * 354
        + (3 + 11 * year) // 30
        + _ISLAMIC_EPOCH_JD
        - 1
    )
    return date.fromordinal(int(julian_day - _GREGORIAN_ORDINAL_JD_OFFSET))


def _window(center, before_after):
    before, after = before_after
    return center - timedelta(days=before), center + timedelta(days=after)


@lru_cache(maxsize=64)
def events_for_year(gregorian_year):
    """Périodes (nom, début, fin incluse) qui touchent l'année donnée."""
    approx_hijri = int((gregorian_year - 622) * 33 / 32)
    periods = []
    for hijri_year in range(approx_hijri - 1, approx_hijri + 2):
        ramadan_start = islamic_to_gregorian(hijri_year, RAMADAN_MONTH, 1)
        korite = islamic_to_gregorian(hijri_year, SHAWWAL_MONTH, 1)
        periods.append(('ramadan', ramadan_start, korite - timedelta(days=1)))
        periods.append((
            'tabaski',
            *_window(
                islamic_to_gregorian(hijri_year, DHU_AL_HIJJA_MONTH, 10),
                TABASKI_WINDOW,
            ),
        ))
        periods.append((
            'magal',
            *_window(
                islamic_to_gregorian(hijri_year, SAFAR_MONTH, 18),
                MAGAL_WINDOW,
            ),
        ))
    return tuple(
        (name, start, end)
        for name, start, end in periods
        if start.year <= gregorian_year <= end.year
    )


def event_flags(dates):
    """Indicateurs journaliers pour une série de dates.

    Returns:
        pd.DataFrame indexé comme ``dates`` avec les colonnes booléennes
        ``is_ramadan`` et ``is_major_event`` (Tabaski ou Magal).
    """
    index = pd.DatetimeIndex(pd.to_datetime(dates))
    is_ramadan = np.zeros(len(index), dtype=bool)
    is_event = np.zeros(len(index), dtype=bool)
    if len(index) == 0:
        return pd.DataFrame(
            {'is_ramadan': is_ramadan, 'is_major_event': is_event}, index=index
        )

    for year in range(index.min().year, index.max().year + 1):
        for name, start, end in events_for_year(year):
            mask = (index >= pd.Timestamp(start)) & (index <= pd.Timestamp(end))
            if name == 'ramadan':
                is_ramadan |= mask
            else:
                is_event |= mask

    return pd.DataFrame(
        {'is_ramadan': is_ramadan, 'is_major_event': is_event}, index=index
    )
