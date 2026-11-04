"""
URL configuration for Jappo Dundu backend.

Auteur initial : Pape Alioune Sene (structure)
Routes sécurité/JWT/ML : El Hadji Massogui Diop
Routes métier (users, sang, lits, ambulances) : Ibrahima Khalilou Diallo
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerSplitView

from security.urls import auth_urlpatterns
from users.urls import facility_urlpatterns

urlpatterns = [
    # Admin Django
    path('admin/', admin.site.urls),

    # === Documentation de l'API : schéma OpenAPI 3, Swagger UI et ReDoc ===
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # Variante « split » : le script d'initialisation est un fichier servi par
    # le serveur, et non un script en ligne que la CSP bloquerait.
    path('api/docs/', SpectacularSwaggerSplitView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # === Authentification JWT (El Hadji Massogui Diop) ===
    path('api/auth/', include(auth_urlpatterns)),
    # === Récupération de compte et connexion sociale (Pape Alioune Sene) ===
    path('api/auth/', include('identity.urls')),

    # === Supervision (El Hadji Massogui Diop) ===
    path('api/', include('security.urls')),

    # === Machine Learning (El Hadji Massogui Diop) ===
    path('api/ml/', include('ml.urls')),
    # === Temps réel : tickets de connexion WebSocket (El Hadji Massogui Diop) ===
    path('api/realtime/', include('realtime.urls')),
    # === Notifications push de l'application mobile (Pape Alioune Sene) ===
    path('api/push/', include('push.urls')),

    # === Cœur métier (Ibrahima Khalilou Diallo) ===
    path('api/users/', include('users.urls')),
    path('api/facilities/', include(facility_urlpatterns)),
    path('api/sang/', include('sang.urls')),
    path('api/lits/', include('lits.urls')),
    path('api/ambulances/', include('ambulances.urls')),

    # === Interopérabilité SIH (Pape Alioune Sene) ===
    path('api/sih/', include('sih.urls')),

    # === Assistant IA de supervision ===
    path('api/assistant/', include('assistant.urls')),
]
