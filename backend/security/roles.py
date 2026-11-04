"""
Rôles applicatifs de Jappo Dundu.

Source unique de vérité pour les rôles : les permissions DRF, les claims
JWT et les consumers WebSocket s'appuient tous sur ce module.

Un utilisateur obtient un rôle :
- ``admin`` (administrateur général) s'il est ``is_staff`` ou ``is_superuser`` ;
- ``bed_manager``, ``blood_manager``, ``ambulance_manager``, ``hospital_staff``,
  ``ambulance_driver`` ou ``donor`` s'il appartient au groupe Django du même
  nom (créés par ``python manage.py setup_roles``).

Aucune autre source n'est reconnue. Attention : ``is_staff`` vaut rôle
``admin`` national sur toute l'API ; il ne s'attribue que par
``users.services.set_role(user, Role.ADMIN)`` (ou ``createsuperuser``), jamais
pour un simple accès ponctuel à l'interface ``/admin/``.

L'administrateur général SUPERVISE les domaines métier (sang, lits,
ambulances) : il les consulte tous (``DOMAIN_VIEW_ROLES``, ``can_view``) mais
n'y effectue aucune opération (``DOMAIN_ROLES``, ``manages``). Il garde
l'administration de la plateforme : comptes, établissements, inscriptions.

Auteur : El Hadji Massogui Diop
"""

from enum import StrEnum


class Role(StrEnum):
    """Rôles reconnus par la plateforme."""

    ADMIN = 'admin'
    # Administrateurs spécialisés, rattachés à un établissement.
    BED_MANAGER = 'bed_manager'
    BLOOD_MANAGER = 'blood_manager'
    AMBULANCE_MANAGER = 'ambulance_manager'
    # Rôle historique : couvre les trois domaines, comme avant leur séparation.
    # Conservé pour les comptes existants ; les nouveaux comptes reçoivent un
    # rôle spécialisé.
    HOSPITAL_STAFF = 'hospital_staff'
    AMBULANCE_DRIVER = 'ambulance_driver'
    DONOR = 'donor'


# Ordre de priorité pour désigner le rôle principal (claim JWT ``role``).
ROLE_PRIORITY = (
    Role.ADMIN,
    Role.HOSPITAL_STAFF,
    Role.AMBULANCE_MANAGER,
    Role.BLOOD_MANAGER,
    Role.BED_MANAGER,
    Role.AMBULANCE_DRIVER,
    Role.DONOR,
)

# Rôles matérialisés par un groupe Django. L'admin est porté par is_staff.
GROUP_ROLES = (
    Role.BED_MANAGER,
    Role.BLOOD_MANAGER,
    Role.AMBULANCE_MANAGER,
    Role.HOSPITAL_STAFF,
    Role.AMBULANCE_DRIVER,
    Role.DONOR,
)


class Domain(StrEnum):
    """Domaines d'administration de la plateforme."""

    BEDS = 'beds'
    BLOOD = 'blood'
    AMBULANCES = 'ambulances'


# Rôles qui OPÈRENT chaque domaine (écriture : demandes, stocks, lits,
# missions, flotte), dans leur périmètre. L'administrateur général n'y figure
# pas : il supervise sans effectuer d'opérations métier.
DOMAIN_ROLES = {
    Domain.BEDS: frozenset({Role.HOSPITAL_STAFF, Role.BED_MANAGER}),
    Domain.BLOOD: frozenset({Role.HOSPITAL_STAFF, Role.BLOOD_MANAGER}),
    Domain.AMBULANCES: frozenset({Role.HOSPITAL_STAFF, Role.AMBULANCE_MANAGER}),
}

# Rôles qui CONSULTENT chaque domaine : ceux qui l'opèrent, plus
# l'administrateur général (supervision nationale, lecture seule). Sert aussi
# à la remise des alertes temps réel.
DOMAIN_VIEW_ROLES = {domain: roles | {Role.ADMIN} for domain, roles in DOMAIN_ROLES.items()}

# Réponse 403 d'une opération métier tentée par l'administrateur général.
SUPERVISION_MESSAGE = (
    "Lecture seule : l'administrateur général supervise au niveau national "
    "mais n'effectue pas d'opérations métier (sang, lits, ambulances)."
)

# Rôles rattachés à un établissement (obligatoire à la création du compte).
FACILITY_ROLES = frozenset(
    {
        Role.BED_MANAGER,
        Role.BLOOD_MANAGER,
        Role.AMBULANCE_MANAGER,
        Role.HOSPITAL_STAFF,
        Role.AMBULANCE_DRIVER,
    }
)

# Rôles ayant accès à l'interface web (les autres utilisent l'application mobile).
WEB_ROLES = frozenset(
    {Role.ADMIN, Role.BED_MANAGER, Role.BLOOD_MANAGER, Role.AMBULANCE_MANAGER, Role.HOSPITAL_STAFF}
)


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


def is_supervisor(user):
    """Administrateur général : supervision nationale, lecture seule sur les domaines métier."""
    return user_has_role(user, Role.ADMIN)


def manages(user, domain):
    """Indique si l'utilisateur OPÈRE ``domain`` (écriture, dans son périmètre).

    Toujours faux pour l'administrateur général, même s'il cumule un autre rôle.
    """
    return not is_supervisor(user) and user_has_role(user, *DOMAIN_ROLES[Domain(domain)])


def can_view(user, domain):
    """Indique si l'utilisateur CONSULTE ``domain`` (administrateur général compris)."""
    return user_has_role(user, *DOMAIN_VIEW_ROLES[Domain(domain)])
