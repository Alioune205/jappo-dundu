"""
Routes de l'application Security.

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .authentication import (
    JappoDunduTokenObtainPairView,
    JappoDunduTokenRefreshView,
    JappoDunduTokenVerifyView,
    LogoutView,
)
from .views import AuditLogView, EmergencyAccessView, SystemStatusView, TwoFactorView, health_check

app_name = 'security'

# Monté sous /api/
urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('status/', SystemStatusView.as_view(), name='system-status'),
    path('security/audit/', AuditLogView.as_view(), name='audit-log'),
    path('security/emergency-access/', EmergencyAccessView.as_view(), name='emergency-access'),
]

# Monté sous /api/auth/ (noms d'URL conservés pour la compatibilité)
auth_urlpatterns = [
    path(
        'token/',
        JappoDunduTokenObtainPairView.as_view(),
        name='token_obtain_pair',
    ),
    path(
        'token/refresh/',
        JappoDunduTokenRefreshView.as_view(),
        name='token_refresh',
    ),
    path(
        'token/verify/',
        JappoDunduTokenVerifyView.as_view(),
        name='token_verify',
    ),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('2fa/', TwoFactorView.as_view(), name='two-factor'),
    path('2fa/<str:step>/', TwoFactorView.as_view(), name='two-factor-step'),
]
