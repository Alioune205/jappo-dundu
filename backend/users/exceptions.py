"""
Exceptions d'API partagées par les modules métier.

Auteur : Ibrahima Khalilou Diallo
"""

from rest_framework import status
from rest_framework.exceptions import APIException


class Conflict(APIException):
    """409 : l'action est incompatible avec l'état actuel de la ressource."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "L'action est incompatible avec l'état actuel de la ressource."
    default_code = 'conflict'
