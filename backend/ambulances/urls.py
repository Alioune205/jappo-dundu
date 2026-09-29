"""
Routes de l'application Ambulances (montées sous /api/ambulances/).

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.routers import SimpleRouter

from .views import AmbulanceViewSet, MissionViewSet

app_name = 'ambulances'

router = SimpleRouter()
router.register('vehicles', AmbulanceViewSet, basename='ambulance')
router.register('missions', MissionViewSet, basename='mission')

urlpatterns = router.urls
