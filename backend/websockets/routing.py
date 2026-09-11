"""
Routage WebSocket pour Jappo Dundu.

Définit les URL patterns pour les connexions WebSocket.

Auteur : El Hadji Massogui Diop
"""

from django.urls import re_path

from .consumers import AlertConsumer, DashboardConsumer

websocket_urlpatterns = [
    re_path(r'ws/alerts/$', AlertConsumer.as_asgi()),
    re_path(r'ws/dashboard/$', DashboardConsumer.as_asgi()),
]
