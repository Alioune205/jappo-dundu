"""
Commande Django : relance par SMS les alertes critiques sans accusé de réception.

Usage (à planifier chaque minute) :
    python manage.py escalate_critical_alerts

Voir realtime/escalation.py (ligne de garde, puis administrateur général).
"""

from django.core.management.base import BaseCommand

from realtime.escalation import escalate


class Command(BaseCommand):
    help = "Relance par SMS les alertes critiques restées sans accusé de réception."

    def handle(self, *args, **options):
        count = escalate()
        self.stdout.write(self.style.SUCCESS(f"Alertes relancées : {count}"))
