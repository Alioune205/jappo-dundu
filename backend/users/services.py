"""
Logique métier des comptes : profils, rôles, inscription, révocation.

Les rôles sont ceux de ``security.roles`` (source unique de vérité) :
``admin`` correspond à ``is_staff``, les autres rôles à un groupe Django.

Auteur : Ibrahima Khalilou Diallo
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from security.roles import GROUP_ROLES, Role, get_user_roles

from .models import UserProfile

logger = logging.getLogger('jappo_dundu.users')

User = get_user_model()

_FACILITY_CACHE_ATTR = '_jappo_facility_id'


def get_profile(user):
    """Profil du compte, créé à la volée s'il n'existe pas encore."""
    try:
        return user.profile
    except UserProfile.DoesNotExist:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        user.profile = profile
        return profile


def user_facility_id(user):
    """Identifiant de l'établissement de rattachement (None si aucun).

    Mis en cache sur l'objet utilisateur : une seule requête par requête HTTP.
    """
    if not getattr(user, 'is_authenticated', False):
        return None
    if not hasattr(user, _FACILITY_CACHE_ATTR):
        facility_id = (
            UserProfile.objects.filter(user=user).values_list('facility_id', flat=True).first()
        )
        setattr(user, _FACILITY_CACHE_ATTR, facility_id)
    return getattr(user, _FACILITY_CACHE_ATTR)


def roles_of(user):
    """Rôles d'un utilisateur, sans requête si ses groupes sont préchargés.

    Même règle que ``security.roles.get_user_roles`` ; les listes d'utilisateurs
    appellent ``prefetch_related('groups')`` pour éviter une requête par ligne.
    """
    if 'groups' not in getattr(user, '_prefetched_objects_cache', {}):
        return get_user_roles(user)
    roles = set()
    if user.is_staff or user.is_superuser:
        roles.add(Role.ADMIN)
    attribute_role = getattr(user, 'role', None)
    if attribute_role in {role.value for role in Role}:
        roles.add(Role(attribute_role))
    group_roles = {role.value for role in GROUP_ROLES}
    roles.update(Role(group.name) for group in user.groups.all() if group.name in group_roles)
    return frozenset(roles)


def role_groups():
    """Groupes des rôles, créés s'ils manquent (comme ``setup_roles``)."""
    return {role: Group.objects.get_or_create(name=role.value)[0] for role in GROUP_ROLES}


@transaction.atomic
def set_role(user, role):
    """Attribue un rôle unique à l'utilisateur (remplace les rôles précédents).

    ``admin`` active ``is_staff`` ; tout autre rôle le désactive, sauf pour un
    superutilisateur (dont le rôle ne peut pas être retiré par ce biais).
    """
    role = Role(role)
    groups = role_groups()
    user.groups.remove(*groups.values())

    is_staff = role == Role.ADMIN or user.is_superuser
    if user.is_staff != is_staff:
        user.is_staff = is_staff
        user.save(update_fields=['is_staff'])
    if role != Role.ADMIN:
        user.groups.add(groups[role])


def add_role(user, role):
    """Ajoute un rôle de groupe sans retirer les autres (ex. devenir donneur)."""
    role = Role(role)
    if role == Role.ADMIN:
        raise ValueError("Le rôle admin s'attribue par set_role().")
    user.groups.add(role_groups()[role])


@transaction.atomic
def create_account(*, username, password, role, profile=None, **user_fields):
    """Crée un compte, son profil et son rôle en une transaction."""
    user = User.objects.create_user(username=username, password=password, **user_fields)
    UserProfile.objects.create(user=user, **(profile or {}))
    set_role(user, role)
    logger.info("Compte créé : user=%s rôle=%s", user.pk, Role(role).value)
    return user


def register_citizen(*, username, password, phone_number, region, **user_fields):
    """Inscription publique : le compte obtient le rôle ``donor``."""
    return create_account(
        username=username,
        password=password,
        role=Role.DONOR,
        profile={'phone_number': phone_number, 'region': region},
        **user_fields,
    )


def revoke_refresh_tokens(user):
    """Révoque tous les refresh tokens valides du compte (liste noire).

    Les access tokens déjà émis restent valides jusqu'à leur expiration
    (30 minutes par défaut) ; aucun nouveau ne peut être obtenu.
    """
    tokens = OutstandingToken.objects.filter(
        user=user,
        expires_at__gt=timezone.now(),
        blacklistedtoken__isnull=True,
    )
    revoked = BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in tokens],
        ignore_conflicts=True,
    )
    if revoked:
        logger.info("Sessions révoquées : user=%s tokens=%d", user.pk, len(revoked))
    return len(revoked)
