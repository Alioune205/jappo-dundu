"""
Routes de l'application Identity (montées sous /api/auth/).

Responsable du domaine : Pape Alioune Sene (application mobile)
"""

from django.urls import path

from .views import PasswordResetConfirmView, PasswordResetRequestView, SocialLoginView

app_name = 'identity'

urlpatterns = [
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('social/<str:provider>/', SocialLoginView.as_view(), name='social-login'),
]
