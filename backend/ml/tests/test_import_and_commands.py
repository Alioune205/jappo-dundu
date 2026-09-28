"""
Tests de l'import CSV et des commandes de gestion ML.

Auteur : El Hadji Massogui Diop
"""

import tempfile
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import TestCase
from django.utils import timezone

from ml.models import BloodStockRecord
from ml.services.importer import ImportValidationError, normalize_region, read_stock_csv

from .helpers import TemporaryModelDirMixin

HEADER = 'center_name;region;blood_group;date;units_available;units_donated;units_used;units_expired'


class CsvFileMixin:

    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

    def write_csv(self, *lines, bom=True):
        path = Path(self._tmp.name) / 'stocks.csv'
        path.write_text('\n'.join(lines) + '\n', encoding='utf-8-sig' if bom else 'utf-8')
        return path

    def import_file(self, path, *args):
        call_command('import_stock_data', str(path), *args, stdout=StringIO(), stderr=StringIO())


class ImporterTests(CsvFileMixin, TestCase):

    def test_region_normalization(self):
        for value in ('Thiès', 'thies', 'THIES', ' thiès '):
            self.assertEqual(normalize_region(value), 'thies')
        self.assertEqual(normalize_region('Saint Louis'), 'saint_louis')
        self.assertIsNone(normalize_region('Atlantis'))

    def test_excel_style_file_is_imported(self):
        path = self.write_csv(
            HEADER,
            'CNTS Dakar;Dakar;O+;2026-09-01;84;12;10;0',
            'CTS Thiès;Thiès;ab-;02/09/2026;3;;;',
        )
        self.import_file(path)
        self.assertEqual(BloodStockRecord.objects.count(), 2)
        record = BloodStockRecord.objects.get(center_name='CTS Thiès')
        self.assertEqual(
            (record.region, record.blood_group, record.date, record.units_donated),
            ('thies', 'AB-', date(2026, 9, 2), 0),
        )
        self.assertEqual(record.source, 'import')

    def test_reimport_updates_existing_rows(self):
        self.import_file(self.write_csv(HEADER, 'CNTS Dakar;dakar;O+;2026-09-01;84;12;10;0'))
        self.import_file(self.write_csv(HEADER, 'CNTS Dakar;dakar;O+;2026-09-01;80;12;14;0'))
        record = BloodStockRecord.objects.get()
        self.assertEqual((record.units_available, record.units_used), (80, 14))

    def test_invalid_rows_are_reported_with_line_numbers(self):
        future = (timezone.localdate() + timedelta(days=3)).isoformat()
        path = self.write_csv(
            HEADER,
            'CNTS Dakar;Atlantis;O+;2026-09-01;84;1;1;0',
            'CNTS Dakar;dakar;Z+;2026-09-01;84;1;1;0',
            'CNTS Dakar;dakar;O+;2026-13-45;84;1;1;0',
            f'CNTS Dakar;dakar;O+;{future};84;1;1;0',
            'CNTS Dakar;dakar;A+;2026-09-01;-4;1;1;0',
            'CNTS Dakar;dakar;B+;2026-09-01;;1;1;0',
            'CNTS Dakar;dakar;O-;2026-09-01;5;1;1;0',
            'CNTS Dakar;dakar;O-;2026-09-01;6;1;1;0',
            'CNTS Dakar;thies;AB+;2026-09-01;5;1;1;0',
        )
        with self.assertRaises(ImportValidationError) as context:
            read_stock_csv(path)
        errors = '\n'.join(context.exception.errors)
        for line, fragment in (
            (2, 'région inconnue'), (3, 'groupe sanguin inconnu'), (4, 'date invalide'),
            (5, 'date future'), (6, 'positif'), (7, 'obligatoire'), (9, 'doublon'),
            (10, 'déjà rattaché'),
        ):
            self.assertIn(f'Ligne {line} :', errors)
            self.assertIn(fragment, errors)

    def test_invalid_file_imports_nothing(self):
        path = self.write_csv(
            HEADER,
            'CNTS Dakar;dakar;O+;2026-09-01;84;1;1;0',
            'CNTS Dakar;dakar;O+;not-a-date;84;1;1;0',
        )
        with self.assertRaises(CommandError):
            self.import_file(path)
        self.assertEqual(BloodStockRecord.objects.count(), 0)

    def test_missing_columns(self):
        path = self.write_csv('center_name,region,date', 'CNTS Dakar,dakar,2026-09-01')
        with self.assertRaisesMessage(ImportValidationError, '1 erreur'):
            read_stock_csv(path)

    def test_dry_run_writes_nothing(self):
        self.import_file(self.write_csv(HEADER, 'CNTS Dakar;dakar;O+;2026-09-01;84;1;1;0'), '--dry-run')
        self.assertEqual(BloodStockRecord.objects.count(), 0)

    def test_missing_file(self):
        with self.assertRaises(CommandError):
            self.import_file(Path(self._tmp.name) / 'absent.csv')


class CommandTests(TemporaryModelDirMixin, TestCase):

    def test_clear_only_removes_synthetic_data(self):
        BloodStockRecord.objects.create(
            center_name='CNTS Dakar', region='dakar', blood_group='O+',
            date=date(2020, 1, 1), units_available=10, source='import',
        )
        call_command('generate_training_data', '--days', '60', stdout=StringIO())
        call_command('generate_training_data', '--days', '60', '--clear', stdout=StringIO())
        self.assertEqual(BloodStockRecord.objects.filter(source='import').count(), 1)
        self.assertEqual(BloodStockRecord.objects.filter(source='synthetic').count(), 16 * 8 * 61)

    def test_generate_validates_days(self):
        with self.assertRaises(CommandError):
            call_command('generate_training_data', '--days', '5', stdout=StringIO())

    def test_train_without_data_fails_loudly(self):
        with self.assertRaisesMessage(CommandError, 'Aucune donnée'):
            call_command('train_model', stdout=StringIO())

    def test_predict_without_model_fails_loudly(self):
        with self.assertRaises(CommandError):
            call_command('predict_shortages', stdout=StringIO())

    def test_end_to_end_commands(self):
        call_command('generate_training_data', '--days', '200', stdout=StringIO())
        out = StringIO()
        call_command('train_model', '--max-iter', '20', '--model-version', 'cmd-1', stdout=out)
        self.assertIn('Modèle vcmd-1 entraîné et activé', out.getvalue())
        self.assertIn('baseline', out.getvalue())
        out = StringIO()
        call_command('predict_shortages', '--days-ahead', '3', '--no-notify', stdout=out)
        self.assertIn(f'{16 * 8 * 3} prédictions', out.getvalue())
