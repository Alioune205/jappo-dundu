"""
Des prévisions aux actions.

Une prévision de pénurie n'a de valeur que si elle déclenche une action à
temps. Pour chaque région et groupe sanguin à risque dans les 14 jours, on
propose :

- la raison lisible (consommation et dons moyens sur 30 jours) ;
- un appel préventif aux donneurs du groupe dans la région (bouton dans la
  page Prévisions, ``sang.campaigns``) ;
- une collecte à organiser ;
- un transfert possible depuis la région la mieux pourvue pour ce groupe.

Responsable : El Hadji Massogui Diop
"""

from datetime import timedelta

from django.db.models import Avg, Min
from django.utils import timezone

from .constants import REGION_LABELS
from .models import BloodStockRecord, PredictionResult

HORIZON_DAYS = 14
RISK_ORDER = {'CRITICAL': 0, 'WARNING': 1}


def _flows(region, blood_group, today):
    """Utilisations et dons moyens par jour sur 30 jours (toutes banques de la région)."""
    return BloodStockRecord.objects.filter(
        region=region, blood_group=blood_group, date__gte=today - timedelta(days=30)
    ).aggregate(used=Avg('units_used'), donated=Avg('units_donated'))


def _best_supplier(region, blood_group, today):
    """Région la mieux pourvue pour ce groupe (stock du dernier relevé), hors ``region``."""
    latest = (
        BloodStockRecord.objects.filter(blood_group=blood_group, date__gte=today - timedelta(days=3))
        .exclude(region=region)
        .order_by('-units_available')
        .first()
    )
    return latest


def recommendations(scope, *, today=None):
    """Actions proposées pour les risques à venir visibles dans ``scope`` (filtre Q)."""
    today = today or timezone.localdate()
    risks = (
        PredictionResult.objects.filter(
            scope,
            risk_level__in=list(RISK_ORDER),
            prediction_date__gt=today,
            prediction_date__lte=today + timedelta(days=HORIZON_DAYS),
        )
        .values('region', 'blood_group', 'risk_level')
        .annotate(first_date=Min('prediction_date'), days_of_supply=Min('days_of_supply'))
    )
    # Un seul niveau par (région, groupe) : le plus grave.
    by_key = {}
    for risk in risks:
        key = (risk['region'], risk['blood_group'])
        current = by_key.get(key)
        if current is None or RISK_ORDER[risk['risk_level']] < RISK_ORDER[current['risk_level']]:
            by_key[key] = risk
    items = []
    for (region, group), risk in by_key.items():
        flows = _flows(region, group, today)
        used, donated = flows['used'], flows['donated']
        reason = (
            f"Consommation moyenne {used:.1f} poche(s)/jour pour {donated:.1f} donnée(s)/jour sur 30 jours."
            if used is not None and donated is not None
            else "Historique insuffisant pour expliquer la tendance."
        )
        supplier = _best_supplier(region, group, today)
        actions = [
            {
                'type': 'campaign',
                'label': f"Prévenir les donneurs {group} de la région {REGION_LABELS.get(region, region)}",
            },
            {'type': 'drive', 'label': "Organiser une collecte avant la date prévue"},
        ]
        if supplier is not None and supplier.units_available > 0:
            actions.append(
                {
                    'type': 'transfer',
                    'label': f"Demander un transfert : {supplier.center_name} ({supplier.units_available} poches {group})",
                }
            )
        items.append(
            {
                'region': region,
                'region_display': REGION_LABELS.get(region, region),
                'blood_group': group,
                'risk_level': risk['risk_level'],
                'first_date': risk['first_date'],
                'days_until': (risk['first_date'] - today).days,
                'days_of_supply': round(risk['days_of_supply'], 1) if risk['days_of_supply'] is not None else None,
                'reason': reason,
                'actions': actions,
            }
        )
    items.sort(key=lambda item: (RISK_ORDER[item['risk_level']], item['days_until']))
    return items
