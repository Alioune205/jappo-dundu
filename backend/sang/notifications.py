"""
Diffusion temps réel des événements du module Sang.

- Alertes (``/ws/alerts/``, flux national, régional et de l'hôpital) :
  création, mise à jour et clôture d'une demande. Ces messages atteignent
  les donneurs : ils ne contiennent aucune donnée personnelle.
- Tableau de bord (``/ws/dashboard/``) : les mêmes événements, plus les
  réponses des donneurs (compteurs uniquement).

Les messages partent après validation de la transaction (``on_commit``).

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import transaction
from django.db.models import Count, Q

from push.services import notify_blood_request as notify_push
from realtime.broadcast import broadcast_alert, broadcast_dashboard

from .models import DonorResponse

REQUEST_CREATED = 'blood_request_created'
REQUEST_UPDATED = 'blood_request_updated'
REQUEST_CLOSED = 'blood_request_closed'
RESPONSE_UPDATED = 'blood_response_updated'


def request_payload(blood_request, event):
    facility = blood_request.facility
    return {
        'event': event,
        'request_id': blood_request.pk,
        'blood_group': blood_request.blood_group,
        'units_needed': blood_request.units_needed,
        'units_remaining': blood_request.units_remaining,
        'urgency': blood_request.urgency,
        'status': blood_request.status,
        'needed_by': blood_request.needed_by,
        'facility': {
            'id': facility.pk,
            'name': facility.name,
            'city': facility.city,
            'region': facility.region,
            'latitude': facility.latitude,
            'longitude': facility.longitude,
        },
    }


def notify_request(blood_request, event):
    """Annonce une demande (création, mise à jour, clôture) aux donneurs et au tableau de bord."""
    payload = request_payload(blood_request, event)
    region = blood_request.facility.region
    hospital_id = blood_request.facility_id

    def send():
        broadcast_alert('blood', payload, region=region, hospital_id=hospital_id)
        broadcast_dashboard('dashboard', payload, hospital_id=hospital_id)
        if event == REQUEST_CREATED:
            # Notification push aux donneurs compatibles à portée (application
            # mobile) : ils sont prévenus même application fermée.
            notify_push(blood_request)

    transaction.on_commit(send)


def notify_response(response):
    """Met à jour les compteurs de réponses sur le tableau de bord de l'hôpital."""
    blood_request = response.blood_request
    counts = DonorResponse.objects.filter(blood_request=blood_request).aggregate(
        **{
            f'{status}_count': Count('id', filter=Q(status=status))
            for status in DonorResponse.Status.values
        }
    )
    payload = {
        'event': RESPONSE_UPDATED,
        'request_id': blood_request.pk,
        'response_id': response.pk,
        'response_status': response.status,
        'units_remaining': blood_request.units_remaining,
        'counts': counts,
    }
    hospital_id = blood_request.facility_id
    transaction.on_commit(
        lambda: broadcast_dashboard('dashboard', payload, hospital_id=hospital_id)
    )
