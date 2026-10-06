"""
Permissions liées à l'établissement de rattachement, par domaine.

Chaque administrateur spécialisé (lits, sang, ambulances) n'agit que dans
son domaine et sur les ressources de son établissement ; l'administrateur
général agit partout. Exception : l'administrateur du sang d'un centre de
transfusion (CNTS) gère les demandes de toute sa région, car le CNTS
approvisionne les hôpitaux de la région.

    from security.roles import Domain
    from users.permissions import facility_permission, scope_to_facility

    permission_classes = [facility_permission(Domain.BLOOD)]
    queryset = scope_to_facility(queryset, request.user, Domain.BLOOD)

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission

from security.roles import Domain, Role, manages, user_has_role

from .models import HealthFacility
from .services import user_facility_id


def is_admin(user):
    return user_has_role(user, Role.ADMIN)


def user_facility(user):
    """Établissement de rattachement (identifiant, région, type) ; None sinon."""
    facility_id = user_facility_id(user)
    if facility_id is None:
        return None
    return HealthFacility.objects.only('id', 'region', 'facility_type').filter(pk=facility_id).first()


def regional_scope(user, domain, facility):
    """Région gérée par l'utilisateur dans ce domaine, ou None (établissement seul).

    Seul cas régional : administrateur du sang rattaché à un centre de transfusion.
    """
    if (
        facility is not None
        and Domain(domain) == Domain.BLOOD
        and facility.facility_type == HealthFacility.FacilityType.BLOOD_BANK
        and user_has_role(user, Role.BLOOD_MANAGER)
    ):
        return facility.region
    return None


def in_scope(user, domain, facility_obj):
    """L'établissement ``facility_obj`` est-il dans le périmètre de l'utilisateur ?"""
    if is_admin(user):
        return True
    if not manages(user, domain):
        return False
    own = user_facility(user)
    if own is None or facility_obj is None:
        return False
    if facility_obj.pk == own.pk:
        return True
    region = regional_scope(user, domain, own)
    return region is not None and facility_obj.region == region


def facility_for_write(user, requested=None, *, domain, field='facility_id'):
    """Établissement au nom duquel l'utilisateur crée une ressource du domaine.

    - administrateur général : ``requested`` est obligatoire ;
    - administrateur spécialisé : son établissement par défaut ; un autre
      établissement seulement s'il est dans son périmètre (CNTS : sa région).
    """
    if is_admin(user):
        if requested is None:
            raise ValidationError({field: ["Obligatoire pour un administrateur."]})
        return requested
    if not manages(user, domain):
        raise PermissionDenied("Ce domaine ne relève pas de votre rôle.")
    own = user_facility(user)
    if own is None:
        raise PermissionDenied("Votre compte n'est rattaché à aucun établissement.")
    if requested is None:
        return HealthFacility.objects.get(pk=own.pk)
    if not in_scope(user, domain, requested):
        raise PermissionDenied("Vous ne pouvez agir que pour votre établissement.")
    return requested


def scope_to_facility(queryset, user, domain, field='facility'):
    """Restreint un queryset au périmètre de l'utilisateur dans ce domaine."""
    if is_admin(user):
        return queryset
    if not manages(user, domain):
        return queryset.none()
    own = user_facility(user)
    if own is None:
        return queryset.none()
    region = regional_scope(user, domain, own)
    if region is not None:
        return queryset.filter(**{f'{field}__region': region})
    return queryset.filter(**{f'{field}_id': own.pk})


class _FacilityDomainPermission(BasePermission):
    """Administrateur du domaine, limité aux objets de son périmètre.

    L'objet doit exposer ``facility`` (établissement concerné).
    """

    domain = None
    message = "Action réservée aux administrateurs de ce domaine pour l'établissement concerné."

    def has_permission(self, request, view):
        return manages(request.user, self.domain)

    def has_object_permission(self, request, view, obj):
        return in_scope(request.user, self.domain, obj.facility)


def facility_permission(domain):
    """Classe de permission DRF pour un domaine (lits, sang, ambulances)."""
    domain = Domain(domain)
    return type(
        f'Manages{domain.value.title()}',
        (_FacilityDomainPermission,),
        {'domain': domain},
    )
