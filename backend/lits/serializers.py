"""
Sérialiseurs de l'application Lits (web et mobile).

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework import serializers

from ambulances.models import Mission
from users.models import HealthFacility
from users.serializers import HealthFacilitySummarySerializer, NearbyFacilitySerializer

from .models import BedCapacity, BedReservation
from .services import DEFAULT_HOLD_MINUTES, MAX_HOLD_MINUTES


class BedCapacitySerializer(serializers.ModelSerializer):
    """Capacité en lits d'un service."""

    facility = HealthFacilitySummarySerializer(read_only=True)
    facility_id = serializers.PrimaryKeyRelatedField(
        source='facility',
        queryset=HealthFacility.objects.all(),
        write_only=True,
        required=False,
        help_text="Obligatoire pour un administrateur ; ignoré pour le personnel.",
    )
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    available_beds = serializers.IntegerField(read_only=True)
    occupancy_rate = serializers.FloatField(read_only=True)
    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = BedCapacity
        fields = [
            'id',
            'facility',
            'facility_id',
            'category',
            'category_display',
            'total_beds',
            'occupied_beds',
            'reserved_beds',
            'available_beds',
            'occupancy_rate',
            'updated_at',
            'updated_by',
        ]
        read_only_fields = ['id', 'reserved_beds', 'updated_at']
        # Unicité (établissement, service) vérifiée par le service métier (409).
        validators = []

    def get_fields(self):
        fields = super().get_fields()
        # Le service et l'établissement d'une capacité existante ne changent pas.
        if isinstance(self.instance, BedCapacity):
            fields['category'].read_only = True
            fields['facility_id'].read_only = True
        return fields

    def get_updated_by(self, obj):
        user = obj.updated_by
        if user is None:
            return None
        return {'id': user.pk, 'full_name': user.get_full_name() or user.get_username()}

    def validate(self, attrs):
        total = attrs.get('total_beds', getattr(self.instance, 'total_beds', None))
        occupied = attrs.get('occupied_beds', getattr(self.instance, 'occupied_beds', 0))
        if total is not None and occupied > total:
            raise serializers.ValidationError(
                {'occupied_beds': ["Ne peut pas dépasser le nombre de lits installés."]}
            )
        return attrs


class NearbyBedFacilitySerializer(NearbyFacilitySerializer):
    """Établissement proche disposant de lits libres dans le service demandé."""

    available_beds = serializers.IntegerField(read_only=True)

    class Meta(NearbyFacilitySerializer.Meta):
        fields = [*NearbyFacilitySerializer.Meta.fields, 'available_beds']
        read_only_fields = fields


def _person(user):
    if user is None:
        return None
    return {'id': user.pk, 'full_name': user.get_full_name() or user.get_username()}


class BedReservationSerializer(serializers.ModelSerializer):
    """Réservation de lit (lecture)."""

    capacity = serializers.SerializerMethodField()
    facility = HealthFacilitySummarySerializer(source='capacity.facility', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    mission = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    closed_by = serializers.SerializerMethodField()

    class Meta:
        model = BedReservation
        fields = [
            'id',
            'capacity',
            'facility',
            'mission',
            'reference',
            'notes',
            'status',
            'status_display',
            'expires_at',
            'created_at',
            'created_by',
            'closed_at',
            'closed_by',
            'closing_reason',
        ]
        read_only_fields = fields

    def get_capacity(self, obj):
        return {
            'id': obj.capacity_id,
            'category': obj.capacity.category,
            'category_display': obj.capacity.get_category_display(),
        }

    def get_mission(self, obj):
        mission = obj.mission
        if mission is None:
            return None
        return {
            'id': mission.pk,
            'priority': mission.priority,
            'priority_display': mission.get_priority_display(),
            'status': mission.status,
            'status_display': mission.get_status_display(),
        }

    def get_created_by(self, obj):
        return _person(obj.created_by)

    def get_closed_by(self, obj):
        return _person(obj.closed_by)


class BedReservationCreateSerializer(serializers.Serializer):
    """Réservation d'un lit : un service (``capacity_id``) ou un établissement et un service."""

    capacity_id = serializers.PrimaryKeyRelatedField(
        source='capacity',
        queryset=BedCapacity.objects.select_related('facility'),
        required=False,
    )
    facility_id = serializers.PrimaryKeyRelatedField(
        source='facility', queryset=HealthFacility.objects.all(), required=False
    )
    category = serializers.ChoiceField(choices=BedCapacity.Category.choices, required=False)
    mission_id = serializers.PrimaryKeyRelatedField(
        source='mission', queryset=Mission.objects.all(), required=False, allow_null=True
    )
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    hold_minutes = serializers.IntegerField(
        min_value=5, max_value=MAX_HOLD_MINUTES, default=DEFAULT_HOLD_MINUTES
    )

    def validate(self, attrs):
        capacity = attrs.get('capacity')
        if capacity is None:
            facility, category = attrs.get('facility'), attrs.get('category')
            if facility is None or not category:
                raise serializers.ValidationError(
                    "Indiquez le service (capacity_id) ou l'établissement et le service (facility_id, category)."
                )
            capacity = (
                BedCapacity.objects.select_related('facility').filter(facility=facility, category=category).first()
            )
            if capacity is None:
                raise serializers.ValidationError({'category': ["Ce service n'existe pas dans cet établissement."]})
            attrs['capacity'] = capacity
        attrs.pop('facility', None)
        attrs.pop('category', None)
        return attrs
