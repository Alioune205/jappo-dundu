"""
Clés API SIH : seule une empreinte SHA-256 est conservée, et chaque clé
déclare les domaines qu'elle peut synchroniser (lits, sang).

Les clés existantes restent valides : leur empreinte est calculée à partir
de la valeur en clair, puis la colonne en clair est supprimée.
"""

import hashlib

from django.db import migrations, models


def hash_existing_keys(apps, schema_editor):
    HospitalApiKey = apps.get_model('sih', 'HospitalApiKey')
    for api_key in HospitalApiKey.objects.all():
        api_key.key_hash = hashlib.sha256(api_key.key.encode()).hexdigest()
        api_key.key_prefix = api_key.key[:12]
        api_key.save(update_fields=['key_hash', 'key_prefix'])


class Migration(migrations.Migration):

    dependencies = [
        ('sih', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='hospitalapikey',
            name='key_prefix',
            field=models.CharField(
                default='',
                editable=False,
                help_text="Permet d'identifier la clé sans la révéler.",
                max_length=12,
                verbose_name='Début de la clé',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='hospitalapikey',
            name='key_hash',
            field=models.CharField(editable=False, max_length=64, null=True, verbose_name='Empreinte de la clé'),
        ),
        migrations.RunPython(hash_existing_keys, migrations.RunPython.noop),
        migrations.RemoveField(model_name='hospitalapikey', name='key'),
        migrations.AlterField(
            model_name='hospitalapikey',
            name='key_hash',
            field=models.CharField(editable=False, max_length=64, unique=True, verbose_name='Empreinte de la clé'),
        ),
        migrations.AddField(
            model_name='hospitalapikey',
            name='allow_beds',
            field=models.BooleanField(
                default=True,
                help_text="La clé peut mettre à jour les lits de l'établissement.",
                verbose_name='Synchronisation des lits',
            ),
        ),
        migrations.AddField(
            model_name='hospitalapikey',
            name='allow_blood',
            field=models.BooleanField(
                default=True,
                help_text="La clé peut mettre à jour les stocks de sang de l'établissement.",
                verbose_name='Synchronisation des stocks de sang',
            ),
        ),
    ]
