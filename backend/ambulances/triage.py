"""
Tri de l'appel et consignes en attendant l'ambulance.

Quelques questions clés, posées dans le même ordre à chaque appel, donnent
une **priorité suggérée** et les **consignes** à transmettre à l'appelant
(principe des protocoles de régulation médicale : interrogatoire structuré,
puis conseils avant l'arrivée des secours). La priorité reste une suggestion :
le régulateur décide.

Source unique : l'écran de régulation (web) et l'écran SOS (mobile) lisent
les questions et les consignes ici (``GET /api/ambulances/triage/``).

⚠️ Contenu à faire valider par le médecin régulateur du SAMU avant usage réel.
"""

from .models import Mission

Priority = Mission.Priority

QUESTIONS = [
    {
        'code': 'conscious',
        'label': "La personne est-elle consciente (répond, ouvre les yeux) ?",
        'choices': [('yes', "Oui"), ('no', "Non"), ('unknown', "Ne sait pas")],
    },
    {
        'code': 'breathing',
        'label': "Respire-t-elle ?",
        'choices': [('normal', "Normalement"), ('difficult', "Avec difficulté"), ('absent', "Ne respire pas")],
    },
    {
        'code': 'bleeding',
        'label': "Saignement important qui ne s'arrête pas ?",
        'choices': [('yes', "Oui"), ('no', "Non")],
    },
    {
        'code': 'chest_pain',
        'label': "Douleur à la poitrine ?",
        'choices': [('yes', "Oui"), ('no', "Non")],
    },
    {
        'code': 'situation',
        'label': "Situation",
        'choices': [
            ('illness', "Malaise / maladie"),
            ('road_accident', "Accident de la route"),
            ('fall', "Chute / traumatisme"),
            ('labor', "Accouchement / grossesse"),
            ('burn', "Brûlure"),
            ('choking', "Étouffement"),
            ('violence', "Agression / plaie"),
        ],
    },
    {
        'code': 'victims',
        'label': "Nombre de victimes",
        'choices': [('1', "Une"), ('2-4', "2 à 4"), ('5+', "5 ou plus")],
    },
]

QUESTION_CODES = {question['code']: {code for code, _ in question['choices']} for question in QUESTIONS}

# Consignes à lire à l'appelant (texte simple, phrases courtes).
INSTRUCTIONS = {
    'cpr': {
        'title': "Massage cardiaque",
        'steps': [
            "Allongez la personne sur le dos, sur un sol dur.",
            "Mains l'une sur l'autre au milieu de la poitrine.",
            "Appuyez fort et vite : 100 à 120 fois par minute, bras tendus.",
            "Ne vous arrêtez pas avant l'arrivée des secours.",
        ],
    },
    'recovery_position': {
        'title': "Position latérale de sécurité",
        'steps': [
            "Vérifiez qu'elle respire : la poitrine se soulève.",
            "Tournez-la sur le côté, la tête légèrement en arrière.",
            "Restez à côté et surveillez sa respiration.",
        ],
    },
    'bleeding': {
        'title': "Arrêter le saignement",
        'steps': [
            "Appuyez fort sur la plaie avec un tissu propre.",
            "Ne relâchez pas la pression.",
            "Allongez la personne et couvrez-la.",
        ],
    },
    'breathing': {
        'title': "Difficulté à respirer",
        'steps': [
            "Installez la personne assise, le dos droit.",
            "Desserrez ses vêtements, aérez la pièce.",
            "Si elle a un traitement (inhalateur), aidez-la à le prendre.",
        ],
    },
    'chest_pain': {
        'title': "Douleur à la poitrine",
        'steps': [
            "Mettez la personne au repos, assise ou demi-assise.",
            "Elle ne doit faire aucun effort ni marcher.",
            "Notez l'heure du début de la douleur.",
        ],
    },
    'labor': {
        'title': "Accouchement",
        'steps': [
            "Allongez la mère sur le côté gauche, au calme.",
            "Préparez des linges propres et une couverture pour le bébé.",
            "Ne tirez jamais sur le bébé ni sur le cordon.",
        ],
    },
    'burn': {
        'title': "Brûlure",
        'steps': [
            "Refroidissez la brûlure à l'eau tempérée pendant 15 minutes.",
            "Retirez bagues et vêtements non collés à la peau.",
            "Ne mettez ni huile, ni dentifrice, ni beurre.",
        ],
    },
    'choking': {
        'title': "Étouffement",
        'steps': [
            "Donnez jusqu'à 5 tapes fortes dans le dos, entre les omoplates.",
            "Si cela ne suffit pas : 5 compressions sous les côtes, vers le haut.",
            "Alternez jusqu'à ce que l'objet sorte.",
        ],
    },
    'trauma': {
        'title': "Victime d'un accident ou d'une chute",
        'steps': [
            "Ne déplacez pas la victime sauf danger immédiat.",
            "Ne retirez pas le casque d'un motard.",
            "Protégez la zone (feux de détresse, triangle).",
        ],
    },
    'stay_safe': {
        'title': "En attendant",
        'steps': [
            "Restez près de la personne et gardez votre téléphone libre.",
            "Envoyez quelqu'un accueillir l'ambulance au point de repère.",
        ],
    },
}

# Situation → consigne propre à la situation.
SITUATION_INSTRUCTION = {
    'labor': 'labor',
    'burn': 'burn',
    'choking': 'choking',
    'road_accident': 'trauma',
    'fall': 'trauma',
}


# Type d'alerte SOS (application citoyenne) → réponses du tri : la régulation
# voit les mêmes consignes que l'appelant.
SOS_ANSWERS = {
    'accident': {'situation': 'road_accident'},
    'malaise': {'conscious': 'no'},
    'breathing': {'breathing': 'difficult'},
    'childbirth': {'situation': 'labor'},
    'other': {},
}


def instructions_for(answers):
    """Consignes complètes (titre et étapes) pour des réponses de tri, dans l'ordre."""
    return [dict(INSTRUCTIONS[code], code=code) for code in assess(answers)['instructions']]


def clean_answers(answers):
    """Garde les réponses connues ; ignore les codes inconnus (formulaire ancien)."""
    if not isinstance(answers, dict):
        return {}
    return {
        code: value
        for code, value in answers.items()
        if code in QUESTION_CODES and isinstance(value, str) and value in QUESTION_CODES[code]
    }


def assess(answers):
    """Priorité suggérée et consignes, à partir des réponses du tri.

    Retourne ``{'priority', 'reasons', 'instructions'}`` ; ``instructions``
    est la liste ordonnée des codes de ``INSTRUCTIONS``.
    """
    answers = clean_answers(answers)
    reasons = []
    instructions = []
    priority = Priority.NORMAL

    def escalate(level, reason):
        nonlocal priority
        order = [Priority.NORMAL, Priority.URGENT, Priority.CRITICAL]
        if order.index(level) > order.index(priority):
            priority = level
        reasons.append(reason)

    breathing = answers.get('breathing')
    conscious = answers.get('conscious')
    situation = answers.get('situation')

    if breathing == 'absent':
        escalate(Priority.CRITICAL, "Ne respire pas")
        instructions.append('cpr')
    elif conscious == 'no':
        escalate(Priority.CRITICAL, "Inconscient")
        instructions.append('recovery_position')
    if answers.get('bleeding') == 'yes':
        escalate(Priority.CRITICAL, "Hémorragie")
        instructions.append('bleeding')
    if breathing == 'difficult':
        escalate(Priority.URGENT, "Détresse respiratoire")
        instructions.append('breathing')
    if answers.get('chest_pain') == 'yes':
        escalate(Priority.URGENT, "Douleur thoracique")
        instructions.append('chest_pain')
    if situation in ('road_accident', 'labor', 'burn', 'violence'):
        escalate(Priority.URGENT, dict(QUESTIONS[4]['choices'])[situation])
    if situation == 'choking':
        escalate(Priority.CRITICAL, "Étouffement")
    if answers.get('victims') == '5+':
        escalate(Priority.CRITICAL, "Nombreuses victimes")
    elif answers.get('victims') == '2-4':
        escalate(Priority.URGENT, "Plusieurs victimes")

    specific = SITUATION_INSTRUCTION.get(situation)
    if specific and specific not in instructions:
        instructions.append(specific)
    instructions.append('stay_safe')
    return {'priority': priority, 'reasons': reasons, 'instructions': instructions}


def protocol():
    """Questions et consignes, pour les écrans web et mobile."""
    return {
        'questions': [
            {
                'code': question['code'],
                'label': question['label'],
                'choices': [{'value': value, 'label': label} for value, label in question['choices']],
            }
            for question in QUESTIONS
        ],
        'instructions': {code: dict(content, code=code) for code, content in INSTRUCTIONS.items()},
        'disclaimer': "Priorité suggérée : la décision revient au régulateur.",
    }
