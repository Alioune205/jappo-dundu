"""
Diffusion temps réel des résultats de prédiction.

Après chaque exécution enregistrée :
- le tableau de bord reçoit un ``prediction_update`` (synthèse des risques) ;
- chaque région avec au moins une pénurie prévue reçoit un ``blood_alert``
  listant, par centre et groupe sanguin, la première date critique.

Auteur : El Hadji Massogui Diop
"""

from ml.constants import REGION_LABELS
from realtime.broadcast import broadcast_alert, broadcast_dashboard

from .risk import CRITICAL

MAX_ALERT_ITEMS = 20


def critical_items_by_region(predictions):
    """Première date critique de chaque (centre, groupe), groupée par région."""
    first_critical = {}
    for prediction in sorted(predictions, key=lambda p: p['prediction_date']):
        if prediction['risk_level'] != CRITICAL:
            continue
        key = (prediction['center_name'], prediction['blood_group'])
        first_critical.setdefault(key, prediction)

    by_region = {}
    for prediction in first_critical.values():
        by_region.setdefault(prediction['region'], []).append({
            'center_name': prediction['center_name'],
            'blood_group': prediction['blood_group'],
            'first_critical_date': prediction['prediction_date'],
            'predicted_units': prediction['predicted_units'],
            'days_of_supply': prediction['days_of_supply'],
            'confidence_score': prediction['confidence_score'],
        })
    for items in by_region.values():
        items.sort(key=lambda item: (item['first_critical_date'], item['days_of_supply']))
    return by_region


def notify_prediction_run(run):
    """Publie la synthèse et les alertes de pénurie d'une exécution."""
    broadcast_dashboard('prediction', {
        'model_version': run.model_version,
        'days_ahead': run.days_ahead,
        'filters': {'region': run.region, 'blood_group': run.blood_group},
        'predictions_count': run.count,
        'risk_summary': run.risk_summary(),
    })

    for region, items in critical_items_by_region(run.predictions).items():
        broadcast_alert(
            'blood',
            {
                'source': 'ml_prediction',
                'severity': 'critical',
                'region': region,
                'region_display': REGION_LABELS.get(region, region),
                'message': (
                    f"Risque de pénurie de sang prévu en région "
                    f"{REGION_LABELS.get(region, region)} "
                    f"({len(items)} stock(s) concerné(s))."
                ),
                'items': items[:MAX_ALERT_ITEMS],
                'total_items': len(items),
                'model_version': run.model_version,
            },
            region=region,
        )
