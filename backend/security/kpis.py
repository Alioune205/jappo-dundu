"""
Indicateurs de pilotage du réseau, avec leurs objectifs.

Chaque indicateur porte sa valeur, son objectif et son état (``ok``,
``warning``, ``critical``, ou ``no_data``) : le tableau de bord et le rapport
hebdomadaire disent d'un coup d'œil ce qui va et ce qui ne va pas. Les
objectifs sont réglables (``KPI_TARGETS``) et à valider avec le ministère.
"""

import statistics
from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone

DEFAULT_TARGETS = {
    # (objectif, seuil d'alerte, sens) : 'max' = plus petit est mieux.
    'response_minutes': (15, 25, 'max'),
    'assign_minutes': (3, 6, 'max'),
    'blood_fulfilled_rate': (0.9, 0.7, 'min'),
    'bed_freshness_rate': (0.9, 0.7, 'min'),
    'prealert_answered_rate': (0.95, 0.8, 'min'),
    'escalated_alerts': (0, 3, 'max'),
}

LABELS = {
    'response_minutes': "Délai médian d'arrivée sur place",
    'assign_minutes': "Délai médian d'affectation d'une ambulance",
    'blood_fulfilled_rate': "Demandes de sang satisfaites",
    'bed_freshness_rate': "Services de lits à jour",
    'prealert_answered_rate': "Pré-alertes avec réponse de l'hôpital",
    'escalated_alerts': "Alertes critiques relancées par SMS",
}

UNITS = {
    'response_minutes': 'min',
    'assign_minutes': 'min',
    'blood_fulfilled_rate': '%',
    'bed_freshness_rate': '%',
    'prealert_answered_rate': '%',
    'escalated_alerts': '',
}


def _status(key, value):
    if value is None:
        return 'no_data'
    target, alert, direction = getattr(settings, 'KPI_TARGETS', {}).get(key, DEFAULT_TARGETS[key])
    if direction == 'max':
        return 'ok' if value <= target else 'warning' if value <= alert else 'critical'
    return 'ok' if value >= target else 'warning' if value >= alert else 'critical'


def _median_minutes(pairs):
    values = [(end - start).total_seconds() / 60 for start, end in pairs if start and end]
    return round(statistics.median(values), 1) if values else None


def network_kpis(*, days=7, region=None, now=None):
    """Indicateurs sur les ``days`` derniers jours (``region`` : une région seulement)."""
    from ambulances.models import Mission
    from lits.models import BedCapacity, freshness_of
    from realtime.models import CriticalAlert
    from sang.models import BloodRequest

    now = now or timezone.now()
    since = now - timedelta(days=days)

    missions = Mission.objects.filter(created_at__gte=since)
    requests = BloodRequest.objects.filter(created_at__gte=since, status__in=['fulfilled', 'cancelled'])
    capacities = BedCapacity.objects.filter(facility__is_active=True)
    alerts = CriticalAlert.objects.filter(created_at__gte=since)
    if region:
        missions = missions.filter(region=region)
        requests = requests.filter(facility__region=region)
        capacities = capacities.filter(facility__region=region)
        alerts = alerts.filter(region=region)

    closed = requests.count()
    fulfilled = requests.filter(status='fulfilled').count()
    services = list(capacities.values_list('confirmed_at', flat=True))
    with_destination = missions.exclude(destination_status='')
    answered = with_destination.filter(destination_status__in=['accepted', 'refused']).count()

    values = {
        'response_minutes': _median_minutes(missions.values_list('created_at', 'on_site_at')),
        'assign_minutes': _median_minutes(missions.values_list('created_at', 'assigned_at')),
        'blood_fulfilled_rate': round(fulfilled / closed, 3) if closed else None,
        'bed_freshness_rate': round(sum(freshness_of(c, now) == 'fresh' for c in services) / len(services), 3)
        if services
        else None,
        'prealert_answered_rate': round(answered / with_destination.count(), 3) if with_destination.exists() else None,
        'escalated_alerts': alerts.filter(escalation_level__gt=0).count(),
    }
    targets = getattr(settings, 'KPI_TARGETS', {})
    return {
        'days': days,
        'region': region,
        'generated_at': now,
        'volumes': {
            'missions': missions.count(),
            'missions_completed': missions.filter(status='completed').count(),
            'blood_requests_closed': closed,
            'blood_units_collected': sum(requests.values_list('units_collected', flat=True)),
            'transfers': missions.filter(source='transfer').count(),
            'sos': missions.filter(source='sos').count(),
            'incidents': missions.exclude(incident=None).values('incident').distinct().count(),
            'late_missions': missions.filter(on_site_at__gt=F('created_at') + timedelta(minutes=30)).count(),
        },
        'indicators': [
            {
                'key': key,
                'label': LABELS[key],
                'value': value,
                'unit': UNITS[key],
                'target': targets.get(key, DEFAULT_TARGETS[key])[0],
                'status': _status(key, value),
            }
            for key, value in values.items()
        ],
    }
