"""
URL configuration for Jappo Dundu backend.

Auteur initial : Pape Alioune Sene (structure)
Routes sécurité/JWT/ML : El Hadji Massogui Diop
"""

from django.contrib import admin
from django.urls import include, path

from security.urls import auth_urlpatterns

urlpatterns = [
    # Admin Django
    path('admin/', admin.site.urls),

    # === Authentification JWT (El Hadji Massogui Diop) ===
    path('api/auth/', include(auth_urlpatterns)),

    # === Supervision (El Hadji Massogui Diop) ===
    path('api/', include('security.urls')),

    # === Machine Learning (El Hadji Massogui Diop) ===
    path('api/ml/', include('ml.urls')),
]
