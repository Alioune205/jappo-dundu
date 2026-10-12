"""
Vues de l'API SIH (Système d'Information Hospitalier).

Fournit :
- GET  /api/sih/ping/            Vérification de la connectivité et validité de la clé
- GET  /api/sih/status/          État global des ressources de l'établissement
- GET  /api/sih/beds/status/     État actuel des lits par service
- POST /api/sih/beds/sync/       Synchronisation par lot des lits
- POST /api/sih/beds/event/      Événement unitaire ADT (admission / sortie de lit)
- GET  /api/sih/stocks/status/   État des stocks sanguins de l'établissement
- POST /api/sih/stocks/sync/     Synchronisation par lot des stocks de sang
- GET  /api/sih/logs/            Journal d'audit des synchronisations SIH
- /api/sih/keys/                 Gestion des clés API (Admin / Personnel)

Auteur : Pape Alioune Sene
"""

from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from ml.models import BloodStockRecord
from security.middleware import get_client_ip
from users.models import HealthFacility
from users.permissions import is_admin, user_facility

from . import services
from .authentication import HospitalApiKeyAuthentication, SIHBurstThrottle, SIHSustainedThrottle
from .models import HospitalApiKey
from .permissions import (
    CanManageSIHKeys,
    IsHospitalSIH,
    SIHCanSyncBeds,
    SIHCanSyncBlood,
    key_domains_for,
)
from .serializers import (
    BedADTEventSerializer,
    BedSyncBatchSerializer,
    BloodStockSyncBatchSerializer,
    HospitalApiKeyCreateSerializer,
    HospitalApiKeySerializer,
    HospitalSyncLogSerializer,
)


class SIHView(APIView):
    """Base des flux SIH : clé d'API uniquement, débit limité par clé."""

    authentication_classes = [HospitalApiKeyAuthentication]
    permission_classes = [IsHospitalSIH]
    throttle_classes = [SIHBurstThrottle, SIHSustainedThrottle]


class SIHPingView(SIHView):
    """Vérification de la connectivité SIH et de la validité de l'authentification."""

    def get(self, request):
        facility = request.facility
        api_key = request.sih_api_key
        return Response({
            'status': 'connected',
            'timestamp': timezone.now().isoformat(),
            'facility': {
                'id': facility.id,
                'name': facility.name,
                'region': facility.region,
                'city': facility.city,
                'facility_type': facility.facility_type,
            },
            'auth_method': 'api_key',
            'api_key_name': api_key.name,
            'allow_beds': api_key.allow_beds,
            'allow_blood': api_key.allow_blood,
        })


class SIHStatusSummaryView(SIHView):
    """Synthèse complète des ressources de l'établissement (lits, stocks, synchronisations)."""

    def get(self, request):
        return Response(services.get_facility_sih_summary(request.facility))


class SIHBedsSyncView(SIHView):
    """Synchronisation globale des capacités en lits par service."""

    permission_classes = [SIHCanSyncBeds]

    def get(self, request):
        summary = services.get_facility_sih_summary(request.facility)
        return Response(summary['beds_summary'])

    def post(self, request):
        serializer = BedSyncBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        results = services.sync_beds_batch(
            facility=request.facility,
            services_data=serializer.validated_data['services'],
            api_key=request.sih_api_key,
            ip_address=get_client_ip(request),
        )
        return Response({
            'status': 'success',
            'facility_id': request.facility.id,
            'facility_name': request.facility.name,
            'synced_services_count': len(results),
            'services': results,
            'timestamp': timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class SIHBedEventView(SIHView):
    """Événement unitaire ADT (Admission ou Décharge de patient)."""

    permission_classes = [SIHCanSyncBeds]

    def post(self, request):
        serializer = BedADTEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = services.process_bed_event(
            facility=request.facility,
            category=data['category'],
            action=data['action'],
            delta=data.get('delta', 1),
            patient_ref=data.get('patient_ref'),
            api_key=request.sih_api_key,
            ip_address=get_client_ip(request),
        )
        return Response({
            'status': 'success',
            'facility_id': request.facility.id,
            'event': result,
            'timestamp': timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class SIHBloodStockSyncView(SIHView):
    """Synchronisation automatique des stocks de poches de sang."""

    permission_classes = [SIHCanSyncBlood]

    def get(self, request):
        facility = request.facility
        records = (
            BloodStockRecord.objects.filter(center_name=facility.name)
            .order_by('-date', 'blood_group')[:16]
        )
        return Response([
            {
                'blood_group': r.blood_group,
                'units_available': r.units_available,
                'units_donated': r.units_donated,
                'units_used': r.units_used,
                'units_expired': r.units_expired,
                'date': r.date.isoformat(),
                'source': r.source,
            }
            for r in records
        ])

    def post(self, request):
        serializer = BloodStockSyncBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        results = services.sync_blood_stocks_batch(
            facility=request.facility,
            stocks_data=data['stocks'],
            target_date=data.get('date'),
            api_key=request.sih_api_key,
            ip_address=get_client_ip(request),
        )
        return Response({
            'status': 'success',
            'facility_id': request.facility.id,
            'facility_name': request.facility.name,
            'synced_stocks_count': len(results),
            'results': results,
            'timestamp': timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class SIHLogsView(generics.ListAPIView):
    """Historique des synchronisations et journaux d'audit de l'établissement."""

    authentication_classes = [HospitalApiKeyAuthentication]
    permission_classes = [IsHospitalSIH]
    throttle_classes = [SIHBurstThrottle, SIHSustainedThrottle]
    serializer_class = HospitalSyncLogSerializer
    pagination_class = None

    def get_queryset(self):
        facility = self.request.facility
        return facility.sih_sync_logs.select_related('api_key').order_by('-created_at')[:100]


class HospitalApiKeyViewSet(viewsets.ModelViewSet):
    """Gestion des clés API SIH (création, consultation, désactivation).

    Réservée à l'administrateur général et aux administrateurs des lits ou du
    sang, pour leur établissement. Une clé ne reçoit que les domaines que son
    créateur administre ; ce dernier ne voit ni ne révoque les clés des autres
    domaines. La clé en clair n'est renvoyée qu'une fois, à la création.
    """

    permission_classes = [CanManageSIHKeys]
    pagination_class = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'create':
            return HospitalApiKeyCreateSerializer
        return HospitalApiKeySerializer

    def get_queryset(self):
        user = self.request.user
        queryset = HospitalApiKey.objects.select_related('facility').order_by('-created_at')
        if is_admin(user):
            return queryset
        fac = user_facility(user)
        if not fac:
            return queryset.none()
        queryset = queryset.filter(facility=fac)
        # Une clé qui touche un domaine non administré par l'utilisateur lui échappe.
        for flag, allowed in key_domains_for(user).items():
            if not allowed:
                queryset = queryset.filter(**{flag: False})
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        facility_id = data.pop('facility_id', None)

        if is_admin(user):
            if facility_id is None:
                raise ValidationError({'facility_id': ["Obligatoire pour un administrateur."]})
            facility = HealthFacility.objects.filter(pk=facility_id, is_active=True).first()
            if not facility:
                raise ValidationError({'facility_id': ["Établissement introuvable ou inactif."]})
            domains = {'allow_beds': True, 'allow_blood': True}
        else:
            facility = user_facility(user)
            if not facility:
                raise PermissionDenied("Vous devez être rattaché à un établissement actif.")
            facility = HealthFacility.objects.get(pk=facility.pk)
            if not facility.is_active:
                raise PermissionDenied("Vous devez être rattaché à un établissement actif.")
            domains = key_domains_for(user)

        flags = {}
        for flag, allowed in domains.items():
            requested = data.pop(flag, None)
            if requested and not allowed:
                raise PermissionDenied("Vous ne pouvez déléguer que les domaines que vous administrez.")
            flags[flag] = allowed if requested is None else requested
        if not any(flags.values()):
            raise ValidationError("Une clé doit autoriser au moins un domaine (lits ou sang).")

        serializer.save(facility=facility, **flags)

    def perform_destroy(self, instance):
        # Révocation douce : désactivation
        instance.is_active = False
        instance.save(update_fields=['is_active'])
