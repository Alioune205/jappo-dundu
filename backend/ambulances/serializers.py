"""
Sérialiseurs de l'application Ambulances (web et mobile).

Auteur : Ibrahima Khalilou Diallo
"""

import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from geo.serializers import distance_km, validate_finite
from security.roles import Role
from users.models import HealthFacility
from users.serializers import HealthFacilitySummarySerializer, PhoneNumberField
from users.services import roles_of

from .models import Ambulance, Mission

User = get_user_model()

_PLATE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9]$")


def _person(user):
    if user is None:
        return None
    return {'id': user.pk, 'full_name': user.get_full_name() or user.get_username()}


class AmbulanceSerializer(serializers.ModelSerializer):
    """Ambulance (consultation et administration)."""

    facility = HealthFacilitySummarySerializer(read_only=True)
    facility_id = serializers.PrimaryKeyRelatedField(
        source='facility', queryset=HealthFacility.objects.all(), write_only=True
    )
    driver = serializers.SerializerMethodField()
    driver_id = serializers.PrimaryKeyRelatedField(
        source='driver',
        queryset=User.objects.filter(is_active=True),
        write_only=True,
        allow_null=True,
        required=False,
    )
    ambulance_type_display = serializers.CharField(
        source='get_ambulance_type_display', read_only=True
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Ambulance
        fields = [
            'id',
            'plate_number',
            'facility',
            'facility_id',
            'ambulance_type',
            'ambulance_type_display',
            'status',
            'status_display',
            'driver',
            'driver_id',
            'latitude',
            'longitude',
            'location_updated_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'latitude',
            'longitude',
            'location_updated_at',
            'created_at',
            'updated_at',
        ]
        # Unicité vérifiée après normalisation (validate_plate_number).
        extra_kwargs = {'plate_number': {'validators': []}}

    def get_driver(self, obj):
        return _person(obj.driver)

    def validate_plate_number(self, value):
        plate = " ".join(value.upper().split())
        if not _PLATE_PATTERN.match(plate):
            raise serializers.ValidationError(
                "Immatriculation invalide : lettres, chiffres, espaces et tirets "
                "(4 à 20 caractères)."
            )
        duplicates = Ambulance.objects.filter(plate_number=plate)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("Cette immatriculation est déjà enregistrée.")
        return plate

    def validate_facility_id(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Cet établissement est désactivé.")
        return value

    def validate_driver_id(self, value):
        if value is None:
            return value
        if Role.AMBULANCE_DRIVER not in roles_of(value):
            raise serializers.ValidationError("Ce compte n'a pas le rôle ambulancier.")
        assigned = Ambulance.objects.filter(driver=value)
        if self.instance is not None:
            assigned = assigned.exclude(pk=self.instance.pk)
        if assigned.exists():
            raise serializers.ValidationError(
                "Ce conducteur est déjà affecté à une autre ambulance."
            )
        return value


class NearbyAmbulanceSerializer(AmbulanceSerializer):
    """Ambulance disponible trouvée par une recherche de proximité."""

    distance_km = serializers.SerializerMethodField()

    class Meta(AmbulanceSerializer.Meta):
        fields = [*AmbulanceSerializer.Meta.fields, 'distance_km']
        read_only_fields = fields

    def get_distance_km(self, obj):
        return distance_km(obj)


class PositionSerializer(serializers.Serializer):
    """Position GPS envoyée par l'application du conducteur."""

    latitude = serializers.FloatField(min_value=-90, max_value=90, validators=[validate_finite])
    longitude = serializers.FloatField(min_value=-180, max_value=180, validators=[validate_finite])


class AvailabilitySerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            (Ambulance.Status.AVAILABLE.value, Ambulance.Status.AVAILABLE.label),
            (Ambulance.Status.OUT_OF_SERVICE.value, Ambulance.Status.OUT_OF_SERVICE.label),
        ]
    )


class MissionSerializer(serializers.ModelSerializer):
    """Mission d'urgence."""

    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    region_display = serializers.CharField(source='get_region_display', read_only=True)
    caller_phone = PhoneNumberField(required=False, allow_blank=True)
    ambulance = AmbulanceSerializer(read_only=True)
    destination = HealthFacilitySummarySerializer(read_only=True)
    destination_id = serializers.PrimaryKeyRelatedField(
        source='destination',
        queryset=HealthFacility.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    created_by = serializers.SerializerMethodField()
    response_time_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            'id',
            'priority',
            'priority_display',
            'status',
            'status_display',
            'description',
            'pickup_address',
            'pickup_latitude',
            'pickup_longitude',
            'region',
            'region_display',
            'caller_phone',
            'ambulance',
            'destination',
            'destination_id',
            'cancellation_reason',
            'created_by',
            'created_at',
            'updated_at',
            'assigned_at',
            'on_site_at',
            'transporting_at',
            'completed_at',
            'cancelled_at',
            'response_time_minutes',
        ]
        read_only_fields = [
            'id',
            'status',
            'cancellation_reason',
            'created_at',
            'updated_at',
            'assigned_at',
            'on_site_at',
            'transporting_at',
            'completed_at',
            'cancelled_at',
        ]

    def get_fields(self):
        fields = super().get_fields()
        # Le lieu d'intervention est figé une fois la mission créée.
        if isinstance(self.instance, Mission):
            for name in ('pickup_latitude', 'pickup_longitude', 'region'):
                fields[name].read_only = True
        return fields

    def get_created_by(self, obj):
        return _person(obj.created_by)

    def get_response_time_minutes(self, obj):
        if obj.on_site_at is None:
            return None
        return round((obj.on_site_at - obj.created_at).total_seconds() / 60, 1)

    def validate_destination_id(self, value):
        if value is not None and not value.is_active:
            raise serializers.ValidationError("Cet établissement est désactivé.")
        return value


class AssignSerializer(serializers.Serializer):
    """Affectation : une ambulance précise, ou la plus proche disponible."""

    ambulance_id = serializers.PrimaryKeyRelatedField(
        source='ambulance', queryset=Ambulance.objects.all(), required=False
    )
    ambulance_type = serializers.ChoiceField(
        choices=Ambulance.AmbulanceType.choices, required=False
    )
    radius_km = serializers.IntegerField(min_value=1, max_value=500, default=50)

    def validate(self, attrs):
        if 'ambulance' in attrs and 'ambulance_type' in attrs:
            raise serializers.ValidationError(
                "Indiquez soit une ambulance, soit un type d'ambulance recherché."
            )
        return attrs


class MissionStatusSerializer(serializers.Serializer):
    """Avancement : on_site, transporting, completed ou cancelled."""

    status = serializers.ChoiceField(
        choices=[
            (status.value, status.label)
            for status in Mission.Status
            if status not in (Mission.Status.PENDING, Mission.Status.ASSIGNED)
        ]
    )
    destination_id = serializers.PrimaryKeyRelatedField(
        source='destination', queryset=HealthFacility.objects.all(), required=False
    )
    cancellation_reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['status'] == Mission.Status.CANCELLED and not attrs.get('cancellation_reason'):
            raise serializers.ValidationError(
                {'cancellation_reason': ["Le motif d'annulation est obligatoire."]}
            )
        return attrs
