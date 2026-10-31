"""
Commande Django : tâches planifiées de la plateforme, en une seule ligne cron.

Usage (cron du serveur, chaque minute) :
    python manage.py run_scheduled_tasks

Chaque minute : relance des alertes critiques, vagues d'alertes aux
donneurs, expiration des réservations de lits. Chaque heure (minute 0) :
rappel des chiffres de lits périmés. Chaque jour à 9 h : rappel « vous
pouvez de nouveau donner ». Une tâche en échec n'empêche pas les suivantes.
"""

import logging

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('jappo_dundu')

EVERY_MINUTE = ('escalate_critical_alerts', 'escalate_blood_alerts', 'expire_bed_reservations')
HOURLY = ('remind_stale_beds',)
DAILY_AT_9 = ('remind_eligible_donors',)


class Command(BaseCommand):
    help = "Lance les tâches planifiées dues (à appeler chaque minute)."

    def handle(self, *args, **options):
        now = timezone.localtime()
        due = list(EVERY_MINUTE)
        if now.minute == 0:
            due.extend(HOURLY)
            if now.hour == 9:
                due.extend(DAILY_AT_9)
        for name in due:
            try:
                call_command(name, stdout=self.stdout)
            except Exception:  # noqa: BLE001 — une tâche en échec ne bloque pas les autres
                logger.exception("Tâche planifiée en échec : %s", name)
