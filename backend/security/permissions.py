"""
Permissions personnalisées basées sur les rôles pour Jappo Dundu.

Définit les classes de permissions pour chaque type d'utilisateur
de la plateforme : administrateur, personnel hospitalier, donneur,
et conducteur d'ambulance.

Auteur : El Hadji Massogui Diop
"""

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Accès réservé aux administrateurs de la plateforme."""

    message = "Accès réservé aux administrateurs."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )


class IsHospitalStaff(BasePermission):
    """Accès réservé au personnel hospitalier.

    Vérifie que l'utilisateur possède le rôle 'hospital_staff'
    dans ses groupes ou dans un champ `role` du profil.
    """

    message = "Accès réservé au personnel hospitalier."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Vérification via les groupes Django
        if request.user.groups.filter(name='hospital_staff').exists():
            return True
        # Vérification via un attribut `role` sur le modèle utilisateur
        role = getattr(request.user, 'role', None)
        return role == 'hospital_staff'


class IsDonor(BasePermission):
    """Accès réservé aux donneurs de sang inscrits.

    Vérifie que l'utilisateur possède le rôle 'donor'
    dans ses groupes ou dans un champ `role` du profil.
    """

    message = "Accès réservé aux donneurs."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.groups.filter(name='donor').exists():
            return True
        role = getattr(request.user, 'role', None)
        return role == 'donor'


class IsAmbulanceDriver(BasePermission):
    """Accès réservé aux conducteurs d'ambulance.

    Vérifie que l'utilisateur possède le rôle 'ambulance_driver'
    dans ses groupes ou dans un champ `role` du profil.
    """

    message = "Accès réservé aux conducteurs d'ambulance."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.groups.filter(name='ambulance_driver').exists():
            return True
        role = getattr(request.user, 'role', None)
        return role == 'ambulance_driver'


class IsAdminOrHospitalStaff(BasePermission):
    """Accès autorisé pour les admins ET le personnel hospitalier."""

    message = "Accès réservé aux administrateurs ou au personnel hospitalier."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_staff:
            return True
        if request.user.groups.filter(name='hospital_staff').exists():
            return True
        role = getattr(request.user, 'role', None)
        return role == 'hospital_staff'


class IsOwnerOrAdmin(BasePermission):
    """Accès autorisé au propriétaire de l'objet ou à un administrateur.

    Nécessite que l'objet possède un attribut `user` ou `owner`
    pointant vers l'utilisateur propriétaire.
    """

    message = "Vous ne pouvez accéder qu'à vos propres données."

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        owner = getattr(obj, 'user', None) or getattr(obj, 'owner', None)
        return owner == request.user
