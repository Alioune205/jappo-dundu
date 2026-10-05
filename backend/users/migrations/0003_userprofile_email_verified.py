"""
Ajoute UserProfile.email_verified.

Reprise : un compte déjà lié à Google ou Apple dont l'adresse est celle
communiquée par le fournisseur est marqué vérifié (ces fournisseurs ne
transmettent que des adresses confirmées). Tous les autres restent non
vérifiés : une adresse saisie à l'inscription n'a jamais été prouvée.
"""

from django.db import migrations, models

TRUSTED_PROVIDERS = ('google', 'apple')


def mark_provider_verified_emails(apps, schema_editor):
    UserProfile = apps.get_model('users', 'UserProfile')
    SocialAccount = apps.get_model('identity', 'SocialAccount')
    for account in SocialAccount.objects.filter(provider__in=TRUSTED_PROVIDERS).exclude(email='').select_related('user'):
        if account.user.email and account.user.email.lower() == account.email.lower():
            UserProfile.objects.filter(user=account.user).update(email_verified=True)


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0002_postgis_facility_geography_index'),
        ('identity', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='email_verified',
            field=models.BooleanField(
                default=False,
                help_text="Vrai seulement si un fournisseur de confiance a prouvé la possession de l'adresse. "
                "Une connexion sociale n'est rattachée qu'à une adresse vérifiée.",
                verbose_name='E-mail vérifié',
            ),
        ),
        migrations.RunPython(mark_provider_verified_emails, migrations.RunPython.noop),
    ]
