"""
Permissions liées à l'établissement de rattachement.

Le personnel hospitalier n'agit que sur les ressources de son
établissement (lits, demandes de sang) ; l'administrateur agit partout.

    from users.permissions import IsFacilityStaffOrAdmin, scope_to_facility

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission

from security.roles import Role, user_has_role

from .models import HealthFacility
from .services import user_facility_id


def is_admin(user):
    return user_has_role(user, Role.ADMIN)


def facility_for_write(user, requested=None, *, field='facility_id'):
    """Établissement au nom duquel l'utilisateur crée une ressource.

    - admin : ``requested`` est obligatoire ;
    - personnel : son établissement (``requested`` doit être le même s'il est fourni).
    """
    if is_admin(user):
        if requested is None:
            raise ValidationError({field: ["Obligatoire pour un administrateur."]})
        return requested
    own_id = user_facility_id(user)
    if own_id is None:
        raise PermissionDenied("Votre compte n'est rattaché à aucun établissement.")
    if requested is not None and requested.pk != own_id:
        raise PermissionDenied("Vous ne pouvez agir que pour votre établissement.")
    return requested or HealthFacility.objects.get(pk=own_id)


def scope_to_facility(queryset, user, field='facility'):
    """Restreint un queryset à l'établissement de l'utilisateur (admin : tout)."""
    if is_admin(user):
        return queryset
    facility_id = user_facility_id(user)
    if facility_id is None or not user_has_role(user, Role.HOSPITAL_STAFF):
        return queryset.none()
    return queryset.filter(**{f'{field}_id': facility_id})


class IsFacilityStaffOrAdmin(BasePermission):
    """Admin, ou personnel hospitalier de l'établissement de l'objet.

    L'objet doit exposer ``facility_id``.
    """

    message = "Action réservée au personnel de l'établissement concerné."

    def has_permission(self, request, view):
        return user_has_role(request.user, Role.ADMIN, Role.HOSPITAL_STAFF)

    def has_object_permission(self, request, view, obj):
        if is_admin(request.user):
            return True
        facility_id = user_facility_id(request.user)
        return facility_id is not None and obj.facility_id == facility_id
