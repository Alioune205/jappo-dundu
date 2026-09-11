"""
ASGI config for Jappo Dundu backend.

Configure le routage ASGI pour supporter à la fois HTTP et WebSocket
via Django Channels.

Auteur initial : Pape Alioune Sene (structure)
Configuration Channels/WebSocket : El Hadji Massogui Diop
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Initialiser Django AVANT d'importer les modules applicatifs
django_asgi_app = get_asgi_application()

# Import après initialisation Django
from websockets.middleware import JWTAuthMiddlewareStack  # noqa: E402
from websockets.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    # HTTP classique — traité par Django
    'http': django_asgi_app,

    # WebSocket — traité par Django Channels avec auth JWT
    'websocket': JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
