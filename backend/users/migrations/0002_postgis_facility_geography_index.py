"""
Active PostGIS et indexe la position des établissements (PostgreSQL uniquement).

Auteur : Ibrahima Khalilou Diallo
"""

from django.db import migrations

from geo.operations import AddGeographyIndex, EnablePostGIS


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        EnablePostGIS(),
        AddGeographyIndex(
            model_name='healthfacility',
            name='users_facility_geography_gist',
        ),
    ]
