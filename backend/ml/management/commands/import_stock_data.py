"""
Commande Django : import de l'historique réel des stocks (CSV).

Usage :
    python manage.py import_stock_data stocks_cnts.csv --dry-run
    python manage.py import_stock_data stocks_cnts.csv

Le format du fichier est décrit dans ml/services/importer.py et
ml/README.md.

Auteur : El Hadji Massogui Diop
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ml.models import BloodStockRecord
from ml.services.importer import (
    ImportValidationError,
    import_rows,
    read_stock_csv,
    summarize,
)


class Command(BaseCommand):
    help = "Importe un historique de stock sanguin depuis un fichier CSV."

    def add_arguments(self, parser):
        parser.add_argument('path', help="Chemin du fichier CSV.")
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Valider le fichier sans rien enregistrer.",
        )

    def handle(self, *args, **options):
        path = Path(options['path'])
        if not path.is_file():
            raise CommandError(f"Fichier introuvable : {path}")

        try:
            rows = read_stock_csv(path)
        except ImportValidationError as exc:
            for error in exc.errors:
                self.stderr.write(f"  {error}")
            raise CommandError(f"Import annulé : {exc}") from exc
        except UnicodeDecodeError as exc:
            raise CommandError(
                "Encodage non supporté : enregistrez le fichier en UTF-8."
            ) from exc

        info = summarize(rows)
        self.stdout.write(
            f"  {info['rows']} ligne(s) valide(s), {info['centers']} centre(s), "
            f"du {info['first_date']} au {info['last_date']}."
        )
        if options['dry_run']:
            self.stdout.write(self.style.WARNING("  Validation seule : rien n'a été enregistré."))
            return

        count = import_rows(rows, source=BloodStockRecord.Source.IMPORT)
        self.stdout.write(self.style.SUCCESS(
            f"  {count} ligne(s) importée(s) ou mise(s) à jour."
        ))
