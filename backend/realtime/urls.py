"""
Routes HTTP du temps réel (montées sous /api/realtime/).

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .views import CriticalAlertAckView, CriticalAlertListView, WebSocketTicketView

app_name = 'realtime'

urlpatterns = [
    path('ticket/', WebSocketTicketView.as_view(), name='ws-ticket'),
    path('critical-alerts/', CriticalAlertListView.as_view(), name='critical-alerts'),
    path('critical-alerts/<int:pk>/ack/', CriticalAlertAckView.as_view(), name='critical-alert-ack'),
]
