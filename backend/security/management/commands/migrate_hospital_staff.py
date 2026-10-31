"""
Commande Django : remplace le rôle historique ``hospital_staff`` par les rôles
de domaine qu'il recouvrait, selon le type d'établissement du compte.

Usage :
    python manage.py migrate_hospital_staff            (aperçu, rien n'est modifié)
    python manage.py migrate_hospital_staff --apply    (applique)

- hôpital, centre de santé, clinique : administrateur des lits et du sang ;
- centre de transfusion : administrateur du sang ;
- service d'ambulances : administrateur des ambulances.

Le rôle historique est retiré ; les sessions du compte sont fermées (ses
droits changent).
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from security.roles import Role
from users.models import HealthFacility
from realtime.broadcast import close_user_sessions
from users.services import add_role, role_groups

ROLES_BY_TYPE = {
    HealthFacility.FacilityType.HOSPITAL: (Role.BED_MANAGER, Role.BLOOD_MANAGER),
    HealthFacility.FacilityType.HEALTH_CENTER: (Role.BED_MANAGER, Role.BLOOD_MANAGER),
    HealthFacility.FacilityType.CLINIC: (Role.BED_MANAGER, Role.BLOOD_MANAGER),
    HealthFacility.FacilityType.BLOOD_BANK: (Role.BLOOD_MANAGER,),
    HealthFacility.FacilityType.AMBULANCE_SERVICE: (Role.AMBULANCE_MANAGER,),
}


class Command(BaseCommand):
    help = "Remplace le rôle historique hospital_staff par les rôles de domaine."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help="Applique les changements (sinon aperçu).")

    def handle(self, *args, apply=False, **options):
        users = get_user_model().objects.filter(groups__name=Role.HOSPITAL_STAFF).select_related('profile__facility')
        count = 0
        for user in users:
            facility = getattr(getattr(user, 'profile', None), 'facility', None)
            roles = ROLES_BY_TYPE.get(getattr(facility, 'facility_type', None), ())
            labels = ', '.join(role.value for role in roles) or "aucun (sans établissement)"
            self.stdout.write(f"{user.get_username()} → {labels}")
            if apply and roles:
                with transaction.atomic():
                    for role in roles:
                        add_role(user, role)
                    user.groups.remove(role_groups()[Role.HOSPITAL_STAFF])
                close_user_sessions(user.pk)
                count += 1
        verb = "migrés" if apply else "à migrer (relancez avec --apply)"
        self.stdout.write(self.style.SUCCESS(f"Comptes {verb} : {count if apply else users.count()}"))
