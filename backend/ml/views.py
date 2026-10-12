"""
API REST de l'application ML de Jappo Dundu.

Toutes les routes sont réservées aux administrateurs et au personnel
hospitalier (données d'approvisionnement sensibles).

Auteur : El Hadji Massogui Diop
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from security.permissions import ManagesBlood
from security.roles import Domain, Role, user_has_role
from users.models import HealthFacility
from users.permissions import in_scope, is_admin, regional_scope, user_facility

from .constants import BLOOD_GROUPS, BLOOD_GROUP_CODES, REGIONS, REGION_CODES, REGION_LABELS
from .models import BloodStockRecord, MLModelMetadata, PredictionResult
from .serializers import (
    BloodStockAdjustmentSerializer,
    BloodStockBatchSerializer,
    BloodStockCurrentSummarySerializer,
    BloodStockRecordSerializer,
    BloodStockRecordWriteSerializer,
    MLModelMetadataSerializer,
    PredictionRequestSerializer,
    PredictionResultSerializer,
    PredictionSummarySerializer,
)
from .services import jobs, registry
from .services.registry import ModelNotAvailableError
from .services.risk import RISK_LEVELS

logger = logging.getLogger('jappo_dundu.ml')

MAX_STOCK_HISTORY_DAYS = 365
DEFAULT_ADMIN_CENTER = "Centre National de Transfusion Sanguine (CNTS)"


def _own_facility(user):
    """Établissement complet de rattachement (nom compris) ; None sinon."""
    facility = user_facility(user)
    if facility is None:
        return None
    return HealthFacility.objects.filter(pk=facility.pk).first()


def stock_scope(user):
    """Filtre des stocks et prédictions visibles par l'utilisateur.

    - administrateur général : tout le pays ;
    - administrateur du sang d'un centre de transfusion : sa région ;
    - autre administrateur du sang : son établissement seulement.
    Les stocks sont rattachés par nom de centre (``center_name``) : le nom
    n'étant unique que par région, la région est toujours vérifiée avec lui.
    """
    if is_admin(user):
        return Q()
    facility = _own_facility(user)
    if facility is None:
        return Q(pk__in=[])
    region = regional_scope(user, Domain.BLOOD, facility)
    if region is not None:
        return Q(region=region)
    return Q(center_name=facility.name, region=facility.region)


def _choice_param(params, name, choices, transform=str):
    """Lit un filtre optionnel et le valide (400 si valeur inconnue)."""
    value = params.get(name)
    if value in (None, ''):
        return None
    value = transform(value)
    if value not in choices:
        raise ValidationError({name: f"Valeur invalide : {value!r}."})
    return value


def _int_param(params, name, default, minimum, maximum):
    value = params.get(name)
    if value in (None, ''):
        return default
    try:
        number = int(value)
    except ValueError:
        number = None
    if number is None or not minimum <= number <= maximum:
        raise ValidationError(
            {name: f"Entier attendu entre {minimum} et {maximum}."}
        )
    return number


class PredictionListView(generics.ListAPIView):
    """Prédictions courantes (dates futures par défaut).

    GET /api/ml/predictions/
        ?region=dakar &blood_group=O+ &risk_level=CRITICAL &center=Thiès
        &include_past=true
    """

    serializer_class = PredictionResultSerializer
    permission_classes = [ManagesBlood]

    def get_queryset(self):
        params = self.request.query_params
        queryset = PredictionResult.objects.filter(stock_scope(self.request.user))

        if params.get('include_past', '').lower() != 'true':
            queryset = queryset.filter(prediction_date__gt=timezone.localdate())

        region = _choice_param(params, 'region', REGION_CODES)
        if region:
            queryset = queryset.filter(region=region)
        blood_group = _choice_param(params, 'blood_group', BLOOD_GROUP_CODES)
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)
        risk_level = _choice_param(params, 'risk_level', RISK_LEVELS, str.upper)
        if risk_level:
            queryset = queryset.filter(risk_level=risk_level)
        center = params.get('center')
        if center:
            queryset = queryset.filter(center_name__icontains=center)

        return queryset.order_by('prediction_date', 'center_name', 'blood_group')


class PredictionByRegionView(APIView):
    """Synthèse des risques à venir, par région (tri : plus critique d'abord).

    GET /api/ml/predictions/summary/
    """

    permission_classes = [ManagesBlood]

    def get(self, request):
        summary = (
            PredictionResult.objects
            .filter(stock_scope(request.user), prediction_date__gt=timezone.localdate())
            .values('region')
            .annotate(
                total_predictions=Count('id'),
                critical_count=Count('id', filter=Q(risk_level='CRITICAL')),
                warning_count=Count('id', filter=Q(risk_level='WARNING')),
                normal_count=Count('id', filter=Q(risk_level='NORMAL')),
            )
            .order_by('-critical_count', '-warning_count', 'region')
        )
        results = [
            {**item, 'region_display': REGION_LABELS.get(item['region'], item['region'])}
            for item in summary
        ]
        serializer = PredictionSummarySerializer(results, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ServiceUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Service de prédiction indisponible.'
    default_code = 'service_unavailable'


class PredictOnDemandView(APIView):
    """Lance une prédiction en arrière-plan (voir services/jobs.py).

    POST /api/ml/predict/
    {"region": "dakar", "blood_group": "O+", "days_ahead": 7}  (tout optionnel)
    → 202 {"job_id", "status", "status_url", ...} ; le calcul (plusieurs
    secondes) ne bloque plus le serveur. Suivi : GET status_url, ou
    l'événement temps réel ``prediction_update``.
    """

    permission_classes = [ManagesBlood]
    throttle_scope = 'ml_predict'

    def get_throttles(self):
        return [*super().get_throttles(), ScopedRateThrottle()]

    def post(self, request):
        serializer = PredictionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Contrôle immédiat (modèle en mémoire après le premier chargement) :
        # l'absence de modèle reste une erreur 503 synchrone.
        try:
            registry.load_active_bundle()
        except ModelNotAvailableError as exc:
            raise ServiceUnavailable(str(exc)) from None

        region = serializer.validated_data.get('region')
        if not is_admin(request.user):
            # Hors administrateur général : prédictions de sa propre région seulement.
            own = _own_facility(request.user)
            if own is None:
                raise PermissionDenied("Votre compte n'est rattaché à aucun établissement.")
            if region and region != own.region:
                raise PermissionDenied("Vous ne pouvez lancer des prédictions que pour votre région.")
            region = own.region

        job = jobs.submit_prediction(
            request.user,
            region=region,
            blood_group=serializer.validated_data.get('blood_group'),
            days_ahead=serializer.validated_data['days_ahead'],
        )
        logger.info(
            "Prédiction %s demandée par %s", job['id'], request.user.get_username()
        )
        return Response(
            _job_payload(request, job), status=status.HTTP_202_ACCEPTED
        )


class PredictionJobView(APIView):
    """État d'une prédiction à la demande.

    GET /api/ml/predict/<job_id>/ → status : pending, running, succeeded, failed.
    Visible par son auteur et par les administrateurs.
    """

    permission_classes = [ManagesBlood]

    def get(self, request, job_id):
        job = jobs.get_job(job_id)
        if job is None or (
            job['requested_by'] != request.user.pk and not user_has_role(request.user, Role.ADMIN)
        ):
            raise NotFound('Tâche inconnue ou expirée.')
        return Response(_job_payload(request, job))


def _job_payload(request, job):
    payload = {
        'job_id': job['id'],
        'status': job['status'],
        'status_url': request.build_absolute_uri(
            reverse('ml:predict-job', kwargs={'job_id': job['id']})
        ),
        'filters': job['filters'],
        'created_at': job['created_at'],
        'finished_at': job['finished_at'],
    }
    if job['status'] == jobs.SUCCEEDED:
        payload.update(job['result'])
        payload['message'] = f"{job['result']['predictions_count']} prédictions générées."
    elif job['status'] == jobs.FAILED:
        payload['message'] = job['error']
    return payload


class ModelInfoView(APIView):
    """Modèle actif et ses métriques d'évaluation.

    GET /api/ml/model-info/
    """

    permission_classes = [ManagesBlood]

    def get(self, request):
        active_model = MLModelMetadata.objects.filter(is_active=True).first()
        if active_model is None:
            return Response(
                {
                    'status': 'no_model',
                    'message': (
                        "Aucun modèle entraîné. "
                        "Exécutez 'python manage.py train_model'."
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        counts = dict(
            BloodStockRecord.objects.values_list('source').annotate(n=Count('id')).values_list('source', 'n')
        )
        total = sum(counts.values())
        synthetic = counts.get(BloodStockRecord.Source.SYNTHETIC, 0)
        return Response(
            {
                'status': 'active',
                'model': MLModelMetadataSerializer(active_model).data,
                # Part de l'historique de stock qui est simulé : tant qu'elle n'est pas
                # nulle, les métriques ci-dessus ne valent pas pour le terrain.
                'training_data': {
                    'records_by_source': counts,
                    'synthetic_share': round(synthetic / total, 4) if total else None,
                },
            },
            status=status.HTTP_200_OK,
        )


def _resolve_center_and_region(user, center_name=None, region=None):
    """Centre et région au nom desquels l'utilisateur saisit un stock.

    - administrateur général : centre et région libres (CNTS par défaut) ;
    - administrateur du sang : son établissement, ou un établissement de sa
      région s'il est rattaché à un centre de transfusion. Le centre et la
      région envoyés par le client ne sont jamais crus sur parole.
    """
    center_name = (center_name or '').strip()
    region = (region or '').lower().strip()

    if is_admin(user):
        facility = _own_facility(user)
        if not center_name:
            center_name = facility.name if facility else DEFAULT_ADMIN_CENTER
        if not region:
            matched = facility or HealthFacility.objects.filter(name__iexact=center_name).first()
            region = matched.region if matched else "dakar"
        return center_name, region

    own = _own_facility(user)
    if own is None:
        raise PermissionDenied("Votre compte n'est rattaché à aucun établissement.")
    if not center_name or center_name.casefold() == own.name.casefold():
        target = own
    else:
        candidates = HealthFacility.objects.filter(name__iexact=center_name, is_active=True)
        if region:
            candidates = candidates.filter(region=region)
        target = next((f for f in candidates if in_scope(user, Domain.BLOOD, f)), None)
        if target is None:
            raise PermissionDenied("Vous ne pouvez saisir que les stocks de votre établissement.")
    if region and region != target.region:
        raise PermissionDenied("La région ne correspond pas à l'établissement.")
    return target.name, target.region


def _broadcast_stock_update(record):
    """Diffuse la mise à jour aux tableaux de bord connectés via WebSocket."""
    try:
        from realtime.broadcast import broadcast_alert, broadcast_dashboard

        broadcast_dashboard(
            'kpi',
            {
                'type': 'blood_stock_update',
                'center_name': record.center_name,
                'region': record.region,
                'blood_group': record.blood_group,
                'units_available': record.units_available,
                'date': str(record.date),
            },
        )
        if record.units_available <= 5:
            broadcast_alert(
                'blood',
                {
                    'event': 'critical_shortage',
                    'center_name': record.center_name,
                    'region': record.region,
                    'blood_group': record.blood_group,
                    'units_available': record.units_available,
                },
                region=record.region,
            )
    except Exception as exc:
        logger.warning("Échec de diffusion WebSocket du stock : %s", exc)


class BloodStockListCreateView(generics.ListCreateAPIView):
    """Historique récent des stocks et saisie unitaire d'un stock.

    GET /api/ml/stocks/ ?region=dakar &blood_group=O+ &center=CNTS &days=30
    POST /api/ml/stocks/ { "blood_group": "O+", "units_available": 25, ... }
    """

    permission_classes = [ManagesBlood]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BloodStockRecordWriteSerializer
        return BloodStockRecordSerializer

    def get_queryset(self):
        params = self.request.query_params
        days = _int_param(params, 'days', 30, 1, MAX_STOCK_HISTORY_DAYS)
        queryset = BloodStockRecord.objects.filter(
            stock_scope(self.request.user),
            date__gte=timezone.localdate() - timedelta(days=days),
        )

        region = _choice_param(params, 'region', REGION_CODES)
        if region:
            queryset = queryset.filter(region=region)
        blood_group = _choice_param(params, 'blood_group', BLOOD_GROUP_CODES)
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)
        center = params.get('center')
        if center:
            queryset = queryset.filter(center_name__icontains=center)

        return queryset.order_by('-date', 'center_name', 'blood_group')

    def create(self, request, *args, **kwargs):
        serializer = BloodStockRecordWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        center_name, region = _resolve_center_and_region(
            request.user, data.get('center_name'), data.get('region')
        )
        date = data.get('date') or timezone.localdate()
        blood_group = data['blood_group']

        record, created = BloodStockRecord.objects.update_or_create(
            center_name=center_name,
            blood_group=blood_group,
            date=date,
            defaults={
                'region': region,
                'units_available': data['units_available'],
                'units_donated': data.get('units_donated', 0),
                'units_used': data.get('units_used', 0),
                'units_expired': data.get('units_expired', 0),
                'source': BloodStockRecord.Source.MANUAL,
            },
        )
        _broadcast_stock_update(record)
        output = BloodStockRecordSerializer(record).data
        return Response(
            output,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


BloodStockListView = BloodStockListCreateView


class BloodStockBatchView(APIView):
    """Saisie en lot (inventaire complet de plusieurs groupes) pour une date.

    POST /api/ml/stocks/batch/
    """

    permission_classes = [ManagesBlood]

    def post(self, request):
        serializer = BloodStockBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        center_name, region = _resolve_center_and_region(
            request.user,
            serializer.validated_data.get('center_name'),
            serializer.validated_data.get('region'),
        )
        date = serializer.validated_data.get('date') or timezone.localdate()
        items = serializer.validated_data['items']

        saved_records = []
        with transaction.atomic():
            for item in items:
                record, _ = BloodStockRecord.objects.update_or_create(
                    center_name=center_name,
                    blood_group=item['blood_group'],
                    date=date,
                    defaults={
                        'region': region,
                        'units_available': item['units_available'],
                        'units_donated': item.get('units_donated', 0),
                        'units_used': item.get('units_used', 0),
                        'units_expired': item.get('units_expired', 0),
                        'source': BloodStockRecord.Source.MANUAL,
                    },
                )
                saved_records.append(record)

        for rec in saved_records:
            _broadcast_stock_update(rec)

        return Response(
            {
                'center_name': center_name,
                'region': region,
                'date': date,
                'count': len(saved_records),
                'records': BloodStockRecordSerializer(saved_records, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class BloodStockAdjustmentView(APIView):
    """Ajustement incrémental rapide d'un stock (don, transfusion, péremption, inventaire).

    POST /api/ml/stocks/adjust/
    """

    permission_classes = [ManagesBlood]

    def post(self, request):
        serializer = BloodStockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        center_name, region = _resolve_center_and_region(
            request.user, data.get('center_name'), data.get('region')
        )
        date = data.get('date') or timezone.localdate()
        blood_group = data['blood_group']
        adj_type = data['adjustment_type']
        units = data['units']

        record = BloodStockRecord.objects.filter(
            center_name=center_name,
            blood_group=blood_group,
            date=date,
        ).first()

        if not record:
            last_rec = (
                BloodStockRecord.objects.filter(
                    center_name=center_name,
                    blood_group=blood_group,
                    date__lt=date,
                )
                .order_by('-date')
                .first()
            )
            base_avail = last_rec.units_available if last_rec else 0
            record = BloodStockRecord(
                center_name=center_name,
                region=region,
                blood_group=blood_group,
                date=date,
                units_available=base_avail,
                units_donated=0,
                units_used=0,
                units_expired=0,
                source=BloodStockRecord.Source.MANUAL,
            )

        if adj_type == 'add_donated':
            record.units_available += units
            record.units_donated += units
        elif adj_type == 'use':
            record.units_available = max(0, record.units_available - units)
            record.units_used += units
        elif adj_type == 'expire':
            record.units_available = max(0, record.units_available - units)
            record.units_expired += units
        elif adj_type == 'set':
            record.units_available = units

        record.region = region
        record.source = BloodStockRecord.Source.MANUAL
        record.save()
        _broadcast_stock_update(record)

        return Response(
            {
                'message': "Ajustement de stock enregistré avec succès.",
                'record': BloodStockRecordSerializer(record).data,
            },
            status=status.HTTP_200_OK,
        )


class BloodStockCurrentSummaryView(APIView):
    """Synthèse instantanée du stock par groupe pour un centre de transfusion.

    GET /api/ml/stocks/current/ ?center=CNTS
    """

    permission_classes = [ManagesBlood]

    def get(self, request):
        center_name, region = _resolve_center_and_region(
            request.user, request.query_params.get('center'), request.query_params.get('region')
        )
        # Admin : recherche par nom partiel (« CNTS ») dans tout le pays.
        # Sinon : centre exact résolu dans le périmètre de l'utilisateur.
        if is_admin(request.user):
            center_filter = {'center_name__icontains': center_name}
        else:
            center_filter = {'center_name__iexact': center_name, 'region': region}
        all_groups = [bg[0] for bg in BLOOD_GROUPS]
        stocks = []
        total_units = 0
        critical = []
        warning = []
        latest_date = None

        for bg in all_groups:
            rec = (
                BloodStockRecord.objects.filter(blood_group=bg, **center_filter)
                .order_by('-date')
                .first()
            )

            avail = rec.units_available if rec else 0
            rec_date = rec.date if rec else timezone.localdate()
            if rec and (latest_date is None or rec.date > latest_date):
                latest_date = rec.date

            status_level = (
                'CRITICAL'
                if avail <= 5
                else ('WARNING' if avail <= 15 else 'NORMAL')
            )
            if status_level == 'CRITICAL':
                critical.append(bg)
            elif status_level == 'WARNING':
                warning.append(bg)

            total_units += avail
            stocks.append(
                {
                    'blood_group': bg,
                    'units_available': avail,
                    'units_donated': rec.units_donated if rec else 0,
                    'units_used': rec.units_used if rec else 0,
                    'units_expired': rec.units_expired if rec else 0,
                    'status': status_level,
                    'last_updated': str(rec_date),
                }
            )

        return Response(
            {
                'center_name': center_name,
                'region': region,
                'as_of_date': str(latest_date or timezone.localdate()),
                'total_units_available': total_units,
                'critical_groups': critical,
                'warning_groups': warning,
                'stocks': stocks,
            },
            status=status.HTTP_200_OK,
        )
