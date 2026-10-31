"""
Routes d'interopérabilité SIH (montées sous /api/sih/).

Auteur : Pape Alioune Sene
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    Dhis2ExportView,
    FhirBedsView,
    HospitalApiKeyViewSet,
    SIHBedEventView,
    SIHBedsSyncView,
    SIHBloodStockSyncView,
    SIHLogsView,
    SIHPingView,
    SIHStatusSummaryView,
    SyncMonitoringView,
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
    path('fhir/beds/', FhirBedsView.as_view(), name='fhir-beds'),
    path('dhis2/', Dhis2ExportView.as_view(), name='dhis2-export'),
    path('monitoring/', SyncMonitoringView.as_view(), name='sync-monitoring'),
    *router.urls,
]
