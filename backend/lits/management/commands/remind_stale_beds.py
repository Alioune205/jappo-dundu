"""
Commande Django : rappelle aux établissements les services dont les chiffres
de lits n'ont pas été confirmés depuis ``BED_STALE_MINUTES`` (12 h par défaut).

Usage (à planifier, par exemple toutes les heures) :
    python manage.py remind_stale_beds

Un lit « libre » non confirmé depuis des heures peut envoyer une ambulance au
mauvais endroit : le rappel invite le personnel à confirmer ou corriger.
"""

from django.core.management.base import BaseCommand

from lits.services import remind_stale


class Command(BaseCommand):
    help = "Alerte les établissements dont les chiffres de lits sont périmés."

    def handle(self, *args, **options):
        count = remind_stale()
        self.stdout.write(self.style.SUCCESS(f"Services à reconfirmer : {count}"))
