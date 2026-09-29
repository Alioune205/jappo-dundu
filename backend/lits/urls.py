"""
Routes de l'application Lits (montées sous /api/lits/).

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.routers import SimpleRouter

from .views import BedCapacityViewSet

app_name = 'lits'

router = SimpleRouter()
router.register('capacities', BedCapacityViewSet, basename='bed-capacity')

urlpatterns = router.urls
