"""
Commande Django : prévient les donneurs qui peuvent de nouveau donner leur sang.

Usage (à planifier chaque matin) :
    python manage.py remind_eligible_donors
"""

from django.core.management.base import BaseCommand

from sang.reminders import remind_eligible_donors


class Command(BaseCommand):
    help = "Prévient les donneurs redevenus éligibles depuis leur dernier don."

    def handle(self, *args, **options):
        count = remind_eligible_donors()
        self.stdout.write(self.style.SUCCESS(f"Donneurs prévenus : {count}"))
