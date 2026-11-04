"""
Permissions DRF basées sur les rôles pour Jappo Dundu.

Usage dans une vue d'un autre module :

    from security.permissions import IsAdminOrHospitalStaff

    class MaVue(APIView):
        permission_classes = [IsAdminOrHospitalStaff]

Pour une combinaison de rôles non prévue ci-dessous :

    from security.permissions import role_permission
    from security.roles import Role

    permission_classes = [role_permission(Role.ADMIN, Role.AMBULANCE_DRIVER)]

Domaines métier (sang, lits, ambulances) : l'administrateur général les
consulte mais n'y écrit pas. Les permissions ``Manages*`` (et toute permission
créée avec ``supervision_read_only=True``) lui ouvrent les requêtes de lecture
(GET, HEAD, OPTIONS) et lui refusent les autres en 403 (``SUPERVISION_MESSAGE``).

Auteur : El Hadji Massogui Diop
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .roles import DOMAIN_VIEW_ROLES, SUPERVISION_MESSAGE, Domain, Role, is_supervisor, user_has_role


def supervision_blocks(request):
    """Opération métier (écriture) tentée par l'administrateur général ?"""
    return request.method not in SAFE_METHODS and is_supervisor(request.user)


class HasAnyRole(BasePermission):
    """Autorise l'accès si l'utilisateur possède au moins un des rôles."""

    allowed_roles = frozenset()
    message = "Vous n'avez pas le rôle requis pour cette action."
    # Domaine métier : l'administrateur général n'y a que la lecture.
    supervision_read_only = False

    def has_permission(self, request, view):
        if self.supervision_read_only and supervision_blocks(request):
            self.message = SUPERVISION_MESSAGE
            return False
        return user_has_role(request.user, *self.allowed_roles)


class SupervisionReadOnly(BasePermission):
    """Refuse en 403 les opérations métier de l'administrateur général (lecture permise).

    À combiner avec la permission de rôle d'une vue métier ouverte en lecture
    à l'administrateur général.
    """

    message = SUPERVISION_MESSAGE

    def has_permission(self, request, view):
        return not supervision_blocks(request)


class NotSupervisor(BasePermission):
    """Refuse en 403 à l'administrateur général, quelle que soit la méthode.

    Gestes réservés aux opérateurs, même en lecture (ex. liste des ambulanciers
    affectables, position GPS d'un équipage).
    """

    message = SUPERVISION_MESSAGE

    def has_permission(self, request, view):
        return not is_supervisor(request.user)


def role_permission(*roles, message=None, supervision_read_only=False):
    """Fabrique une classe de permission pour une combinaison de rôles.

    ``supervision_read_only=True`` : l'administrateur général (s'il figure dans
    ``roles``) n'obtient que la lecture.
    """
    if not roles:
        raise ValueError("role_permission() exige au moins un rôle.")
    attrs = {
        'allowed_roles': frozenset(Role(role) for role in roles),
        'supervision_read_only': supervision_read_only,
    }
    if message:
        attrs['message'] = message
    name = 'Has' + ''.join(Role(r).value.title().replace('_', '') for r in roles)
    return type(name, (HasAnyRole,), attrs)


class IsAdmin(HasAnyRole):
    """Accès réservé aux administrateurs de la plateforme."""

    allowed_roles = frozenset({Role.ADMIN})
    message = "Accès réservé aux administrateurs."


class IsHospitalStaff(HasAnyRole):
    """Accès réservé au personnel hospitalier."""

    allowed_roles = frozenset({Role.HOSPITAL_STAFF})
    message = "Accès réservé au personnel hospitalier."


class IsDonor(HasAnyRole):
    """Accès réservé aux donneurs de sang inscrits."""

    allowed_roles = frozenset({Role.DONOR})
    message = "Accès réservé aux donneurs."


class IsAmbulanceDriver(HasAnyRole):
    """Accès réservé aux conducteurs d'ambulance."""

    allowed_roles = frozenset({Role.AMBULANCE_DRIVER})
    message = "Accès réservé aux conducteurs d'ambulance."


class IsAdminOrHospitalStaff(HasAnyRole):
    """Accès autorisé pour les admins et le personnel hospitalier."""

    allowed_roles = frozenset({Role.ADMIN, Role.HOSPITAL_STAFF})
    message = "Accès réservé aux administrateurs ou au personnel hospitalier."


class IsOwnerOrAdmin(BasePermission):
    """Accès autorisé au propriétaire de l'objet ou à un administrateur.

    L'objet doit exposer un attribut ``user`` ou ``owner`` pointant vers
    l'utilisateur propriétaire.
    """

    message = "Vous ne pouvez accéder qu'à vos propres données."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if user_has_role(request.user, Role.ADMIN):
            return True
        owner = getattr(obj, 'user', None) or getattr(obj, 'owner', None)
        return owner is not None and owner == request.user


class ManagesBeds(HasAnyRole):
    """Domaine des lits : opéré par ses administrateurs, consulté par l'administrateur général."""

    allowed_roles = DOMAIN_VIEW_ROLES[Domain.BEDS]
    supervision_read_only = True
    message = "Accès réservé aux administrateurs des lits."


class ManagesBlood(HasAnyRole):
    """Domaine du sang : opéré par ses administrateurs, consulté par l'administrateur général."""

    allowed_roles = DOMAIN_VIEW_ROLES[Domain.BLOOD]
    supervision_read_only = True
    message = "Accès réservé aux administrateurs du sang."


class ViewsBlood(HasAnyRole):
    """Consultation et calculs du domaine du sang (ex. prédiction à la demande, sans écriture)."""

    allowed_roles = DOMAIN_VIEW_ROLES[Domain.BLOOD]
    message = "Accès réservé aux administrateurs du sang."


class ManagesAmbulances(HasAnyRole):
    """Domaine des ambulances : opéré par la régulation, consulté par l'administrateur général."""

    allowed_roles = DOMAIN_VIEW_ROLES[Domain.AMBULANCES]
    supervision_read_only = True
    message = "Accès réservé à la régulation des ambulances."
