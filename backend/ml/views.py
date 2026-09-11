"""
Vues API de l'application ML pour Jappo Dundu.

Expose les endpoints REST pour :
- Consulter les prédictions de pénuries de sang
- Lancer des prédictions à la demande
- Consulter les informations du modèle ML

Auteur : El Hadji Massogui Diop
"""

import logging

from django.db.models import Count, Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BloodStockRecord, MLModelMetadata, PredictionResult
from .serializers import (
    BloodStockRecordSerializer,
    MLModelMetadataSerializer,
    PredictionRequestSerializer,
    PredictionResultSerializer,
    PredictionSummarySerializer,
)

logger = logging.getLogger('jappo_dundu.ml')


class PredictionListView(generics.ListAPIView):
    """Liste des prédictions courantes.

    GET /api/ml/predictions/
    GET /api/ml/predictions/?region=dakar
    GET /api/ml/predictions/?blood_group=O+
    GET /api/ml/predictions/?risk_level=CRITICAL
    """

    serializer_class = PredictionResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = PredictionResult.objects.all()

        # Filtres optionnels
        region = self.request.query_params.get('region')
        if region:
            queryset = queryset.filter(region=region)

        blood_group = self.request.query_params.get('blood_group')
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)

        risk_level = self.request.query_params.get('risk_level')
        if risk_level:
            queryset = queryset.filter(risk_level=risk_level.upper())

        center = self.request.query_params.get('center')
        if center:
            queryset = queryset.filter(center_name__icontains=center)

        return queryset.order_by('prediction_date', 'risk_level')


class PredictionByRegionView(APIView):
    """Prédictions groupées par région avec résumé des risques.

    GET /api/ml/predictions/summary/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = (
            PredictionResult.objects
            .values('region')
            .annotate(
                total_predictions=Count('id'),
                critical_count=Count(
                    'id', filter=Q(risk_level='CRITICAL')
                ),
                warning_count=Count(
                    'id', filter=Q(risk_level='WARNING')
                ),
                normal_count=Count(
                    'id', filter=Q(risk_level='NORMAL')
                ),
            )
            .order_by('-critical_count')
        )

        # Ajouter le display name de la région
        region_display_map = dict(BloodStockRecord.REGIONS)
        results = []
        for item in summary:
            item['region_display'] = region_display_map.get(
                item['region'], item['region']
            )
            results.append(item)

        serializer = PredictionSummarySerializer(results, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PredictOnDemandView(APIView):
    """Lancer une prédiction à la demande.

    POST /api/ml/predict/
    Body (optionnel) :
    {
        "region": "dakar",
        "blood_group": "O+",
        "days_ahead": 7
    }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PredictionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        region = serializer.validated_data.get('region')
        blood_group = serializer.validated_data.get('blood_group')
        days_ahead = serializer.validated_data.get('days_ahead', 7)

        try:
            from .services.predictor import BloodShortagePredictor

            predictor = BloodShortagePredictor()
            count = predictor.predict_and_save(
                region=region,
                blood_group=blood_group,
                days_ahead=days_ahead,
            )

            return Response(
                {
                    'status': 'success',
                    'message': f'{count} prédictions générées.',
                    'predictions_count': count,
                    'filters': {
                        'region': region,
                        'blood_group': blood_group,
                        'days_ahead': days_ahead,
                    },
                },
                status=status.HTTP_200_OK,
            )
        except FileNotFoundError as exc:
            return Response(
                {
                    'status': 'error',
                    'message': str(exc),
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as exc:
            logger.error("Erreur de prédiction : %s", exc, exc_info=True)
            return Response(
                {
                    'status': 'error',
                    'message': (
                        "Erreur lors de la génération des prédictions. "
                        "Vérifiez que le modèle est entraîné."
                    ),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ModelInfoView(APIView):
    """Informations sur le modèle ML actif.

    GET /api/ml/model-info/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        active_model = MLModelMetadata.objects.filter(
            is_active=True
        ).first()

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

        serializer = MLModelMetadataSerializer(active_model)
        return Response(
            {
                'status': 'active',
                'model': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class BloodStockListView(generics.ListAPIView):
    """Liste des enregistrements de stock sanguin.

    GET /api/ml/stocks/
    GET /api/ml/stocks/?region=dakar
    GET /api/ml/stocks/?blood_group=O+
    """

    serializer_class = BloodStockRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = BloodStockRecord.objects.all()

        region = self.request.query_params.get('region')
        if region:
            queryset = queryset.filter(region=region)

        blood_group = self.request.query_params.get('blood_group')
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)

        center = self.request.query_params.get('center')
        if center:
            queryset = queryset.filter(center_name__icontains=center)

        # Limiter par défaut aux 30 derniers jours
        limit = self.request.query_params.get('limit', '30')
        try:
            limit = int(limit)
        except ValueError:
            limit = 30

        return queryset.order_by('-date')[:limit * 20]
