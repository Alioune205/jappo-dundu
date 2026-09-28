"""
Commande Django : calcul et diffusion des prédictions de pénurie.

À planifier chaque jour après la mise à jour des stocks (cron, tâche
planifiée), par exemple à 6 h :
    0 6 * * *  docker compose exec -T web python manage.py predict_shortages

Usage :
    python manage.py predict_shortages
    python manage.py predict_shortages --days-ahead 14 --region dakar

Auteur : El Hadji Massogui Diop
"""

from django.core.management.base import BaseCommand, CommandError

from ml.constants import BLOOD_GROUP_CODES, REGION_CODES
from ml.services.predictor import MAX_DAYS_AHEAD, BloodShortagePredictor
from ml.services.registry import ModelNotAvailableError


class Command(BaseCommand):
    help = "Calcule les prédictions de stock et diffuse les alertes de pénurie."

    def add_arguments(self, parser):
        parser.add_argument('--days-ahead', type=int, default=7)
        parser.add_argument('--region', choices=REGION_CODES)
        parser.add_argument('--blood-group', choices=BLOOD_GROUP_CODES)
        parser.add_argument(
            '--no-notify',
            action='store_true',
            help="Ne pas diffuser les résultats en temps réel.",
        )

    def handle(self, *args, **options):
        days_ahead = options['days_ahead']
        if not 1 <= days_ahead <= MAX_DAYS_AHEAD:
            raise CommandError(f"--days-ahead doit être compris entre 1 et {MAX_DAYS_AHEAD}.")

        try:
            run = BloodShortagePredictor().predict_and_save(
                region=options['region'],
                blood_group=options['blood_group'],
                days_ahead=days_ahead,
                notify=not options['no_notify'],
            )
        except ModelNotAvailableError as exc:
            raise CommandError(str(exc)) from exc

        summary = ', '.join(f"{level}={n}" for level, n in run.risk_summary().items())
        self.stdout.write(self.style.SUCCESS(
            f"  {run.count} prédictions (modèle v{run.model_version}) : {summary}."
        ))
        if run.skipped_series:
            self.stdout.write(self.style.WARNING(
                f"  {run.skipped_series} série(s) ignorée(s) : données trop "
                "anciennes ou historique trop court."
            ))
