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
