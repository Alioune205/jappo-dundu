"""
Routage WebSocket de Jappo Dundu.

Auteur : El Hadji Massogui Diop
"""

from django.urls import path

from .consumers import AlertConsumer, DashboardConsumer

websocket_urlpatterns = [
    path('ws/alerts/', AlertConsumer.as_asgi()),
    path('ws/dashboard/', DashboardConsumer.as_asgi()),
]
