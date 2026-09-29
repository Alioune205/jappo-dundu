"""
Sérialiseurs de l'application Sang (web et mobile).

Confidentialité :
- la position exacte d'un donneur n'est jamais renvoyée à un tiers ;
- les donneurs suggérés à un établissement sont anonymes (groupe, distance) ;
- nom et téléphone d'un donneur ne sont visibles par l'établissement
  qu'après son engagement (réponse acceptée) ;
- les donneurs ne voient pas les précisions cliniques d'une demande.

Auteur : Ibrahima Khalilou Diallo
"""

from django.utils import timezone
from rest_framework import serializers

from geo.serializers import MAX_LIMIT, MIN_RADIUS_KM, distance_km, validate_finite
from users.models import HealthFacility
from users.serializers import HealthFacilitySummarySerializer

from . import eligibility
from .models import MAX_SEARCH_RADIUS_KM, BloodRequest, Donation, Donor, DonorResponse

MIN_BIRTH_YEAR = 1900


def _person(user):
    return {
        'id': user.pk,
        'full_name': user.get_full_name() or user.get_username(),
    }


# =============================================================
# DONNEURS
# =============================================================


class DonorSerializer(serializers.ModelSerializer):
    """Profil donneur de l'utilisateur connecté (GET/PUT/PATCH /donors/me/)."""

    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    sex_display = serializers.CharField(source='get_sex_display', read_only=True)
    # DRF appelle la méthode du modèle et formate la date (AAAA-MM-JJ).
    next_eligible_date = serializers.DateField(read_only=True)
    is_eligible = serializers.SerializerMethodField()
    ineligibility_reasons = serializers.SerializerMethodField()

    class Meta:
        model = Donor
        fields = [
            'id',
            'blood_group',
            'blood_group_display',
            'sex',
            'sex_display',
            'date_of_birth',
            'is_available',
            'latitude',
            'longitude',
            'location_updated_at',
            'last_donation_date',
            'next_eligible_date',
            'is_eligible',
            'ineligibility_reasons',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'location_updated_at', 'created_at', 'updated_at']

    def get_ineligibility_reasons(self, obj):
        return obj.ineligibility_reasons()

    def get_is_eligible(self, obj):
        return not obj.ineligibility_reasons()

    def validate_date_of_birth(self, value):
        today = timezone.localdate()
        if value.year < MIN_BIRTH_YEAR or value > today:
            raise serializers.ValidationError("Date de naissance invalide.")
        if eligibility.age_on(value, today) < eligibility.MIN_DONOR_AGE:
            raise serializers.ValidationError(
                f"Il faut avoir au moins {eligibility.MIN_DONOR_AGE} ans pour donner son sang."
            )
        return value

    def validate_last_donation_date(self, value):
        if value is not None and value > timezone.localdate():
            raise serializers.ValidationError("La date du dernier don ne peut pas être future.")
        return value

    def validate(self, attrs):
        latitude = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        longitude = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError(
                "La latitude et la longitude se renseignent ensemble (ou s'effacent ensemble)."
            )
        birth = attrs.get('date_of_birth', getattr(self.instance, 'date_of_birth', None))
        last = attrs.get('last_donation_date', getattr(self.instance, 'last_donation_date', None))
        if birth and last and last < birth:
            raise serializers.ValidationError(
                {'last_donation_date': ["Antérieure à la date de naissance."]}
            )
        if 'latitude' in attrs or 'longitude' in attrs:
            changed = self.instance is None or (latitude, longitude) != (
                self.instance.latitude,
                self.instance.longitude,
            )
            if changed:
                attrs['location_updated_at'] = timezone.now() if latitude is not None else None
        return attrs


class DonorLookupSerializer(serializers.ModelSerializer):
    """Donneur retrouvé par un établissement (enregistrement d'un don)."""

    full_name = serializers.SerializerMethodField()
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    is_eligible = serializers.SerializerMethodField()
    # DRF appelle la méthode du modèle et formate la date (AAAA-MM-JJ).
    next_eligible_date = serializers.DateField(read_only=True)

    class Meta:
        model = Donor
        fields = [
            'id',
            'full_name',
            'blood_group',
            'blood_group_display',
            'last_donation_date',
            'next_eligible_date',
            'is_eligible',
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return _person(obj.user)['full_name']

    def get_is_eligible(self, obj):
        return not obj.ineligibility_reasons()


class DonorMatchSerializer(serializers.ModelSerializer):
    """Donneur compatible suggéré, anonyme (aucune donnée personnelle)."""

    donor_id = serializers.IntegerField(source='pk', read_only=True)
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    is_exact_match = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Donor
        fields = [
            'donor_id',
            'blood_group',
            'blood_group_display',
            'is_exact_match',
            'distance_km',
        ]
        read_only_fields = fields

    def get_is_exact_match(self, obj):
        return obj.blood_group == self.context['blood_request'].blood_group

    def get_distance_km(self, obj):
        return distance_km(obj)


# =============================================================
# DEMANDES
# =============================================================


class BloodRequestSerializer(serializers.ModelSerializer):
    """Demande de sang, vue de l'établissement (et de l'admin)."""

    facility = HealthFacilitySummarySerializer(read_only=True)
    facility_id = serializers.PrimaryKeyRelatedField(
        source='facility',
        queryset=HealthFacility.objects.all(),
        write_only=True,
        required=False,
        help_text="Obligatoire pour un administrateur ; ignoré pour le personnel.",
    )
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    urgency_display = serializers.CharField(source='get_urgency_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    units_remaining = serializers.IntegerField(read_only=True)
    created_by = serializers.SerializerMethodField()
    response_counts = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            'id',
            'facility',
            'facility_id',
            'blood_group',
            'blood_group_display',
            'units_needed',
            'units_collected',
            'units_remaining',
            'urgency',
            'urgency_display',
            'status',
            'status_display',
            'notes',
            'needed_by',
            'search_radius_km',
            'created_by',
            'response_counts',
            'created_at',
            'updated_at',
            'closed_at',
        ]
        read_only_fields = [
            'id',
            'units_collected',
            'status',
            'created_at',
            'updated_at',
            'closed_at',
        ]

    def get_fields(self):
        fields = super().get_fields()
        # Le groupe et l'établissement d'une demande existante ne changent pas.
        if isinstance(self.instance, BloodRequest):
            fields['blood_group'].read_only = True
            fields['facility_id'].read_only = True
        return fields

    def get_created_by(self, obj):
        return _person(obj.created_by) if obj.created_by_id else None

    def get_response_counts(self, obj):
        if not hasattr(obj, 'accepted_count'):
            return None
        return {
            'accepted': obj.accepted_count,
            'declined': obj.declined_count,
            'donated': obj.donated_count,
        }

    def validate_needed_by(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Cette échéance est déjà passée.")
        return value


class NearbyBloodRequestSerializer(serializers.ModelSerializer):
    """Demande vue par un donneur (écran « Alertes » du mobile)."""

    facility = HealthFacilitySummarySerializer(read_only=True)
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    urgency_display = serializers.CharField(source='get_urgency_display', read_only=True)
    units_remaining = serializers.IntegerField(read_only=True)
    distance_km = serializers.SerializerMethodField()
    my_response = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            'id',
            'facility',
            'blood_group',
            'blood_group_display',
            'units_remaining',
            'urgency',
            'urgency_display',
            'needed_by',
            'created_at',
            'distance_km',
            'my_response',
        ]
        read_only_fields = fields

    def get_distance_km(self, obj):
        return distance_km(obj)

    def get_my_response(self, obj):
        return self.context.get('my_responses', {}).get(obj.pk)


class BloodRequestBriefSerializer(serializers.ModelSerializer):
    """Demande en version courte (historique du donneur)."""

    facility = HealthFacilitySummarySerializer(read_only=True)
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BloodRequest
        fields = [
            'id',
            'facility',
            'blood_group',
            'blood_group_display',
            'urgency',
            'status',
            'status_display',
            'created_at',
        ]
        read_only_fields = fields


class NearbyRequestsQuerySerializer(serializers.Serializer):
    """Query string de GET /api/sang/requests/nearby/ (position facultative)."""

    latitude = serializers.FloatField(
        min_value=-90, max_value=90, required=False, validators=[validate_finite]
    )
    longitude = serializers.FloatField(
        min_value=-180, max_value=180, required=False, validators=[validate_finite]
    )
    radius_km = serializers.FloatField(
        min_value=MIN_RADIUS_KM,
        max_value=MAX_SEARCH_RADIUS_KM,
        default=MAX_SEARCH_RADIUS_KM,
        validators=[validate_finite],
    )
    limit = serializers.IntegerField(min_value=1, max_value=MAX_LIMIT, default=20)

    def validate(self, attrs):
        if ('latitude' in attrs) != ('longitude' in attrs):
            raise serializers.ValidationError(
                "La latitude et la longitude se renseignent ensemble."
            )
        return attrs


# =============================================================
# RÉPONSES
# =============================================================


class RespondSerializer(serializers.Serializer):
    """Réponse d'un donneur : accepted, declined ou cancelled (désistement)."""

    status = serializers.ChoiceField(
        choices=[(status.value, status.label) for status in DonorResponse.DONOR_STATUSES]
    )


class DonorResponseSerializer(serializers.ModelSerializer):
    """Réponse vue par l'établissement ; contact visible après engagement."""

    status_display = serializers.CharField(source='get_status_display', read_only=True)
    donor = serializers.SerializerMethodField()

    CONTACT_STATUSES = frozenset(
        {
            DonorResponse.Status.ACCEPTED,
            DonorResponse.Status.DONATED,
            DonorResponse.Status.NO_SHOW,
        }
    )

    class Meta:
        model = DonorResponse
        fields = ['id', 'status', 'status_display', 'donor', 'created_at', 'updated_at']
        read_only_fields = fields

    def get_donor(self, obj):
        data = {'id': obj.donor_id, 'blood_group': obj.donor.blood_group}
        if obj.status in self.CONTACT_STATUSES:
            user = obj.donor.user
            profile = getattr(user, 'profile', None)
            data.update(
                full_name=_person(user)['full_name'],
                phone_number=profile.phone_number if profile else None,
            )
        return data


class MyResponseSerializer(serializers.ModelSerializer):
    """Réponse vue par le donneur (écran « Historique »)."""

    status_display = serializers.CharField(source='get_status_display', read_only=True)
    blood_request = BloodRequestBriefSerializer(read_only=True)

    class Meta:
        model = DonorResponse
        fields = ['id', 'status', 'status_display', 'blood_request', 'created_at', 'updated_at']
        read_only_fields = fields


# =============================================================
# DONS
# =============================================================


class DonationSerializer(serializers.ModelSerializer):
    """Don enregistré par un établissement."""

    donor = serializers.SerializerMethodField()
    donor_id = serializers.PrimaryKeyRelatedField(
        source='donor',
        queryset=Donor.objects.select_related('user'),
        write_only=True,
    )
    facility = HealthFacilitySummarySerializer(read_only=True)
    facility_id = serializers.PrimaryKeyRelatedField(
        source='facility',
        queryset=HealthFacility.objects.all(),
        write_only=True,
        required=False,
        help_text="Obligatoire pour un administrateur ; ignoré pour le personnel.",
    )
    donated_on = serializers.DateField(required=False)
    recorded_by = serializers.SerializerMethodField()

    class Meta:
        model = Donation
        fields = [
            'id',
            'donor',
            'donor_id',
            'facility',
            'facility_id',
            'donated_on',
            'blood_request',
            'recorded_by',
            'created_at',
        ]
        read_only_fields = ['id', 'blood_request', 'created_at']

    def get_donor(self, obj):
        return {**_person(obj.donor.user), 'blood_group': obj.donor.blood_group}

    def get_recorded_by(self, obj):
        return _person(obj.recorded_by) if obj.recorded_by_id else None

    def validate_donated_on(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("La date du don ne peut pas être future.")
        return value


class MyDonationSerializer(serializers.ModelSerializer):
    """Don vu par le donneur (écran « Historique »)."""

    facility = HealthFacilitySummarySerializer(read_only=True)

    class Meta:
        model = Donation
        fields = ['id', 'facility', 'donated_on', 'blood_request', 'created_at']
        read_only_fields = fields
