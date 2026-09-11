"""
Commande Django : Entraînement du modèle ML.

Usage :
    python manage.py train_model
    python manage.py train_model --estimators 300
    python manage.py train_model --version 2.0.0

Auteur : El Hadji Massogui Diop
"""

from django.core.management.base import BaseCommand

from ml.services.trainer import BloodShortageTrainer


class Command(BaseCommand):
    help = (
        "Entraîne le modèle ML de prédiction des pénuries de sang "
        "sur les données historiques."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--estimators',
            type=int,
            default=200,
            help="Nombre d'arbres du RandomForest (défaut : 200).",
        )
        parser.add_argument(
            '--test-size',
            type=float,
            default=0.2,
            help="Proportion des données de test (défaut : 0.2).",
        )
        parser.add_argument(
            '--model-version',
            type=str,
            default=None,
            help="Version du modèle (défaut : timestamp automatique).",
        )

    def handle(self, *args, **options):
        n_estimators = options['estimators']
        test_size = options['test_size']
        version = options['model_version']

        self.stdout.write(
            self.style.HTTP_INFO(
                f"\n{'='*60}\n"
                f"  Jappo Dundu — Entraînement du modèle ML\n"
                f"{'='*60}\n"
                f"  Algorithme   : RandomForestRegressor\n"
                f"  Estimateurs  : {n_estimators}\n"
                f"  Test size    : {test_size}\n"
            )
        )

        trainer = BloodShortageTrainer()

        try:
            # Entraînement
            self.stdout.write("  Chargement des données...")
            metrics = trainer.train(
                n_estimators=n_estimators,
                test_size=test_size,
            )

            self.stdout.write(
                f"\n  [RESULTATS] :\n"
                f"  ---------------------------------\n"
                f"  MAE      : {metrics['mae']}\n"
                f"  RMSE     : {metrics['rmse']}\n"
                f"  R2       : {metrics['r2_score']}\n"
                f"  CV R2    : {metrics.get('cv_r2_mean', 'N/A')} "
                f"(+/-{metrics.get('cv_r2_std', 'N/A')})\n"
                f"  Echantillons train : {metrics['training_samples']}\n"
                f"  Echantillons test  : {metrics['test_samples']}\n"
            )

            # Sauvegarde
            self.stdout.write("  Sauvegarde du modèle...")
            model_path = trainer.save_model(version=version)

            self.stdout.write(
                self.style.SUCCESS(
                    f"\n  [SUCCES] Modèle entraîné et sauvegardé avec succès !\n"
                    f"  [FICHIER] : {model_path}\n"
                    f"{'='*60}\n"
                )
            )

        except ValueError as exc:
            self.stdout.write(
                self.style.ERROR(
                    f"\n  [ERREUR] : {exc}\n"
                    f"  [INFO] Exécutez d'abord : "
                    f"python manage.py generate_training_data\n"
                    f"{'='*60}\n"
                )
            )
        except Exception as exc:
            self.stdout.write(
                self.style.ERROR(
                    f"\n  [ERREUR] inattendue : {exc}\n"
                    f"{'='*60}\n"
                )
            )
            raise
