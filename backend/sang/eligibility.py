"""
Règles d'éligibilité au don de sang total.

- âge : de 18 à 65 ans révolus ;
- délai minimal depuis le dernier don : 3 mois (90 jours) pour un homme,
  4 mois (120 jours) pour une femme ;
- le donneur doit s'être déclaré disponible et son compte être actif.

Ces valeurs par défaut sont à valider avec le CNTS. Les mêmes règles
existent en Python (fiche d'un donneur) et en SQL (``Donor.objects.eligible``) ;
les tests vérifient qu'elles concordent.

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

MIN_DONOR_AGE = 18
MAX_DONOR_AGE = 65
DONATION_INTERVAL_DAYS = {'M': 90, 'F': 120}


def years_before(day, years):
    """Même jour, ``years`` ans plus tôt (le 29 février devient le 28)."""
    try:
        return day.replace(year=day.year - years)
    except ValueError:
        return day.replace(year=day.year - years, day=28)


def age_on(birth_date, day):
    """Âge en années révolues à la date ``day``."""
    had_birthday = (day.month, day.day) >= (birth_date.month, birth_date.day)
    return day.year - birth_date.year - (0 if had_birthday else 1)


def birth_date_bounds(today):
    """(né au plus tard le, né strictement après le) pour un âge éligible."""
    return years_before(today, MIN_DONOR_AGE), years_before(today, MAX_DONOR_AGE + 1)


def next_eligible_date(sex, last_donation_date):
    """Première date possible pour un nouveau don (None : aucun délai)."""
    if last_donation_date is None:
        return None
    return last_donation_date + timedelta(days=DONATION_INTERVAL_DAYS[sex])


def ineligibility_reasons(donor, today):
    """Raisons empêchant ``donor`` de donner à ``today`` (liste vide : éligible)."""
    reasons = []
    if not donor.is_available:
        reasons.append("Vous vous êtes déclaré indisponible.")
    if not donor.user.is_active:
        reasons.append("Le compte est désactivé.")
    age = age_on(donor.date_of_birth, today)
    if age < MIN_DONOR_AGE:
        reasons.append(f"Il faut avoir au moins {MIN_DONOR_AGE} ans.")
    elif age > MAX_DONOR_AGE:
        reasons.append(f"L'âge maximal pour donner est de {MAX_DONOR_AGE} ans.")
    next_date = next_eligible_date(donor.sex, donor.last_donation_date)
    if next_date is not None and today < next_date:
        reasons.append(
            f"Délai depuis le dernier don non écoulé : prochain don possible "
            f'le {next_date.strftime("%d/%m/%Y")}.'
        )
    return reasons
