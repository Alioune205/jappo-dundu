"""
Photographie du réseau envoyée au modèle de langage avec la question.

Uniquement des données agrégées ou institutionnelles : établissements, lits
par service, demandes de sang (groupe, urgence, poches), flotte et missions
par statut. Jamais de nom, de téléphone ni d'adresse de patient, de donneur
ou d'appelant : ces données partent chez un fournisseur externe (Gemini, Grok).
"""

from collections import Counter

from ambulances.models import Ambulance, Mission
from lits.models import BedCapacity
from sang.models import BloodRequest
from users.models import HealthFacility


def network_snapshot():
    """Situation actuelle des établissements actifs, sous forme de dictionnaire JSON."""
    facilities = HealthFacility.objects.filter(is_active=True).order_by('name')
    capacities = BedCapacity.objects.filter(facility__is_active=True).select_related('facility')
    requests = BloodRequest.objects.filter(status=BloodRequest.Status.OPEN).select_related('facility')
    ambulances = Ambulance.objects.filter(facility__is_active=True).select_related('facility')

    def services_of(facility):
        return [
            {
                'service': c.get_category_display(),
                'lits_total': c.total_beds,
                'lits_occupes': c.occupied_beds,
                'lits_reserves': c.reserved_beds,
                'lits_libres': c.available_beds,
            }
            for c in capacities
            if c.facility_id == facility.id
        ]

    def requests_of(facility):
        return [
            {
                'groupe': r.blood_group,
                'urgence': r.get_urgency_display(),
                'poches_demandees': r.units_needed,
                'poches_manquantes': r.units_remaining,
            }
            for r in requests
            if r.facility_id == facility.id
        ]

    def fleet_of(facility):
        statuses = Counter(a.get_status_display() for a in ambulances if a.facility_id == facility.id)
        return dict(statuses)

    missions = Mission.objects.exclude(status__in=[Mission.Status.COMPLETED, Mission.Status.CANCELLED])
    return {
        'etablissements': [
            {
                'nom': f.name,
                'type': f.get_facility_type_display(),
                'ville': f.city,
                'region': f.get_region_display(),
                'services': services_of(f),
                'demandes_de_sang_ouvertes': requests_of(f),
                'ambulances': fleet_of(f),
            }
            for f in facilities
        ],
        'missions_en_cours': {
            'par_statut': dict(Counter(m.get_status_display() for m in missions)),
            'par_priorite': dict(Counter(m.get_priority_display() for m in missions)),
        },
    }
