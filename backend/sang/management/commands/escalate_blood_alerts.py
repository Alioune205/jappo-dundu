"""
Commande Django : envoie la vague d'alertes suivante des demandes de sang
dont les engagements ne couvrent pas les poches restantes.

Usage (à planifier toutes les 2 minutes) :
    python manage.py escalate_blood_alerts

Voir sang/alerts.py pour les règles (taille des vagues, délais, heures calmes).
"""

from django.core.management.base import BaseCommand

from sang.alerts import escalate_open_requests


class Command(BaseCommand):
    help = "Envoie la vague d'alertes suivante des demandes de sang sans assez de donneurs engagés."

    def handle(self, *args, **options):
        waves = escalate_open_requests()
        self.stdout.write(self.style.SUCCESS(f"Vagues envoyées : {waves}"))
