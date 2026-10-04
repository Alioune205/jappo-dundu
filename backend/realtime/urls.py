"""
Routes HTTP du temps réel (montées sous /api/realtime/).

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .views import WebSocketTicketView

app_name = 'realtime'

urlpatterns = [
    path('ticket/', WebSocketTicketView.as_view(), name='ws-ticket'),
]
