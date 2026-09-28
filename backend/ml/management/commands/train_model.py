"""
Commande Django : entraînement, évaluation et activation du modèle ML.

Usage :
    python manage.py train_model
    python manage.py train_model --model-version 2.0.0
    python manage.py train_model --source import     # données réelles seules

Auteur : El Hadji Massogui Diop
"""

from django.core.management.base import BaseCommand, CommandError

from ml.models import BloodStockRecord
from ml.services.trainer import BloodShortageTrainer


class Command(BaseCommand):
    help = "Entraîne le modèle de prévision des pénuries de sang et l'active."

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-iter', '--estimators',
            dest='max_iter',
            type=int,
            default=300,
            help="Itérations maximales de boosting (défaut : 300).",
        )
        parser.add_argument(
            '--test-fraction', '--test-size',
            dest='test_fraction',
            type=float,
            default=0.2,
            help="Part finale de l'historique réservée au test (défaut : 0.2).",
        )
        parser.add_argument(
            '--model-version',
            default=None,
            help="Version du modèle (défaut : horodatage).",
        )
        parser.add_argument(
            '--source',
            action='append',
            choices=BloodStockRecord.Source.values,
            help="Limiter l'entraînement à une ou plusieurs sources de données.",
        )
        parser.add_argument('--seed', type=int, default=42)

    def handle(self, *args, **options):
        if options['max_iter'] < 10:
            raise CommandError("--max-iter doit être au moins 10.")

        try:
            trainer = BloodShortageTrainer(
                max_iter=options['max_iter'],
                test_fraction=options['test_fraction'],
                seed=options['seed'],
            )
            self.stdout.write("  Chargement des données et entraînement...")
            metrics = trainer.train(trainer.load_data_from_db(options['source']))
            metadata = trainer.save_model(version=options['model_version'])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self._report(metrics))
        self.stdout.write(self.style.SUCCESS(
            f"  Modèle v{metadata.version} entraîné et activé "
            f"({metadata.model_file_path})."
        ))

    @staticmethod
    def _report(metrics):
        def pct(value):
            return 'n/a' if value is None else f"{100 * value:.1f} %"

        lines = [
            '',
            f"  Période de test : à partir du {metrics['test_period_start']} "
            f"({metrics['test_samples']} exemples)",
            f"  MAE              : {metrics['mae']} poches "
            f"(baseline persistance : {metrics['baseline_mae']})",
            f"  Gain vs baseline : {pct(metrics['skill_vs_baseline'])}",
            f"  RMSE / R²        : {metrics['rmse']} / {metrics['r2_score']}",
            f"  Couverture P10-P90 (cible 80 %) : {pct(metrics['interval_coverage'])} "
            f"(avant calibration : {pct(metrics['interval_coverage_uncalibrated'])})",
            f"  Exactitude du niveau de risque : {pct(metrics['risk_accuracy'])} "
            f"(baseline : {pct(metrics['baseline_risk_accuracy'])})",
            f"  Pénuries détectées (rappel)    : {pct(metrics['critical_recall'])} "
            f"(baseline : {pct(metrics['baseline_critical_recall'])})",
            f"  Alertes critiques fondées      : {pct(metrics['critical_precision'])}",
            '  Par horizon : MAE (baseline) | exactitude du risque (baseline)',
        ]
        lines += [
            f"    {bucket:>5} j : {values['mae']} ({values['baseline_mae']}) | "
            f"{pct(values['risk_accuracy'])} ({pct(values['baseline_risk_accuracy'])})"
            for bucket, values in metrics['by_horizon'].items()
        ]
        return '\n'.join(lines) + '\n'
