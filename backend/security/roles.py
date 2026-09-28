"""
Rôles applicatifs de Jappo Dundu.

Source unique de vérité pour les rôles : les permissions DRF, les claims
JWT et les consumers WebSocket s'appuient tous sur ce module.

Un utilisateur obtient un rôle :
- ``admin`` s'il est ``is_staff`` ou ``is_superuser`` ;
- ``hospital_staff``, ``ambulance_driver`` ou ``donor`` s'il appartient au
  groupe Django du même nom (créés par ``python manage.py setup_roles``) ;
- n'importe quel rôle via un attribut ``role`` sur le modèle utilisateur,
  si le module ``users`` en ajoute un.

Auteur : El Hadji Massogui Diop
"""

from enum import StrEnum


class Role(StrEnum):
    """Rôles reconnus par la plateforme."""

    ADMIN = 'admin'
    HOSPITAL_STAFF = 'hospital_staff'
    AMBULANCE_DRIVER = 'ambulance_driver'
    DONOR = 'donor'


# Ordre de priorité pour désigner le rôle principal (claim JWT ``role``).
ROLE_PRIORITY = (
    Role.ADMIN,
    Role.HOSPITAL_STAFF,
    Role.AMBULANCE_DRIVER,
    Role.DONOR,
)

# Rôles matérialisés par un groupe Django. L'admin est porté par is_staff.
GROUP_ROLES = (Role.HOSPITAL_STAFF, Role.AMBULANCE_DRIVER, Role.DONOR)


def _is_authenticated(user):
    return user is not None and getattr(user, 'is_authenticated', False)


def get_user_roles(user):
    """Retourne l'ensemble des rôles d'un utilisateur (vide si anonyme).

    Coût : une requête SQL indexée sur les groupes de l'utilisateur.
    """
    if not _is_authenticated(user):
        return frozenset()

    roles = set()
    if user.is_staff or user.is_superuser:
        roles.add(Role.ADMIN)

    attribute_role = getattr(user, 'role', None)
    if attribute_role in Role._value2member_map_:
        roles.add(Role(attribute_role))

    group_names = user.groups.filter(
        name__in=[role.value for role in GROUP_ROLES]
    ).values_list('name', flat=True)
    roles.update(Role(name) for name in group_names)

    return frozenset(roles)


def user_has_role(user, *roles):
    """Indique si l'utilisateur possède au moins un des rôles donnés."""
    if not _is_authenticated(user):
        return False
    # Raccourci sans requête SQL pour le cas le plus fréquent côté admin.
    if Role.ADMIN in roles and (user.is_staff or user.is_superuser):
        return True
    return not get_user_roles(user).isdisjoint(roles)


def primary_role(roles):
    """Rôle principal selon ``ROLE_PRIORITY`` (None si aucun rôle)."""
    return next((role for role in ROLE_PRIORITY if role in roles), None)
