"""
Routes de l'application ML.

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .views import (
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
        BloodStockListView.as_view(),
        name='stock-list',
    ),
]
