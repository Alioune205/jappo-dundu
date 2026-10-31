"""
Rappel « vous pouvez de nouveau donner ».

Dès que le délai réglementaire depuis le dernier don est écoulé (et que le
plafond annuel le permet), le donneur reçoit une notification, une seule fois
par don. Un donneur prévenu au bon moment revient plus souvent : c'est le
principal levier de fidélisation des services de transfusion.

Lancé par ``python manage.py remind_eligible_donors`` (à planifier chaque
matin, par exemple à 9 h).
"""

import logging

from django.db.models import F, Q
from django.utils import timezone

from .models import Donor

logger = logging.getLogger('jappo_dundu.sang')


def donors_to_remind(today=None):
    """Donneurs redevenus éligibles depuis leur dernier don et pas encore prévenus."""
    today = today or timezone.localdate()
    return (
        Donor.objects.eligible(today)
        .filter(last_donation_date__isnull=False)
        .filter(Q(eligibility_reminded_for__isnull=True) | ~Q(eligibility_reminded_for=F('last_donation_date')))
    )


def remind_eligible_donors(today=None):
    """Prévient chaque donneur redevenu éligible. Retourne le nombre de donneurs prévenus."""
    from push.services import notify_can_donate_again

    donors = list(donors_to_remind(today).only('pk', 'user_id', 'last_donation_date'))
    if not donors:
        return 0
    notify_can_donate_again([donor.user_id for donor in donors])
    for donor in donors:
        Donor.objects.filter(pk=donor.pk).update(eligibility_reminded_for=donor.last_donation_date)
    logger.info("Rappel d'éligibilité envoyé à %d donneur(s).", len(donors))
    return len(donors)
