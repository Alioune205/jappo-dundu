"""
ASGI config for Jappo Dundu backend.

Route le HTTP vers Django et les WebSockets vers Django Channels
(authentification JWT, voir realtime/auth.py).

Auteur initial : Pape Alioune Sene (structure)
Configuration Channels/WebSocket : El Hadji Massogui Diop
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Initialiser Django AVANT d'importer les modules applicatifs
django_asgi_app = get_asgi_application()

from realtime.auth import JWTAuthMiddlewareStack  # noqa: E402
from realtime.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})
