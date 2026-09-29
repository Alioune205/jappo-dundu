"""
URL configuration for Jappo Dundu backend.

Auteur initial : Pape Alioune Sene (structure)
Routes sécurité/JWT/ML : El Hadji Massogui Diop
Routes métier (users, sang, lits, ambulances) : Ibrahima Khalilou Diallo
"""

from django.contrib import admin
from django.urls import include, path

from security.urls import auth_urlpatterns
from users.urls import facility_urlpatterns

urlpatterns = [
    # Admin Django
    path('admin/', admin.site.urls),

    # === Authentification JWT (El Hadji Massogui Diop) ===
    path('api/auth/', include(auth_urlpatterns)),

    # === Supervision (El Hadji Massogui Diop) ===
    path('api/', include('security.urls')),

    # === Machine Learning (El Hadji Massogui Diop) ===
    path('api/ml/', include('ml.urls')),

    # === Cœur métier (Ibrahima Khalilou Diallo) ===
    path('api/users/', include('users.urls')),
    path('api/facilities/', include(facility_urlpatterns)),
    path('api/sang/', include('sang.urls')),
    path('api/lits/', include('lits.urls')),
    path('api/ambulances/', include('ambulances.urls')),
]
