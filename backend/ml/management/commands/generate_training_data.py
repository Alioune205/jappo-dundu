"""
Commande Django : Génération des données d'entraînement.

Usage :
    python manage.py generate_training_data
    python manage.py generate_training_data --days 365
    python manage.py generate_training_data --clear

Auteur : El Hadji Massogui Diop
"""

from django.core.management.base import BaseCommand

from ml.models import BloodStockRecord
from ml.services.data_generator import BloodDataGenerator


class Command(BaseCommand):
    help = (
        "Génère des données synthétiques réalistes de stock sanguin "
        "pour l'entraînement du modèle ML."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=730,
            help="Nombre de jours de données à générer (défaut : 730 = 2 ans).",
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
            help="Supprimer les données existantes avant la génération.",
        )

    def handle(self, *args, **options):
        days = options['days']
        seed = options['seed']
        clear = options['clear']

        if clear:
            count, _ = BloodStockRecord.objects.all().delete()
            self.stdout.write(
                self.style.WARNING(
                    f"  {count} enregistrements existants supprimés."
                )
            )

        self.stdout.write(
            self.style.HTTP_INFO(
                f"\n{'='*60}\n"
                f"  Jappo Dundu — Génération de données d'entraînement\n"
                f"{'='*60}\n"
                f"  Jours : {days}\n"
                f"  Seed  : {seed}\n"
            )
        )

        # Générer les données
        generator = BloodDataGenerator(seed=seed)
        df = generator.generate(days=days)

        self.stdout.write(
            f"  Données générées : {len(df)} enregistrements\n"
            f"  Centres          : {df['center_name'].nunique()}\n"
            f"  Régions          : {df['region'].nunique()}\n"
            f"  Groupes sanguins : {df['blood_group'].nunique()}\n"
        )

        # Sauvegarder en base
        self.stdout.write("  Sauvegarde en base de données...")
        count = generator.save_to_db(df)

        self.stdout.write(
            self.style.SUCCESS(
                f"\n  [SUCCES] {count} enregistrements sauvegardés avec succès !\n"
                f"{'='*60}\n"
            )
        )
