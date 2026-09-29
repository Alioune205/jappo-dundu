"""
Sérialiseurs de l'application Lits (web et mobile).

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework import serializers

from users.models import HealthFacility
from users.serializers import HealthFacilitySummarySerializer, NearbyFacilitySerializer

from .models import BedCapacity


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
            'available_beds',
            'occupancy_rate',
            'updated_at',
            'updated_by',
        ]
        read_only_fields = ['id', 'updated_at']
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
