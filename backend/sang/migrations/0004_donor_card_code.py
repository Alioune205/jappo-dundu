"""Code aléatoire de la carte donneur (QR code), attribué aux donneurs existants."""

from django.db import migrations, models

import sang.cards


def fill_card_codes(apps, schema_editor):
    Donor = apps.get_model('sang', 'Donor')
    used = set()
    for donor in Donor.objects.filter(card_code__isnull=True).only('pk'):
        code = sang.cards.generate_card_code()
        while code in used:
            code = sang.cards.generate_card_code()
        used.add(code)
        Donor.objects.filter(pk=donor.pk).update(card_code=code)


class Migration(migrations.Migration):
    dependencies = [
        ('sang', '0003_donor_weight_kg'),
    ]

    operations = [
        migrations.AddField(
            model_name='donor',
            name='card_code',
            field=models.CharField(editable=False, max_length=12, null=True),
        ),
        migrations.RunPython(fill_card_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='donor',
            name='card_code',
            field=models.CharField(
                default=sang.cards.generate_card_code,
                editable=False,
                help_text='Code aléatoire du QR code de la carte donneur.',
                max_length=12,
                unique=True,
                verbose_name='Code de la carte donneur',
            ),
        ),
    ]
