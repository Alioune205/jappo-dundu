"""
Index géographique des donneurs positionnés (PostgreSQL/PostGIS uniquement).

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import migrations

from geo.operations import AddGeographyIndex, EnablePostGIS


class Migration(migrations.Migration):
    dependencies = [
        ('sang', '0001_initial'),
        ('users', '0002_postgis_facility_geography_index'),
    ]

    operations = [
        EnablePostGIS(),
        AddGeographyIndex(
            model_name='donor',
            name='sang_donor_geography_gist',
            nullable=True,
        ),
    ]
