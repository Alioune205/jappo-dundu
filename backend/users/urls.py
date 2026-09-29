"""
Routes de l'application Users.

- ``urlpatterns``          : monté sous /api/users/
- ``facility_urlpatterns`` : monté sous /api/facilities/

Auteur : Ibrahima Khalilou Diallo
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    AccountView,
    HealthFacilityViewSet,
    PasswordChangeView,
    RegisterView,
    UserAdminViewSet,
)

app_name = 'users'

_user_router = SimpleRouter()
_user_router.register('', UserAdminViewSet, basename='user')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', AccountView.as_view(), name='account'),
    path('me/password/', PasswordChangeView.as_view(), name='password-change'),
    *_user_router.urls,
]

_facility_router = SimpleRouter()
_facility_router.register('', HealthFacilityViewSet, basename='facility')

facility_urlpatterns = (_facility_router.urls, 'facilities')
