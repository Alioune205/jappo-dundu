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

Auteur : El Hadji Massogui Diop
"""

from rest_framework.permissions import BasePermission

from .roles import Role, user_has_role


class HasAnyRole(BasePermission):
    """Autorise l'accès si l'utilisateur possède au moins un des rôles."""

    allowed_roles = frozenset()
    message = "Vous n'avez pas le rôle requis pour cette action."

    def has_permission(self, request, view):
        return user_has_role(request.user, *self.allowed_roles)


def role_permission(*roles, message=None):
    """Fabrique une classe de permission pour une combinaison de rôles."""
    if not roles:
        raise ValueError("role_permission() exige au moins un rôle.")
    attrs = {'allowed_roles': frozenset(Role(role) for role in roles)}
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
