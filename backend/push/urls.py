"""Routes des notifications push (montées sous /api/push/)."""

from django.urls import path

from .views import DeviceRegisterView, DeviceUnregisterView

app_name = 'push'

urlpatterns = [
    path('devices/', DeviceRegisterView.as_view(), name='device-register'),
    path('devices/unregister/', DeviceUnregisterView.as_view(), name='device-unregister'),
]
