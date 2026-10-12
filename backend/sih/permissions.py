"""
Permissions pour l'API SIH d'interopérabilité.

- Les flux (/ping/, /beds/..., /stocks/..., /logs/) sont réservés aux
  progiciels authentifiés par clé d'API ; l'établissement est celui de la clé.
- Une clé ne synchronise que les domaines qui lui ont été accordés
  (``allow_beds``, ``allow_blood``).
- La gestion des clés (/keys/) est réservée aux administrateurs du domaine
  concerné, pour leur établissement.

Auteur : Pape Alioune Sene
"""

from rest_framework.permissions import BasePermission

from security.roles import Domain, Role, manages, user_has_role

# Rôles autorisés à gérer les clés API (les autres sont refusés en 403).
KEY_MANAGER_ROLES = (Role.ADMIN, Role.HOSPITAL_STAFF, Role.BED_MANAGER, Role.BLOOD_MANAGER)


class IsHospitalSIH(BasePermission):
    """Progiciel SIH authentifié par une clé d'API valide."""

    message = "Accès réservé aux progiciels SIH hospitaliers munis d'une clé API valide."

    def has_permission(self, request, view):
        api_key = getattr(request, 'sih_api_key', None)
        return api_key is not None and request.facility.is_active


class _SIHDomainPermission(IsHospitalSIH):
    """Clé autorisée à synchroniser un domaine (lits ou sang)."""

    flag = None

    def has_permission(self, request, view):
        return super().has_permission(request, view) and getattr(request.sih_api_key, self.flag)


class SIHCanSyncBeds(_SIHDomainPermission):
    flag = 'allow_beds'
    message = "Cette clé API n'est pas autorisée à synchroniser les lits."


class SIHCanSyncBlood(_SIHDomainPermission):
    flag = 'allow_blood'
    message = "Cette clé API n'est pas autorisée à synchroniser les stocks de sang."


class CanManageSIHKeys(BasePermission):
    """Administrateur général, personnel hospitalier, administrateurs des lits ou du sang."""

    message = "Gestion des clés API réservée aux administrateurs des lits ou du sang."

    def has_permission(self, request, view):
        return user_has_role(request.user, *KEY_MANAGER_ROLES)


def key_domains_for(user):
    """Domaines (lits, sang) qu'un utilisateur peut déléguer à une clé API."""
    return {
        'allow_beds': manages(user, Domain.BEDS),
        'allow_blood': manages(user, Domain.BLOOD),
    }
