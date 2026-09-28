"""
Commande Django : génération de l'historique simulé des stocks.

Usage :
    python manage.py generate_training_data
    python manage.py generate_training_data --days 365 --seed 7
    python manage.py generate_training_data --clear

``--clear`` ne supprime que les données simulées : les données importées
ou saisies ne sont jamais touchées.

Auteur : El Hadji Massogui Diop
"""

from django.core.management.base import BaseCommand, CommandError

from ml.models import BloodStockRecord
from ml.services.data_generator import BloodDataGenerator


class Command(BaseCommand):
    help = "Génère un historique simulé de stock sanguin (données d'entraînement)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=730,
            help="Profondeur d'historique en jours (défaut : 730 = 2 ans).",
        )
        parser.add_argument(
            '--seed',
            type=int,
            default=42,
            help="Graine aléatoire pour la reproductibilité (défaut : 42).",
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help="Supprimer d'abord les données simulées existantes.",
        )

    def handle(self, *args, **options):
        days = options['days']
        if not 60 <= days <= 3650:
            raise CommandError("--days doit être compris entre 60 et 3650.")

        if options['clear']:
            deleted, _ = BloodStockRecord.objects.filter(
                source=BloodStockRecord.Source.SYNTHETIC
            ).delete()
            self.stdout.write(self.style.WARNING(
                f"  {deleted} enregistrement(s) simulé(s) supprimé(s)."
            ))

        generator = BloodDataGenerator(seed=options['seed'])
        df = generator.generate(days=days)
        self.stdout.write(
            f"  Simulation : {len(df)} lignes, "
            f"{df['center_name'].nunique()} centres, "
            f"{df['region'].nunique()} régions, "
            f"{df['blood_group'].nunique()} groupes sanguins."
        )

        created = generator.save_to_db(df)
        skipped = len(df) - created
        message = f"  {created} enregistrement(s) créé(s)"
        if skipped:
            message += f", {skipped} déjà présent(s) ignoré(s)"
        self.stdout.write(self.style.SUCCESS(message + '.'))
