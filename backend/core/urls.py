"""
URL configuration for Jappo Dundu backend.

Auteur initial : Pape Alioune Sene (structure)
Routes sécurité/JWT/ML : El Hadji Massogui Diop
"""

from django.contrib import admin
from django.urls import include, path

from security.authentication import (
    JappoDunduTokenObtainPairView,
    JappoDunduTokenRefreshView,
)

urlpatterns = [
    # Admin Django
    path('admin/', admin.site.urls),

    # === Authentification JWT (El Hadji Massogui Diop) ===
    path(
        'api/auth/token/',
        JappoDunduTokenObtainPairView.as_view(),
        name='token_obtain_pair',
    ),
    path(
        'api/auth/token/refresh/',
        JappoDunduTokenRefreshView.as_view(),
        name='token_refresh',
    ),

    # === Sécurité & Monitoring (El Hadji Massogui Diop) ===
    path('api/', include('security.urls')),

    # === Machine Learning (El Hadji Massogui Diop) ===
    path('api/ml/', include('ml.urls')),
]
