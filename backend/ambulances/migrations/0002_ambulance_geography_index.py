"""
Index géographique des ambulances positionnées (PostgreSQL/PostGIS uniquement).

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import migrations

from geo.operations import AddGeographyIndex, EnablePostGIS


class Migration(migrations.Migration):
    dependencies = [
        ('ambulances', '0001_initial'),
        ('users', '0002_postgis_facility_geography_index'),
    ]

    operations = [
        EnablePostGIS(),
        AddGeographyIndex(
            model_name='ambulance',
            name='ambulances_ambulance_geography_gist',
            nullable=True,
        ),
    ]
