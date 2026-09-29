"""
Sérialiseurs de l'application Users (web et mobile).

Conventions communes aux modules métier :
- chaque champ à choix est accompagné de son libellé ``<champ>_display`` ;
- une relation est lue sous forme d'objet imbriqué (``facility``) et
  écrite par identifiant (``facility_id``) ;
- les positions sont des nombres décimaux ``latitude``/``longitude``.

Auteur : Ibrahima Khalilou Diallo
"""

from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from geo.serializers import distance_km
from ml.constants import REGIONS
from security.roles import Role, primary_role

from . import services
from .models import HealthFacility, UserProfile
from .validators import normalize_phone_number

User = get_user_model()

ROLE_CHOICES = [(role.value, role.value) for role in Role]
# Rôles pouvant être rattachés à un établissement.
FACILITY_ROLES = frozenset({Role.HOSPITAL_STAFF, Role.AMBULANCE_DRIVER})

DUPLICATE_PHONE = "Ce numéro de téléphone est déjà utilisé."
DUPLICATE_EMAIL = "Cette adresse e-mail est déjà utilisée."
DUPLICATE_USERNAME = "Ce nom d'utilisateur est déjà pris."


def _django_errors(exc):
    return serializers.ValidationError(list(exc.messages))


class PhoneNumberField(serializers.CharField):
    """Numéro sénégalais, normalisé au format +221XXXXXXXXX."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if value == '':
            return value
        try:
            return normalize_phone_number(value)
        except DjangoValidationError as exc:
            raise _django_errors(exc) from exc


class RoleField(serializers.ChoiceField):
    """Rôle principal de l'utilisateur (lu à partir de ses rôles)."""

    def __init__(self, **kwargs):
        super().__init__(choices=ROLE_CHOICES, **kwargs)

    def get_attribute(self, instance):
        return primary_role(services.roles_of(instance))

    def to_internal_value(self, data):
        return Role(super().to_internal_value(data))


# =============================================================
# ÉTABLISSEMENTS
# =============================================================


class HealthFacilitySummarySerializer(serializers.ModelSerializer):
    """Établissement en version courte (objets imbriqués, cartes)."""

    facility_type_display = serializers.CharField(
        source='get_facility_type_display', read_only=True
    )
    region_display = serializers.CharField(source='get_region_display', read_only=True)

    class Meta:
        model = HealthFacility
        fields = [
            'id',
            'name',
            'facility_type',
            'facility_type_display',
            'region',
            'region_display',
            'city',
            'phone_number',
            'latitude',
            'longitude',
        ]
        read_only_fields = fields


class NearbyFacilitySerializer(HealthFacilitySummarySerializer):
    """Établissement trouvé par une recherche de proximité."""

    distance_km = serializers.SerializerMethodField()

    class Meta(HealthFacilitySummarySerializer.Meta):
        fields = [*HealthFacilitySummarySerializer.Meta.fields, 'distance_km']
        read_only_fields = fields

    def get_distance_km(self, obj):
        return distance_km(obj)


class HealthFacilitySerializer(serializers.ModelSerializer):
    """Établissement complet (consultation et administration)."""

    facility_type_display = serializers.CharField(
        source='get_facility_type_display', read_only=True
    )
    region_display = serializers.CharField(source='get_region_display', read_only=True)
    phone_number = PhoneNumberField(required=False, allow_blank=True)

    class Meta:
        model = HealthFacility
        fields = [
            'id',
            'name',
            'facility_type',
            'facility_type_display',
            'region',
            'region_display',
            'city',
            'address',
            'phone_number',
            'latitude',
            'longitude',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        return " ".join(value.split())

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', None))
        region = attrs.get('region', getattr(self.instance, 'region', None))
        duplicates = HealthFacility.objects.filter(name__iexact=name, region=region)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                {'name': "Un établissement porte déjà ce nom dans cette région."}
            )
        return attrs


# =============================================================
# COMPTES
# =============================================================


class AccountSerializer(serializers.ModelSerializer):
    """Compte de l'utilisateur connecté (GET/PATCH /api/users/me/)."""

    full_name = serializers.SerializerMethodField()
    phone_number = PhoneNumberField(source='profile.phone_number', required=False)
    region = serializers.ChoiceField(source='profile.region', choices=REGIONS, required=False)
    region_display = serializers.CharField(source='profile.get_region_display', read_only=True)
    role = RoleField(read_only=True)
    roles = serializers.SerializerMethodField()
    facility = HealthFacilitySummarySerializer(source='profile.facility', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'phone_number',
            'region',
            'region_display',
            'role',
            'roles',
            'facility',
            'date_joined',
            'last_login',
        ]
        read_only_fields = ['id', 'username', 'date_joined', 'last_login']

    def to_representation(self, instance):
        if not hasattr(instance, 'profile'):
            # Compte sans profil (ex. createsuperuser) : profil vide, non enregistré.
            instance.profile = UserProfile(user=instance)
        return super().to_representation(instance)

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.get_username()

    def get_roles(self, obj):
        return sorted(services.roles_of(obj))

    def validate_email(self, value):
        duplicates = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if value and duplicates.exists():
            raise serializers.ValidationError(DUPLICATE_EMAIL)
        return value

    def validate_phone_number(self, value):
        if not value:
            return None
        duplicates = UserProfile.objects.filter(phone_number=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(user=self.instance)
        if duplicates.exists():
            raise serializers.ValidationError(DUPLICATE_PHONE)
        return value

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()
                profile = services.get_profile(instance)
                for attr, value in profile_data.items():
                    setattr(profile, attr, value)
                profile.save()
        except IntegrityError as exc:
            # Course entre deux requêtes : la contrainte d'unicité a tranché.
            raise serializers.ValidationError({'phone_number': [DUPLICATE_PHONE]}) from exc
        return instance


class UserAdminSerializer(AccountSerializer):
    """Gestion des comptes par un administrateur (/api/users/)."""

    password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
        style={'input_type': 'password'},
    )
    role = RoleField(required=False)
    facility_id = serializers.PrimaryKeyRelatedField(
        source='profile.facility',
        queryset=HealthFacility.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta(AccountSerializer.Meta):
        fields = [
            *AccountSerializer.Meta.fields,
            'password',
            'facility_id',
            'is_active',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']
        extra_kwargs = {
            'username': {'validators': [UnicodeUsernameValidator()]},
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate_username(self, value):
        duplicates = User.objects.filter(username__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(DUPLICATE_USERNAME)
        return value

    def validate(self, attrs):
        instance = self.instance
        profile_data = attrs.setdefault('profile', {})

        if instance is None:
            for field in ('password', 'role'):
                if field not in attrs:
                    raise serializers.ValidationError({field: ["Ce champ est obligatoire."]})
            role = attrs['role']
            facility = profile_data.get('facility')
        else:
            role = attrs.get('role') or primary_role(services.roles_of(instance))
            facility = profile_data.get('facility', services.get_profile(instance).facility)

        if role not in FACILITY_ROLES:
            if profile_data.get('facility') is not None:
                raise serializers.ValidationError(
                    {
                        'facility_id': [
                            "Seuls le personnel hospitalier et les ambulanciers sont "
                            "rattachés à un établissement."
                        ]
                    }
                )
            profile_data['facility'] = facility = None
        if role == Role.HOSPITAL_STAFF and facility is None:
            raise serializers.ValidationError(
                {'facility_id': ["Obligatoire pour le personnel hospitalier."]}
            )
        if 'facility' in profile_data and facility is not None and not facility.is_active:
            raise serializers.ValidationError(
                {'facility_id': ["Cet établissement est désactivé."]}
            )

        if instance is not None:
            self._check_admin_safeguards(instance, attrs, role)
        self._check_password(instance, attrs)
        return attrs

    def _check_admin_safeguards(self, instance, attrs, role):
        request = self.context.get('request')
        if request is not None and instance.pk == request.user.pk:
            if role != Role.ADMIN:
                raise serializers.ValidationError(
                    {'role': ["Vous ne pouvez pas retirer votre propre rôle d'administrateur."]}
                )
            if attrs.get('is_active') is False:
                raise serializers.ValidationError(
                    {'is_active': ["Vous ne pouvez pas désactiver votre propre compte."]}
                )
        if instance.is_superuser and role != Role.ADMIN:
            raise serializers.ValidationError(
                {'role': ["Le rôle d'un superutilisateur ne peut pas être modifié."]}
            )

    def _check_password(self, instance, attrs):
        password = attrs.get('password')
        if password is None:
            return
        candidate = instance or User(
            username=attrs.get('username', ''),
            email=attrs.get('email', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        try:
            password_validation.validate_password(password, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)}) from exc

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        profile_data['phone_number'] = profile_data.get('phone_number') or None
        try:
            return services.create_account(
                username=validated_data.pop('username'),
                password=validated_data.pop('password'),
                role=validated_data.pop('role'),
                profile=profile_data,
                **validated_data,
            )
        except IntegrityError as exc:
            raise serializers.ValidationError(
                "Nom d'utilisateur ou téléphone déjà utilisé."
            ) from exc

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        password = validated_data.pop('password', None)
        with transaction.atomic():
            if password:
                instance.set_password(password)
            instance = super().update(instance, validated_data)
            if role is not None:
                services.set_role(instance, role)
        if password or not instance.is_active:
            services.revoke_refresh_tokens(instance)
        # Les groupes préchargés sont périmés après un changement de rôle.
        getattr(instance, '_prefetched_objects_cache', {}).pop('groups', None)
        return instance


class RegisterSerializer(serializers.Serializer):
    """Inscription publique d'un citoyen (rôle donneur)."""

    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={'input_type': 'password'}
    )
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone_number = PhoneNumberField()
    region = serializers.ChoiceField(choices=REGIONS)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(DUPLICATE_USERNAME)
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(DUPLICATE_EMAIL)
        return value

    def validate_phone_number(self, value):
        if UserProfile.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError(DUPLICATE_PHONE)
        return value

    def validate(self, attrs):
        candidate = User(
            username=attrs['username'],
            email=attrs.get('email', ''),
            first_name=attrs['first_name'],
            last_name=attrs['last_name'],
        )
        try:
            password_validation.validate_password(attrs['password'], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        try:
            return services.register_citizen(**validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                "Nom d'utilisateur ou téléphone déjà utilisé."
            ) from exc


class PasswordChangeSerializer(serializers.Serializer):
    """Changement de mot de passe de l'utilisateur connecté."""

    current_password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={'input_type': 'password'}
    )
    new_password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={'input_type': 'password'}
    )

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate(self, attrs):
        if attrs['new_password'] == attrs['current_password']:
            raise serializers.ValidationError(
                {'new_password': ["Le nouveau mot de passe doit être différent de l'actuel."]}
            )
        try:
            password_validation.validate_password(
                attrs['new_password'], user=self.context['request'].user
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        services.revoke_refresh_tokens(user)
        return user
