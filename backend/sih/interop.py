"""
Interopérabilité sortante : FHIR, DHIS2, webhooks, supervision des flux.

- ``fhir_bed_bundle`` : capacités en lits au format FHIR R4 (``MeasureReport``,
  inspiré du profil SANER « Hospital Beds » : lits installés, occupés,
  disponibles) ;
- ``dhis2_data_values`` : agrégats hebdomadaires au format ``dataValueSets``
  de DHIS2 (identifiants des éléments de données à fixer dans
  ``DHIS2_DATA_ELEMENTS`` avec la direction des statistiques sanitaires) ;
- ``dispatch_webhook`` : notifie le logiciel d'un établissement (pré-alerte,
  commande critique…), corps signé HMAC-SHA256 (en-tête ``X-JappoDundu-Signature``) ;
- ``sync_monitoring`` : établissements reliés par clé SIH et fraîcheur de
  leur dernière synchronisation réussie.
"""

import hashlib
import hmac
import json
import logging
import threading
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.db.models import Max, Q, Sum
from django.utils import timezone

logger = logging.getLogger('jappo_dundu.sih')

DEFAULT_DHIS2_ELEMENTS = {
    'beds_total': 'JD_BEDS_TOTAL',
    'beds_occupied': 'JD_BEDS_OCCUPIED',
    'missions': 'JD_AMB_MISSIONS',
    'blood_units_collected': 'JD_BLOOD_UNITS',
}
SYNC_STALE_HOURS = 6


def _measure_report(facility, capacities, now):
    total = sum(c.total_beds for c in capacities)
    occupied = sum(c.occupied_beds for c in capacities)
    available = sum(c.available_beds for c in capacities)
    return {
        'resourceType': 'MeasureReport',
        'id': f'jd-beds-{facility.pk}-{now:%Y%m%d%H%M}',
        'status': 'complete',
        'type': 'summary',
        'measure': 'http://hl7.org/fhir/uv/saner/Measure/CDCPatientImpactAndHospitalCapacity',
        'subject': {'identifier': {'system': 'urn:jappodundu:facility', 'value': str(facility.pk)}, 'display': facility.name},
        'date': now.isoformat(),
        'period': {'start': now.isoformat(), 'end': now.isoformat()},
        'group': [
            {
                'code': {'coding': [{'system': 'urn:jappodundu:bed-service', 'code': 'all', 'display': 'Tous services'}]},
                'population': [
                    {'code': {'text': 'numTotBeds'}, 'count': total},
                    {'code': {'text': 'numBedsOcc'}, 'count': occupied},
                    {'code': {'text': 'numBedsAvail'}, 'count': available},
                ],
            },
            *[
                {
                    'code': {
                        'coding': [
                            {
                                'system': 'urn:jappodundu:bed-service',
                                'code': c.category,
                                'display': c.get_category_display(),
                            }
                        ]
                    },
                    'population': [
                        {'code': {'text': 'numTotBeds'}, 'count': c.total_beds},
                        {'code': {'text': 'numBedsOcc'}, 'count': c.occupied_beds},
                        {'code': {'text': 'numBedsAvail'}, 'count': c.available_beds},
                    ],
                }
                for c in capacities
            ],
        ],
    }


def fhir_bed_bundle(facilities):
    """Bundle FHIR R4 : un MeasureReport par établissement."""
    from lits.models import BedCapacity

    now = timezone.now()
    entries = []
    for facility in facilities:
        capacities = list(BedCapacity.objects.filter(facility=facility).order_by('category'))
        if capacities:
            entries.append({'resource': _measure_report(facility, capacities, now)})
    return {'resourceType': 'Bundle', 'type': 'collection', 'timestamp': now.isoformat(), 'entry': entries}


def iso_week(day):
    year, week, _ = day.isocalendar()
    return f'{year}W{week}'


def dhis2_data_values(facilities, *, days=7):
    """dataValueSets DHIS2 pour la période ISO de la semaine écoulée (unité d'organisation = établissement)."""
    from ambulances.models import Mission
    from lits.models import BedCapacity
    from sang.models import BloodRequest

    elements = getattr(settings, 'DHIS2_DATA_ELEMENTS', DEFAULT_DHIS2_ELEMENTS)
    since = timezone.now() - timedelta(days=days)
    period = iso_week(timezone.localdate())
    values = []
    for facility in facilities:
        # Identifiant DHIS2 de l'établissement (DHIS2_ORG_UNITS), sinon un code provisoire.
        org_unit = getattr(settings, 'DHIS2_ORG_UNITS', {}).get(facility.pk, f'JD{facility.pk}')
        beds = BedCapacity.objects.filter(facility=facility).aggregate(t=Sum('total_beds'), o=Sum('occupied_beds'))
        figures = {
            'beds_total': beds['t'] or 0,
            'beds_occupied': beds['o'] or 0,
            'missions': Mission.objects.filter(destination=facility, created_at__gte=since).count(),
            'blood_units_collected': BloodRequest.objects.filter(facility=facility, created_at__gte=since).aggregate(
                u=Sum('units_collected')
            )['u']
            or 0,
        }
        values.extend(
            {'dataElement': elements[key], 'period': period, 'orgUnit': org_unit, 'value': str(value)}
            for key, value in figures.items()
        )
    return {'dataValues': values}


def sign(secret, body):
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _post(url, body, signature):
    request = urllib.request.Request(
        url,
        data=body,
        method='POST',
        headers={'Content-Type': 'application/json', 'X-JappoDundu-Signature': f'sha256={signature}'},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("Webhook %s en échec : %s", url, exc)
        return 0


def dispatch_webhook(facility, event, payload):
    """Envoie l'événement aux webhooks actifs de l'établissement (thread : jamais bloquant)."""
    from .models import Webhook

    hooks = list(Webhook.objects.filter(facility=facility, is_active=True))
    hooks = [hook for hook in hooks if not hook.events or event in hook.events]
    if not hooks:
        return 0
    body = json.dumps({'event': event, 'sent_at': timezone.now().isoformat(), 'data': payload}, default=str).encode()

    def deliver():
        for hook in hooks:
            status = _post(hook.url, body, sign(hook.secret, body))
            Webhook.objects.filter(pk=hook.pk).update(last_status=status, last_delivery_at=timezone.now())

    if getattr(settings, 'WEBHOOKS_ASYNC', True):
        threading.Thread(target=deliver, daemon=True).start()
    else:
        deliver()
    return len(hooks)


def sync_monitoring(now=None):
    """Établissements reliés par une clé SIH active, avec l'âge de leur dernière synchronisation réussie."""
    from users.models import HealthFacility

    from .models import HospitalSyncLog

    now = now or timezone.now()
    facilities = (
        HealthFacility.objects.filter(sih_api_keys__is_active=True)
        .annotate(
            last_success=Max(
                'sih_sync_logs__created_at', filter=Q(sih_sync_logs__status=HospitalSyncLog.Status.SUCCESS)
            )
        )
        .distinct()
        .order_by('name')
    )
    rows = []
    for facility in facilities:
        age = (now - facility.last_success).total_seconds() / 3600 if facility.last_success else None
        rows.append(
            {
                'facility': {'id': facility.pk, 'name': facility.name, 'region': facility.region},
                'last_success': facility.last_success,
                'hours_since': round(age, 1) if age is not None else None,
                'stale': age is None or age > SYNC_STALE_HOURS,
            }
        )
    return rows
