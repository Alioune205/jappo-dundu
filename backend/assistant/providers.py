"""
Appel des modèles de langage : Gemini d'abord, Grok (xAI) en secours.

Si Gemini échoue (clé absente ou invalide, quota épuisé, délai dépassé,
réponse vide), la même question part vers Grok. Si les deux échouent,
``AssistantUnavailable`` est levée : le site web répond alors avec son
assistant local (calculs sur les données, sans modèle de langage).

Réglages (.env du backend) : GEMINI_API_KEY, GEMINI_MODEL, GROK_API_KEY,
GROK_MODEL, ASSISTANT_TIMEOUT_SECONDS. Les clés ne quittent jamais le serveur.
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger('jappo_dundu.assistant')

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
GROK_URL = 'https://api.x.ai/v1/chat/completions'

SYSTEM_PROMPT = """Tu es Jappo, l'assistant de supervision de la plateforme Jappo Dundu (sang, lits d'hôpital et ambulances SAMU au Sénégal). Tu échanges avec {first_name}, l'administrateur général, comme un collègue expérimenté de la régulation qui fait un point de vive voix.

Ton et style :
- Français naturel et chaleureux, vouvoiement, phrases courtes. Pas de jargon ni de ton administratif.
- Va droit à l'essentiel dès la première phrase. Ne dis « Bonjour » que si l'on te salue.
- Varie tes tournures ; évite les formules toutes faites (« Voici la situation… », « N'hésitez pas… »).
- Quand la situation est tendue, dis-le calmement, sans dramatiser ; quand tout va bien, dis-le simplement.
- 3 à 6 lignes en général ; une courte liste « - » seulement si elle aide vraiment ; gras (**…**) avec parcimonie.
- Si c'est utile, termine par UNE courte question de suivi (ex. « Je regarde le détail pour Fann ? »).
- Si la question est ambiguë, demande une précision au lieu de deviner.
- Tu suis la conversation : « et à Fann ? » fait référence aux échanges précédents.

Règles de fond :
- Appuie-toi UNIQUEMENT sur les données fournies ; donne des chiffres exacts. Si l'information manque, dis-le.
- L'administrateur supervise en lecture seule : ne prétends jamais avoir agi et ne propose pas d'action
  qu'il ferait lui-même dans la plateforme ; oriente vers l'établissement, le CNTS ou la régulation SAMU.
- Pas d'avis médical sur un patient. Pour une urgence vitale individuelle : SAMU (1515)."""


class AssistantUnavailable(Exception):
    """Aucun fournisseur n'a pu répondre."""


def _post_json(url, body, headers):
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', **headers},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as response:
        return json.load(response)


def ask_gemini(system, history, prompt):
    # Les modèles récents « réfléchissent » avant de répondre et cette réflexion
    # compte dans maxOutputTokens : plafond large, réflexion courte (réponse en ~5 s).
    generation = {'temperature': 0.2, 'maxOutputTokens': 2048}
    if settings.GEMINI_THINKING_LEVEL:
        generation['thinkingConfig'] = {'thinkingLevel': settings.GEMINI_THINKING_LEVEL}
    payload = _post_json(
        GEMINI_URL.format(model=settings.GEMINI_MODEL),
        {
            'systemInstruction': {'parts': [{'text': system}]},
            'contents': [
                *({'role': 'model' if turn['role'] == 'assistant' else 'user', 'parts': [{'text': turn['content']}]}
                  for turn in history),
                {'role': 'user', 'parts': [{'text': prompt}]},
            ],
            'generationConfig': generation,
        },
        {'x-goog-api-key': settings.GEMINI_API_KEY},
    )
    parts = payload['candidates'][0]['content']['parts']
    return ''.join(part.get('text', '') for part in parts)


def ask_grok(system, history, prompt):
    payload = _post_json(
        GROK_URL,
        {
            'model': settings.GROK_MODEL,
            'messages': [
                {'role': 'system', 'content': system},
                *({'role': turn['role'], 'content': turn['content']} for turn in history),
                {'role': 'user', 'content': prompt},
            ],
            'temperature': 0.2,
            'max_tokens': 2048,
        },
        {'Authorization': f'Bearer {settings.GROK_API_KEY}'},
    )
    return payload['choices'][0]['message']['content']


PROVIDERS = (
    ('gemini', 'GEMINI_API_KEY', ask_gemini),
    ('grok', 'GROK_API_KEY', ask_grok),
)


def ask(question, snapshot, history=(), first_name=''):
    """Pose la question avec les données du réseau et les derniers échanges.

    Retourne (réponse, fournisseur). Les données ne sont jointes qu'à la
    dernière question : elles sont toujours à jour, et l'historique reste court.
    """
    system = SYSTEM_PROMPT.format(first_name=first_name or "l'administrateur")
    history = [turn for turn in history if turn.get('content')]
    # Gemini exige qu'une conversation commence par l'utilisateur.
    while history and history[0]['role'] == 'assistant':
        history.pop(0)
    prompt = (
        "Données actuelles du réseau (JSON) :\n"
        f"{json.dumps(snapshot, ensure_ascii=False)}\n\n"
        f"Question de l'administrateur : {question}"
    )
    for name, key_setting, call in PROVIDERS:
        if not getattr(settings, key_setting, ''):
            continue
        try:
            answer = (call(system, history, prompt) or '').strip()
        except urllib.error.HTTPError as error:
            # 429 : quota épuisé ; 401/403 : clé refusée. Le corps n'est pas journalisé (il peut citer la clé).
            logger.warning("Assistant : %s indisponible (HTTP %s), bascule sur le suivant.", name, error.code)
            continue
        except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, ValueError) as error:
            logger.warning("Assistant : %s indisponible (%s), bascule sur le suivant.", name, type(error).__name__)
            continue
        if answer:
            return answer, name
        logger.warning("Assistant : réponse vide de %s, bascule sur le suivant.", name)
    raise AssistantUnavailable
