"""
Campagnes préventives : prévenir les donneurs d'un groupe dans une région
quand une pénurie est prévue (page Prévisions, ``ml.actions``).

- seuls les donneurs éligibles et disponibles du groupe, résidant dans la
  région, sont prévenus ;
- un donneur n'est pas sollicité deux fois en 7 jours par une campagne du
  même groupe, ni au-delà de ``CAMPAIGN_MAX_DONORS`` par campagne ;
- notification push (pas de SMS : ce n'est pas une urgence immédiate).
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Donor, DonorCampaign

COOLDOWN_DAYS = 7


@transaction.atomic
def launch_campaign(*, region, blood_group, created_by, message=''):
    from push.services import send_to_users

    since = timezone.now() - timedelta(days=COOLDOWN_DAYS)
    donors = list(
        Donor.objects.eligible()
        .filter(blood_group=blood_group, user__profile__region=region)
        .exclude(campaigns__blood_group=blood_group, campaigns__created_at__gte=since)
        .distinct()[: getattr(settings, 'CAMPAIGN_MAX_DONORS', 300)]
    )
    campaign = DonorCampaign.objects.create(
        region=region, blood_group=blood_group, message=message, created_by=created_by
    )
    campaign.recipients.set(donors)
    body = message or (
        f"Le stock de sang {blood_group} va baisser dans votre région. "
        "Si vous pouvez donner cette semaine, rendez-vous au centre de transfusion le plus proche."
    )
    user_ids = [donor.user_id for donor in donors]
    transaction.on_commit(
        lambda: send_to_users(
            user_ids, title=f"Votre groupe {blood_group} est recherché", body=body, data={'type': 'campaign'}
        )
    )
    return campaign, len(donors)
