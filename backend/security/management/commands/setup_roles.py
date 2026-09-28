"""
Commande Django : création des groupes de rôles (idempotente).

Usage :
    python manage.py setup_roles

À exécuter une fois après chaque déploiement (sans effet si les groupes
existent déjà). Le rôle ``admin`` n'est pas un groupe : il correspond aux
comptes ``is_staff``.

Auteur : El Hadji Massogui Diop
"""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from security.roles import GROUP_ROLES


class Command(BaseCommand):
    help = "Crée les groupes Django correspondant aux rôles applicatifs."

    def handle(self, *args, **options):
        for role in GROUP_ROLES:
            _, created = Group.objects.get_or_create(name=role.value)
            state = 'créé' if created else 'déjà présent'
            self.stdout.write(f"  Groupe '{role.value}' : {state}")
        self.stdout.write(self.style.SUCCESS("Rôles configurés."))
