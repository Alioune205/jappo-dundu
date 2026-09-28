"""
API REST de l'application ML de Jappo Dundu.

Toutes les routes sont réservées aux administrateurs et au personnel
hospitalier (données d'approvisionnement sensibles).

Auteur : El Hadji Massogui Diop
"""

import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from security.permissions import IsAdminOrHospitalStaff

from .constants import BLOOD_GROUP_CODES, REGION_CODES, REGION_LABELS
from .models import BloodStockRecord, MLModelMetadata, PredictionResult
from .serializers import (
    BloodStockRecordSerializer,
    MLModelMetadataSerializer,
    PredictionRequestSerializer,
    PredictionResultSerializer,
    PredictionSummarySerializer,
)
from .services.predictor import BloodShortagePredictor
from .services.registry import ModelNotAvailableError
from .services.risk import RISK_LEVELS

logger = logging.getLogger('jappo_dundu.ml')

MAX_STOCK_HISTORY_DAYS = 365


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
    permission_classes = [IsAdminOrHospitalStaff]

    def get_queryset(self):
        params = self.request.query_params
        queryset = PredictionResult.objects.all()

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

    permission_classes = [IsAdminOrHospitalStaff]

    def get(self, request):
        summary = (
            PredictionResult.objects
            .filter(prediction_date__gt=timezone.localdate())
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


class PredictOnDemandView(APIView):
    """Lance une prédiction et diffuse les alertes en temps réel.

    POST /api/ml/predict/
    {"region": "dakar", "blood_group": "O+", "days_ahead": 7}  (tout optionnel)
    """

    permission_classes = [IsAdminOrHospitalStaff]
    throttle_scope = 'ml_predict'

    def get_throttles(self):
        return [*super().get_throttles(), ScopedRateThrottle()]

    def post(self, request):
        serializer = PredictionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        region = serializer.validated_data.get('region')
        blood_group = serializer.validated_data.get('blood_group')
        days_ahead = serializer.validated_data['days_ahead']

        try:
            run = BloodShortagePredictor().predict_and_save(
                region=region,
                blood_group=blood_group,
                days_ahead=days_ahead,
            )
        except ModelNotAvailableError as exc:
            return Response(
                {'status': 'error', 'message': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        logger.info(
            "Prédiction à la demande par %s : %d résultats",
            request.user.get_username(), run.count,
        )
        return Response(
            {
                'status': 'success',
                'message': f'{run.count} prédictions générées.',
                'predictions_count': run.count,
                'risk_summary': run.risk_summary(),
                'skipped_series': run.skipped_series,
                'model_version': run.model_version,
                'filters': {
                    'region': region,
                    'blood_group': blood_group,
                    'days_ahead': days_ahead,
                },
            },
            status=status.HTTP_200_OK,
        )


class ModelInfoView(APIView):
    """Modèle actif et ses métriques d'évaluation.

    GET /api/ml/model-info/
    """

    permission_classes = [IsAdminOrHospitalStaff]

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
        return Response(
            {
                'status': 'active',
                'model': MLModelMetadataSerializer(active_model).data,
            },
            status=status.HTTP_200_OK,
        )


class BloodStockListView(generics.ListAPIView):
    """Historique récent des stocks.

    GET /api/ml/stocks/ ?region=dakar &blood_group=O+ &center=CNTS &days=30
    """

    serializer_class = BloodStockRecordSerializer
    permission_classes = [IsAdminOrHospitalStaff]

    def get_queryset(self):
        params = self.request.query_params
        days = _int_param(params, 'days', 30, 1, MAX_STOCK_HISTORY_DAYS)
        queryset = BloodStockRecord.objects.filter(
            date__gte=timezone.localdate() - timedelta(days=days)
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
