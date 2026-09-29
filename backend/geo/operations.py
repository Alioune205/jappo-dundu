"""
Opérations de migration PostGIS.

- ``EnablePostGIS`` : active l'extension PostGIS (idempotent). Sur
  PostgreSQL, PostGIS est obligatoire : la migration échoue avec un
  message explicite s'il n'est pas installé sur le serveur.
- ``AddGeographyIndex`` : index GiST sur l'expression ``geography`` des
  colonnes latitude/longitude, identique à celle des requêtes
  (``geo.postgis``) pour que le planificateur l'utilise.

Sur les autres bases (SQLite), ces opérations ne font rien : la
recherche passe alors par le moteur portable (``geo.search``).

Auteur : Ibrahima Khalilou Diallo
"""

from django.core.exceptions import ImproperlyConfigured
from django.db.migrations.operations.base import Operation

POSTGIS_MISSING_MESSAGE = (
    "L'extension PostGIS n'est pas disponible sur ce serveur PostgreSQL. "
    "Utilisez l'image Docker fournie (cd backend && docker compose up -d db) "
    "ou installez PostGIS (https://postgis.net/documentation/getting_started/)."
)


def _is_postgresql(schema_editor):
    return schema_editor.connection.vendor == 'postgresql'


class EnablePostGIS(Operation):
    """Active l'extension PostGIS sur PostgreSQL (sans effet ailleurs)."""

    reversible = True

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if not _is_postgresql(schema_editor):
            return
        if not schema_editor.collect_sql:
            with schema_editor.connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'postgis'")
                if cursor.fetchone():
                    return
                cursor.execute("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'")
                if cursor.fetchone() is None:
                    raise ImproperlyConfigured(POSTGIS_MISSING_MESSAGE)
        schema_editor.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        # L'extension n'est jamais supprimée : d'autres objets peuvent en dépendre.
        pass

    def describe(self):
        return "Active l'extension PostGIS (PostgreSQL uniquement)"

    @property
    def migration_name_fragment(self):
        return 'enable_postgis'


class AddGeographyIndex(Operation):
    """Index GiST sur ``geography(ST_MakePoint(longitude, latitude))``.

    Args:
        model_name: nom du modèle de l'application de la migration.
        name: nom de l'index (63 caractères au plus).
        latitude_field, longitude_field: noms des champs du modèle.
        nullable: si vrai, index partiel limité aux lignes positionnées.
    """

    reversible = True

    def __init__(
        self,
        model_name,
        name,
        latitude_field='latitude',
        longitude_field='longitude',
        nullable=False,
    ):
        if len(name) > 63:
            raise ValueError("Le nom d'un index PostgreSQL est limité à 63 caractères.")
        self.model_name = model_name
        self.name = name
        self.latitude_field = latitude_field
        self.longitude_field = longitude_field
        self.nullable = nullable

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if not _is_postgresql(schema_editor):
            return
        model = to_state.apps.get_model(app_label, self.model_name)
        if not self.allow_migrate_model(schema_editor.connection.alias, model):
            return
        quote = schema_editor.quote_name
        latitude = quote(model._meta.get_field(self.latitude_field).column)
        longitude = quote(model._meta.get_field(self.longitude_field).column)
        condition = (
            f" WHERE {latitude} IS NOT NULL AND {longitude} IS NOT NULL" if self.nullable else ''
        )
        schema_editor.execute(
            f"CREATE INDEX {quote(self.name)} ON {quote(model._meta.db_table)} "
            f"USING GIST ((geography(ST_SetSRID(ST_MakePoint({longitude}, "
            f"{latitude}), 4326)))){condition}"
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if not _is_postgresql(schema_editor):
            return
        model = from_state.apps.get_model(app_label, self.model_name)
        if not self.allow_migrate_model(schema_editor.connection.alias, model):
            return
        schema_editor.execute(f"DROP INDEX IF EXISTS {schema_editor.quote_name(self.name)}")

    def describe(self):
        return f"Crée l'index géographique {self.name} sur {self.model_name}"

    @property
    def migration_name_fragment(self):
        return f'{self.model_name.lower()}_geography_index'
