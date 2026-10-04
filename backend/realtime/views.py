"""
Émission des tickets de connexion WebSocket (voir tickets.py).

Auteur : El Hadji Massogui Diop
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from .tickets import issue_ticket


class WebSocketTicketView(APIView):
    """POST /api/realtime/ticket/ → ticket WebSocket à usage unique (JWT requis)."""

    def post(self, request):
        ticket, ttl = issue_ticket(request.user)
        return Response({'ticket': ticket, 'expires_in': ttl}, status=201)
