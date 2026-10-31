"""
Routes de l'application Ambulances (montées sous /api/ambulances/).

Auteur : Ibrahima Khalilou Diallo
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import AmbulanceViewSet, EmergencyProfileView, MissionViewSet, SosCancelView, SosView, TriageView

app_name = 'ambulances'

router = SimpleRouter()
router.register('vehicles', AmbulanceViewSet, basename='ambulance')
router.register('missions', MissionViewSet, basename='mission')

urlpatterns = [
    path('sos/', SosView.as_view(), name='sos'),
    path('sos/profile/', EmergencyProfileView.as_view(), name='sos-profile'),
    path('triage/', TriageView.as_view(), name='triage'),
    path('sos/<int:pk>/cancel/', SosCancelView.as_view(), name='sos-cancel'),
    *router.urls,
]
