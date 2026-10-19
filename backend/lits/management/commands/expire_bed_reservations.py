"""
Commande Django : expire les réservations de lits échues.

Usage (planifiable, par exemple toutes les 5 minutes) :
    python manage.py expire_bed_reservations

Facultative : l'API expire déjà les réservations échues avant chaque lecture
ou écriture qui en dépend. La commande garde les compteurs à jour même sans
trafic, et donc les indicateurs diffusés en temps réel.
"""

from django.core.management.base import BaseCommand

from lits.services import release_expired


class Command(BaseCommand):
    help = "Expire les réservations de lits dont le délai est écoulé."

    def handle(self, *args, **options):
        count = release_expired()
        self.stdout.write(self.style.SUCCESS(f"Réservations expirées : {count}"))
