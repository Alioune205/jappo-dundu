"""
Routes de l'application ML.

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .views import (
    BloodStockAdjustmentView,
    BloodStockBatchView,
    BloodStockCurrentSummaryView,
    BloodStockListCreateView,
    BloodStockListView,
    ModelInfoView,
    PredictionByRegionView,
    PredictionListView,
    PredictOnDemandView,
    PredictionJobView,
)

app_name = 'ml'

urlpatterns = [
    path(
        'predictions/',
        PredictionListView.as_view(),
        name='prediction-list',
    ),
    path(
        'predictions/summary/',
        PredictionByRegionView.as_view(),
        name='prediction-summary',
    ),
    path(
        'predict/',
        PredictOnDemandView.as_view(),
        name='predict-on-demand',
    ),
    path(
        'predict/<str:job_id>/',
        PredictionJobView.as_view(),
        name='predict-job',
    ),
    path(
        'model-info/',
        ModelInfoView.as_view(),
        name='model-info',
    ),
    path(
        'stocks/',
        BloodStockListCreateView.as_view(),
        name='stock-list',
    ),
    path(
        'stocks/batch/',
        BloodStockBatchView.as_view(),
        name='stock-batch',
    ),
    path(
        'stocks/adjust/',
        BloodStockAdjustmentView.as_view(),
        name='stock-adjust',
    ),
    path(
        'stocks/current/',
        BloodStockCurrentSummaryView.as_view(),
        name='stock-current',
    ),
]
