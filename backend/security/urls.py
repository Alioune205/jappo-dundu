"""
Routes de l'application Security.

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .views import HealthCheckView, SystemStatusView

app_name = 'security'

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('status/', SystemStatusView.as_view(), name='system-status'),
]
