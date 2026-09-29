"""
Routes de l'application Sang (montées sous /api/sang/).

Auteur : Ibrahima Khalilou Diallo
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    BloodRequestViewSet,
    CompatibilityView,
    DonationViewSet,
    DonorLookupView,
    DonorProfileView,
    MyDonationsView,
    MyResponsesView,
)

app_name = 'sang'

router = SimpleRouter()
router.register('requests', BloodRequestViewSet, basename='blood-request')
router.register('donations', DonationViewSet, basename='donation')

urlpatterns = [
    path('donors/me/', DonorProfileView.as_view(), name='donor-profile'),
    path('donors/me/donations/', MyDonationsView.as_view(), name='my-donations'),
    path('donors/me/responses/', MyResponsesView.as_view(), name='my-responses'),
    path('donors/lookup/', DonorLookupView.as_view(), name='donor-lookup'),
    path('compatibility/', CompatibilityView.as_view(), name='compatibility'),
    *router.urls,
]
