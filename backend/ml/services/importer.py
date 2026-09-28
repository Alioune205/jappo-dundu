"""
Import de l'historique réel des stocks depuis un fichier CSV.

Format attendu (une ligne par centre, groupe sanguin et jour) :

    center_name;region;blood_group;date;units_available;units_donated;units_used;units_expired
    CNTS Dakar;Dakar;O+;2026-09-01;84;12;10;0

- séparateur ``,``, ``;`` ou tabulation (détecté automatiquement) ;
- encodage UTF-8, avec ou sans BOM (export Excel) ;
- région : code ou libellé, accents facultatifs (« Thiès », « thies ») ;
- date : AAAA-MM-JJ ou JJ/MM/AAAA ;
- colonnes de flux facultatives (0 par défaut).

L'import est tout ou rien : la moindre ligne invalide annule tout et les
erreurs sont rapportées avec leur numéro de ligne. Une ligne déjà
présente (même centre, groupe et date) est mise à jour.

Auteur : El Hadji Massogui Diop
"""

import csv
import unicodedata
from datetime import date, datetime

from django.db import transaction
from django.utils import timezone

from ml.constants import BLOOD_GROUP_CODES, REGION_CODES, REGIONS

REQUIRED_COLUMNS = ('center_name', 'region', 'blood_group', 'date', 'units_available')
OPTIONAL_COLUMNS = ('units_donated', 'units_used', 'units_expired')
UNIQUE_FIELDS = ('center_name', 'blood_group', 'date')
MAX_REPORTED_ERRORS = 50
DATE_FORMATS = ('%Y-%m-%d', '%d/%m/%Y')


class ImportValidationError(Exception):
    """Fichier rejeté ; ``errors`` contient les messages ligne par ligne."""

    def __init__(self, errors):
        super().__init__(f"{len(errors)} erreur(s) dans le fichier.")
        self.errors = errors


def _slug(value):
    ascii_value = (
        unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    )
    return ascii_value.strip().lower().replace('-', '_').replace(' ', '_')


_REGION_LOOKUP = {
    **{code: code for code in REGION_CODES},
    **{_slug(label): code for code, label in REGIONS},
}


def normalize_region(value):
    return _REGION_LOOKUP.get(_slug(value))


def parse_date(value):
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), date_format).date()
        except ValueError:
            continue
    return None


def _parse_count(value, column, errors_for_row, required):
    value = (value or '').strip()
    if not value:
        if required:
            errors_for_row.append(f"'{column}' est obligatoire")
        return 0
    try:
        number = int(value)
    except ValueError:
        errors_for_row.append(f"'{column}' doit être un entier ({value!r})")
        return 0
    if number < 0:
        errors_for_row.append(f"'{column}' doit être positif ou nul")
    return number


def _detect_dialect(sample):
    try:
        return csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        return csv.excel


def read_stock_csv(path, today=None):
    """Lit et valide le fichier ; retourne une liste de dictionnaires.

    Raises:
        ImportValidationError: au moins une erreur de structure ou de ligne.
    """
    today = today or timezone.localdate()
    with open(path, encoding='utf-8-sig', newline='') as handle:
        dialect = _detect_dialect(handle.read(4096))
        handle.seek(0)
        reader = csv.DictReader(handle, dialect=dialect)
        if reader.fieldnames is None:
            raise ImportValidationError(["Fichier vide."])
        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
        missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if missing:
            raise ImportValidationError([f"Colonnes manquantes : {', '.join(missing)}."])

        rows, errors = [], []
        seen_keys, center_regions = {}, {}
        for line_number, raw in enumerate(reader, start=2):
            row, row_errors = _validate_row(raw, today)
            if not row_errors:
                key = (row['center_name'], row['blood_group'], row['date'])
                if key in seen_keys:
                    row_errors.append(f"doublon de la ligne {seen_keys[key]}")
                seen_keys.setdefault(key, line_number)
                region = center_regions.setdefault(row['center_name'], row['region'])
                if region != row['region']:
                    row_errors.append(
                        f"le centre '{row['center_name']}' est déjà rattaché "
                        f"à la région '{region}'"
                    )
            if row_errors:
                errors.append(f"Ligne {line_number} : {' ; '.join(row_errors)}.")
                if len(errors) >= MAX_REPORTED_ERRORS:
                    errors.append("Arrêt de la validation : trop d'erreurs.")
                    break
            else:
                rows.append(row)

    if errors:
        raise ImportValidationError(errors)
    if not rows:
        raise ImportValidationError(["Aucune ligne de données."])
    return rows


def _validate_row(raw, today):
    errors = []
    center_name = (raw.get('center_name') or '').strip()
    if not center_name:
        errors.append("'center_name' est obligatoire")
    elif len(center_name) > 200:
        errors.append("'center_name' dépasse 200 caractères")

    region = normalize_region(raw.get('region') or '')
    if region is None:
        errors.append(f"région inconnue ({raw.get('region')!r})")

    blood_group = (raw.get('blood_group') or '').strip().upper()
    if blood_group not in BLOOD_GROUP_CODES:
        errors.append(f"groupe sanguin inconnu ({raw.get('blood_group')!r})")

    record_date = parse_date(raw.get('date') or '')
    if record_date is None:
        errors.append(f"date invalide ({raw.get('date')!r}), attendu AAAA-MM-JJ ou JJ/MM/AAAA")
    elif record_date > today:
        errors.append(f"date future ({record_date})")

    row = {
        'center_name': center_name,
        'region': region,
        'blood_group': blood_group,
        'date': record_date,
        'units_available': _parse_count(
            raw.get('units_available'), 'units_available', errors, required=True
        ),
    }
    for column in OPTIONAL_COLUMNS:
        row[column] = _parse_count(raw.get(column), column, errors, required=False)
    return row, errors


def import_rows(rows, source):
    """Insère ou met à jour les lignes validées (transaction unique)."""
    from ml.models import BloodStockRecord

    records = [BloodStockRecord(source=source, **row) for row in rows]
    with transaction.atomic():
        BloodStockRecord.objects.bulk_create(
            records,
            batch_size=1000,
            update_conflicts=True,
            unique_fields=list(UNIQUE_FIELDS),
            update_fields=[
                'region', 'units_available', 'units_donated', 'units_used',
                'units_expired', 'source',
            ],
        )
    return len(records)


def summarize(rows):
    """Résumé lisible d'un lot validé."""
    dates = [row['date'] for row in rows]
    return {
        'rows': len(rows),
        'centers': len({row['center_name'] for row in rows}),
        'first_date': min(dates, default=date.min),
        'last_date': max(dates, default=date.min),
    }
