"""
Sérialiseurs de l'application Ambulances (web et mobile).

Auteur : Ibrahima Khalilou Diallo
"""

import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from geo.distance import GeoPoint, haversine_m
from geo.serializers import distance_km, validate_finite
from ml.constants import REGIONS
from security.roles import Role
from users.models import HealthFacility
from users.serializers import HealthFacilitySummarySerializer, PhoneNumberField
from users.services import roles_of

from . import triage as triage_protocol
from .models import Ambulance, EmergencyProfile, Mission, ShiftCheck

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

    def get_driver(self, obj) -> dict | None:
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
    travel_minutes = serializers.SerializerMethodField()
    travel_source = serializers.SerializerMethodField()
    readiness = serializers.SerializerMethodField()

    class Meta(AmbulanceSerializer.Meta):
        fields = [*AmbulanceSerializer.Meta.fields, 'distance_km', 'travel_minutes', 'travel_source', 'readiness']
        read_only_fields = fields

    def get_distance_km(self, obj) -> float | None:
        return distance_km(obj)

    def get_travel_minutes(self, obj) -> float | None:
        travel = getattr(obj, 'travel', None)
        return travel.minutes if travel else None

    def get_travel_source(self, obj) -> str | None:
        travel = getattr(obj, 'travel', None)
        return travel.source if travel else None

    def get_readiness(self, obj) -> dict:
        from .services import readiness_of

        return getattr(obj, 'readiness', None) or readiness_of(obj)


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
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    caller_phone = PhoneNumberField(required=False, allow_blank=True)
    ambulance = AmbulanceSerializer(read_only=True)
    destination = HealthFacilitySummarySerializer(read_only=True)
    origin_facility = HealthFacilitySummarySerializer(read_only=True)
    destination_id = serializers.PrimaryKeyRelatedField(
        source='destination',
        queryset=HealthFacility.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    created_by = serializers.SerializerMethodField()
    response_time_minutes = serializers.SerializerMethodField()
    triage = serializers.JSONField(required=False)
    triage_assessment = serializers.SerializerMethodField()
    destination_status_display = serializers.CharField(source='get_destination_status_display', read_only=True)
    incident_summary = serializers.SerializerMethodField()
    caller_card = serializers.SerializerMethodField()
    caller_history = serializers.SerializerMethodField()

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
            'source',
            'source_display',
            'created_by',
            'created_at',
            'updated_at',
            'assigned_at',
            'on_site_at',
            'transporting_at',
            'completed_at',
            'cancelled_at',
            'response_time_minutes',
            'triage',
            'triage_assessment',
            'destination_status',
            'destination_status_display',
            'destination_note',
            'destination_answered_at',
            'vitals',
            'bilan_notes',
            'bilan_updated_at',
            'eta_at',
            'eta_source',
            'caller_card',
            'caller_history',
            'origin_facility',
            'incident_summary',
        ]
        read_only_fields = [
            'id',
            'status',
            'cancellation_reason',
            'source',
            'destination_status',
            'destination_note',
            'destination_answered_at',
            'vitals',
            'bilan_notes',
            'bilan_updated_at',
            'eta_at',
            'eta_source',
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

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)

    def get_response_time_minutes(self, obj) -> float | None:
        if obj.on_site_at is None:
            return None
        return round((obj.on_site_at - obj.created_at).total_seconds() / 60, 1)

    def validate_destination_id(self, value):
        if value is not None and not value.is_active:
            raise serializers.ValidationError("Cet établissement est désactivé.")
        return value

    def get_caller_card(self, obj) -> dict | None:
        """Fiche d'urgence de l'auteur d'une alerte SOS, s'il a accepté de la partager."""
        if obj.source != Mission.Source.SOS or obj.created_by_id is None:
            return None
        profile = EmergencyProfile.objects.filter(user_id=obj.created_by_id, share_with_samu=True).first()
        if profile is None:
            return None
        donor = getattr(obj.created_by, 'donor', None)
        request = self.context.get('request')
        if request is not None:
            from security import audit

            audit.record(request, 'sos.caller_card', obj, mission_id=obj.pk)
        return {
            'blood_group': getattr(donor, 'blood_group', None),
            'allergies': profile.allergies,
            'conditions': profile.conditions,
            'medications': profile.medications,
        }

    def get_incident_summary(self, obj) -> dict | None:
        """Plusieurs victimes : l'incident et l'avancement de ses missions."""
        if obj.incident_id is None:
            return None
        missions = obj.incident.missions.all()
        return {
            'id': obj.incident_id,
            'victims': obj.incident.victims,
            'missions': missions.count(),
            'assigned': missions.exclude(ambulance=None).count(),
            'destinations': sorted({m.destination.name for m in missions if m.destination_id}),
        }

    def get_caller_history(self, obj) -> dict | None:
        """Alertes SOS de l'appelant sur 30 jours, et celles que la régulation a annulées."""
        if obj.source != Mission.Source.SOS or obj.created_by_id is None:
            return None
        from .services import caller_history

        return caller_history(obj.created_by_id)

    def validate_triage(self, value):
        return triage_protocol.clean_answers(value)

    def get_triage_assessment(self, obj) -> dict | None:
        return triage_protocol.assess(obj.triage) if obj.triage else None


class TransferSerializer(serializers.Serializer):
    """Demande de transfert d'un patient vers un autre établissement (sans nom de patient)."""

    destination_id = serializers.PrimaryKeyRelatedField(
        source='destination', queryset=HealthFacility.objects.filter(is_active=True)
    )
    category = serializers.ChoiceField(
        choices=['emergency', 'intensive_care', 'surgery', 'internal_medicine', 'maternity', 'pediatrics', 'neonatology']
    )
    priority = serializers.ChoiceField(choices=Mission.Priority.choices, default=Mission.Priority.URGENT)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    origin_id = serializers.PrimaryKeyRelatedField(
        source='origin', queryset=HealthFacility.objects.filter(is_active=True), required=False
    )


class VitalsSerializer(serializers.Serializer):
    """Constantes relevées par l'équipage (toutes facultatives, bornes physiologiques larges)."""

    pulse = serializers.IntegerField(min_value=20, max_value=250, required=False, help_text="Pouls (/min)")
    systolic = serializers.IntegerField(min_value=40, max_value=260, required=False, help_text="PA systolique (mmHg)")
    diastolic = serializers.IntegerField(min_value=20, max_value=160, required=False, help_text="PA diastolique (mmHg)")
    spo2 = serializers.IntegerField(min_value=50, max_value=100, required=False, help_text="Saturation (%)")
    resp_rate = serializers.IntegerField(min_value=4, max_value=60, required=False, help_text="Fréquence respiratoire (/min)")
    temperature = serializers.FloatField(min_value=30, max_value=44, required=False, help_text="Température (°C)")
    gcs = serializers.IntegerField(min_value=3, max_value=15, required=False, help_text="Score de Glasgow")
    glucose = serializers.FloatField(min_value=0.2, max_value=6, required=False, help_text="Glycémie (g/L)")


class BilanSerializer(serializers.Serializer):
    """Bilan de l'équipage transmis à l'hôpital (sans nom de patient)."""

    vitals = VitalsSerializer(required=False)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Indiquez des constantes ou des observations.")
        return attrs


class DestinationAnswerSerializer(serializers.Serializer):
    """Réponse de l'hôpital à la pré-alerte ; un refus est motivé."""

    accepted = serializers.BooleanField()
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if not attrs['accepted'] and not attrs['note'].strip():
            raise serializers.ValidationError({'note': ["Indiquez le motif du refus (ex. scanner en panne)."]})
        return attrs


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


class SosInputSerializer(serializers.Serializer):
    """Alerte SOS envoyée par un citoyen : position du téléphone et nature de l'urgence."""

    latitude = serializers.FloatField(min_value=-90, max_value=90, validators=[validate_finite])
    longitude = serializers.FloatField(min_value=-180, max_value=180, validators=[validate_finite])
    kind = serializers.ChoiceField(choices=['accident', 'malaise', 'breathing', 'childbirth', 'other'])
    landmark = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class CitizenSosSerializer(serializers.ModelSerializer):
    """Suivi de son alerte par le citoyen : ni le véhicule détaillé, ni la régulation."""

    status_display = serializers.CharField(source='get_status_display', read_only=True)
    ambulance = serializers.SerializerMethodField()
    instructions = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            'id',
            'status',
            'status_display',
            'description',
            'instructions',
            'eta_at',
            'pickup_address',
            'created_at',
            'assigned_at',
            'on_site_at',
            'completed_at',
            'cancelled_at',
            'cancellation_reason',
            'ambulance',
        ]
        read_only_fields = fields

    def get_instructions(self, obj) -> list[dict]:
        """Consignes en attendant l'ambulance, selon le type d'urgence signalé."""
        return triage_protocol.instructions_for(obj.triage or {})

    def get_ambulance(self, obj) -> dict | None:
        ambulance = obj.ambulance
        if ambulance is None or not obj.is_active:
            return None
        distance = None
        if ambulance.latitude is not None and ambulance.longitude is not None:
            meters = haversine_m(
                GeoPoint(obj.pickup_latitude, obj.pickup_longitude), ambulance.latitude, ambulance.longitude
            )
            distance = round(meters / 1000, 1)
        return {
            'plate_number': ambulance.plate_number,
            'ambulance_type_display': ambulance.get_ambulance_type_display(),
            'distance_km': distance,
        }


class EmergencyContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    phone = PhoneNumberField()
    relation = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')


class EmergencyProfileSerializer(serializers.ModelSerializer):
    """Fiche d'urgence du citoyen (consentements explicites, 3 contacts au plus)."""

    contacts = EmergencyContactSerializer(many=True, required=False)

    class Meta:
        model = EmergencyProfile
        fields = [
            'share_with_samu',
            'allergies',
            'conditions',
            'medications',
            'contacts',
            'notify_contacts',
            'updated_at',
        ]
        read_only_fields = ['updated_at']

    def validate_contacts(self, value):
        if len(value) > EmergencyProfile.MAX_CONTACTS:
            raise serializers.ValidationError(f"{EmergencyProfile.MAX_CONTACTS} contacts au plus.")
        return value


class LocationLinkSerializer(serializers.Serializer):
    phone_number = PhoneNumberField(required=False, allow_blank=True)


class PublicLocationSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90, validators=[validate_finite])
    longitude = serializers.FloatField(min_value=-180, max_value=180, validators=[validate_finite])
    accuracy = serializers.FloatField(min_value=0, required=False)


class ShiftCheckSerializer(serializers.ModelSerializer):
    issues = serializers.ListField(read_only=True)

    class Meta:
        model = ShiftCheck
        fields = ['id', 'oxygen_ok', 'equipment_ok', 'fuel', 'crew_count', 'notes', 'checked_at', 'issues']
        read_only_fields = ['id', 'checked_at', 'issues']


class IncidentSerializer(serializers.Serializer):
    """Appel pour plusieurs victimes : une mission par ambulance demandée."""

    victims = serializers.IntegerField(min_value=2, max_value=200)
    ambulances = serializers.IntegerField(min_value=1, max_value=10)
    priority = serializers.ChoiceField(choices=Mission.Priority.choices, default=Mission.Priority.CRITICAL)
    description = serializers.CharField(max_length=200)
    pickup_address = serializers.CharField(max_length=255)
    pickup_latitude = serializers.FloatField(min_value=-90, max_value=90, validators=[validate_finite])
    pickup_longitude = serializers.FloatField(min_value=-180, max_value=180, validators=[validate_finite])
    region = serializers.ChoiceField(choices=REGIONS)
    caller_phone = PhoneNumberField(required=False, allow_blank=True, default='')
    triage = serializers.JSONField(required=False, default=dict)

    def validate_triage(self, value):
        return triage_protocol.clean_answers(value)
