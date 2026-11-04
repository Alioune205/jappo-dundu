"""
POST /api/assistant/ask/ — question de l'administrateur général à Jappo IA.

Réservé à l'administrateur général (supervision nationale, lecture seule) :
la question part vers Gemini (Grok en secours) avec la photographie agrégée
du réseau. 503 si aucun fournisseur n'est configuré ou joignable : le site
web répond alors avec son assistant local.
"""

from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from security.permissions import IsAdmin

from .providers import AssistantUnavailable, ask
from .snapshot import network_snapshot


class TurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['user', 'assistant'])
    content = serializers.CharField(max_length=4000, allow_blank=True, trim_whitespace=True)


class QuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=500, trim_whitespace=True)
    # Derniers échanges de la conversation, pour les questions de suivi (« et à Fann ? »).
    history = TurnSerializer(many=True, required=False, max_length=8)


class AskAssistantView(APIView):
    permission_classes = [IsAdmin]
    throttle_scope = 'assistant'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = QuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            answer, provider = ask(
                serializer.validated_data['question'],
                network_snapshot(),
                history=serializer.validated_data.get('history', []),
                first_name=request.user.first_name,
            )
        except AssistantUnavailable:
            return Response(
                {'detail': "Assistant IA indisponible : aucune clé valide ou service injoignable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({'answer': answer, 'provider': provider})
