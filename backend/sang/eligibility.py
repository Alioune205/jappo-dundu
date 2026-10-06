"""
Règles d'éligibilité au don de sang total.

Source : Centre National de Transfusion Sanguine, « Qui peut donner »
(cnts.gouv.sn, consulté le 6 octobre 2026).

- âge : de 18 à 60 ans révolus ;
- poids : au moins 50 kg (un poids non renseigné ne bloque pas : profils
  créés avant l'ajout du champ ; le centre pèse le donneur avant le don) ;
- délai minimal depuis le dernier don : 3 mois (90 jours) pour un homme,
  4 mois (120 jours) pour une femme ;
- au plus 4 dons par an pour un homme, 3 pour une femme (dons enregistrés
  sur les 365 derniers jours) ;
- le donneur doit s'être déclaré disponible et son compte être actif.

L'entretien médical et le taux d'hémoglobine, vérifiés au centre le jour du
don, restent hors de la plateforme. Les mêmes règles existent en Python
(fiche d'un donneur) et en SQL (``Donor.objects.eligible``) ; les tests
vérifient qu'elles concordent.

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import timedelta

MIN_DONOR_AGE = 18
MAX_DONOR_AGE = 60
MIN_DONOR_WEIGHT_KG = 50
DONATION_INTERVAL_DAYS = {'M': 90, 'F': 120}
MAX_DONATIONS_PER_YEAR = {'M': 4, 'F': 3}
YEAR_DAYS = 365


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


def yearly_cap_date(sex, donation_dates):
    """Date à laquelle le plafond annuel libère un don (None : plafond non atteint).

    ``donation_dates`` : dates des dons enregistrés, dans n'importe quel ordre.
    Le plafond porte sur une année glissante : le plus ancien des N derniers
    dons doit dater de plus de 365 jours.
    """
    cap = MAX_DONATIONS_PER_YEAR[sex]
    recent = sorted(donation_dates, reverse=True)
    if len(recent) < cap:
        return None
    return recent[cap - 1] + timedelta(days=YEAR_DAYS)


def next_eligible_date(sex, last_donation_date, donation_dates=()):
    """Première date possible pour un nouveau don (None : aucun délai)."""
    candidates = [yearly_cap_date(sex, donation_dates)]
    if last_donation_date is not None:
        candidates.append(last_donation_date + timedelta(days=DONATION_INTERVAL_DAYS[sex]))
    candidates = [day for day in candidates if day is not None]
    return max(candidates) if candidates else None


def ineligibility_reasons(donor, today, donation_dates=()):
    """Raisons empêchant ``donor`` de donner à ``today`` (liste vide : éligible).

    ``donation_dates`` : dates des dons enregistrés (plafond annuel).
    """
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
    if donor.weight_kg is not None and donor.weight_kg < MIN_DONOR_WEIGHT_KG:
        reasons.append(f"Il faut peser au moins {MIN_DONOR_WEIGHT_KG} kg.")
    interval_date = next_eligible_date(donor.sex, donor.last_donation_date)
    if interval_date is not None and today < interval_date:
        reasons.append(
            f"Délai depuis le dernier don non écoulé : prochain don possible "
            f'le {interval_date.strftime("%d/%m/%Y")}.'
        )
    cap_date = yearly_cap_date(donor.sex, donation_dates)
    if cap_date is not None and today < cap_date:
        reasons.append(
            f"Nombre maximal de dons sur un an atteint ({MAX_DONATIONS_PER_YEAR[donor.sex]}) : "
            f'prochain don possible le {cap_date.strftime("%d/%m/%Y")}.'
        )
    return reasons
