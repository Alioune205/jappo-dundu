"""
Compatibilité transfusionnelle des globules rouges (systèmes ABO et Rhésus D).

Un receveur peut recevoir des globules rouges :
- du même groupe ABO, ou du groupe O ;
- AB peut recevoir de tous les groupes ABO ;
- Rh- ne reçoit que du Rh- ; Rh+ reçoit du Rh+ et du Rh-.

Auteur : Ibrahima Khalilou Diallo
"""

from ml.constants import BLOOD_GROUP_CODES

# Receveur -> groupes de donneurs compatibles (ordre : identique d'abord).
DONORS_FOR_RECIPIENT = {
    'O-': ('O-',),
    'O+': ('O+', 'O-'),
    'A-': ('A-', 'O-'),
    'A+': ('A+', 'A-', 'O+', 'O-'),
    'B-': ('B-', 'O-'),
    'B+': ('B+', 'B-', 'O+', 'O-'),
    'AB-': ('AB-', 'A-', 'B-', 'O-'),
    'AB+': ('AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'),
}

# Donneur -> groupes de receveurs compatibles (dérivé de la table ci-dessus).
RECIPIENTS_FOR_DONOR = {
    donor: tuple(
        recipient for recipient in BLOOD_GROUP_CODES if donor in DONORS_FOR_RECIPIENT[recipient]
    )
    for donor in BLOOD_GROUP_CODES
}


def compatible_donor_groups(recipient_group):
    """Groupes pouvant donner à ``recipient_group`` (KeyError si inconnu)."""
    return DONORS_FOR_RECIPIENT[recipient_group]


def compatible_recipient_groups(donor_group):
    """Groupes pouvant recevoir de ``donor_group`` (KeyError si inconnu)."""
    return RECIPIENTS_FOR_DONOR[donor_group]


def can_donate(donor_group, recipient_group):
    return donor_group in DONORS_FOR_RECIPIENT[recipient_group]


# Plasma : compatibilité ABO inversée (AB est le donneur universel de plasma),
# le Rhésus n'intervient pas. Ordre : identique d'abord.
_ABO_PLASMA_DONORS = {'O': ('O', 'A', 'B', 'AB'), 'A': ('A', 'AB'), 'B': ('B', 'AB'), 'AB': ('AB',)}


def _abo(group):
    return group[:-1]


def compatible_supply_groups(recipient_group, component):
    """Groupes de poches utilisables pour ce receveur, selon le produit (identique d'abord).

    - globules rouges et sang total : règles ABO/Rh des globules rouges ;
    - plasma : ABO inversé, Rhésus indifférent ;
    - plaquettes : ABO identique de préférence, puis les autres (Rh- pour un
      receveur Rh-).

    À valider avec le CNTS (protocoles transfusionnels locaux).
    """
    if component in ('red_cells', 'whole_blood'):
        return compatible_donor_groups(recipient_group)
    abo, rh = _abo(recipient_group), recipient_group[-1]
    if component == 'plasma':
        groups = [f'{donor}{sign}' for donor in _ABO_PLASMA_DONORS[abo] for sign in (rh, '+' if rh == '-' else '-')]
        return tuple(dict.fromkeys(groups))
    allowed = [g for g in BLOOD_GROUP_CODES if rh == '+' or g.endswith('-')]
    return tuple(sorted(allowed, key=lambda g: (g != recipient_group, _abo(g) != abo)))
