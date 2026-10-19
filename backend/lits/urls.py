"""
Routes de l'application Lits (montées sous /api/lits/).

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework.routers import SimpleRouter

from .views import BedCapacityViewSet, BedReservationViewSet

app_name = 'lits'

router = SimpleRouter()
router.register('capacities', BedCapacityViewSet, basename='bed-capacity')
router.register('reservations', BedReservationViewSet, basename='bed-reservation')

urlpatterns = router.urls
