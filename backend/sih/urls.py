"""
Routes d'interopérabilité SIH (montées sous /api/sih/).

Auteur : Pape Alioune Sene
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    HospitalApiKeyViewSet,
    SIHBedEventView,
    SIHBedsSyncView,
    SIHBloodStockSyncView,
    SIHLogsView,
    SIHPingView,
    SIHStatusSummaryView,
)

app_name = 'sih'

router = SimpleRouter()
router.register('keys', HospitalApiKeyViewSet, basename='sih-keys')

urlpatterns = [
    path('ping/', SIHPingView.as_view(), name='sih-ping'),
    path('status/', SIHStatusSummaryView.as_view(), name='sih-status'),
    path('beds/status/', SIHBedsSyncView.as_view(), name='sih-beds-status'),
    path('beds/sync/', SIHBedsSyncView.as_view(), name='sih-beds-sync'),
    path('beds/event/', SIHBedEventView.as_view(), name='sih-beds-event'),
    path('stocks/status/', SIHBloodStockSyncView.as_view(), name='sih-stocks-status'),
    path('stocks/sync/', SIHBloodStockSyncView.as_view(), name='sih-stocks-sync'),
    path('logs/', SIHLogsView.as_view(), name='sih-logs'),
    *router.urls,
]
