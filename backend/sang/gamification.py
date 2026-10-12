"""
Module de Gamification et Valorisation des Donneurs.

Gère les points de fidélité, les paliers de dons, les niveaux et l'attribution
automatique des badges de reconnaissance pour encourager le don régulier.

Auteur : Pape Alioune Sene
"""

import logging
from django.db import transaction
from django.utils import timezone

from .models import Badge, Donation, DonorBadge

logger = logging.getLogger('jappo_dundu.sang')

# Référentiel des badges par défaut du système Jappo Dundu
DEFAULT_BADGES = [
    {
        'code': 'first_donation',
        'name': 'Premier Pas',
        'description': 'A accompli son tout premier don de sang avec Jappo Dundu.',
        'icon': 'heart',
        'points_bonus': 100,
        'category': Badge.Category.MILESTONE,
        'required_donations': 1,
    },
    {
        'code': 'regular_donor',
        'name': 'Donneur Régulier',
        'description': 'A effectué au moins 3 dons de sang.',
        'icon': 'repeat',
        'points_bonus': 150,
        'category': Badge.Category.MILESTONE,
        'required_donations': 3,
    },
    {
        'code': 'bronze_donor',
        'name': 'Donneur de Bronze',
        'description': 'A franchi le cap héroïque des 5 dons de sang.',
        'icon': 'award',
        'points_bonus': 250,
        'category': Badge.Category.MILESTONE,
        'required_donations': 5,
    },
    {
        'code': 'silver_donor',
        'name': 'Donneur d’Argent',
        'description': '10 dons enregistrés : un engagement citoyen remarquable.',
        'icon': 'star',
        'points_bonus': 500,
        'category': Badge.Category.MILESTONE,
        'required_donations': 10,
    },
    {
        'code': 'gold_donor',
        'name': 'Donneur d’Or',
        'description': '20 dons enregistrés : une véritable légende du don de sang.',
        'icon': 'shield',
        'points_bonus': 1000,
        'category': Badge.Category.MILESTONE,
        'required_donations': 20,
    },
    {
        'code': 'universal_savior',
        'name': 'Sauveur Universel',
        'description': 'Donneur du groupe rare O- (donneur universel) ayant donné son sang.',
        'icon': 'globe',
        'points_bonus': 200,
        'category': Badge.Category.SPECIAL,
        'required_donations': 1,
    },
    {
        'code': 'life_saver',
        'name': 'Sauveur en Détresse',
        'description': 'A répondu et donné suite à une demande d’extrême urgence critique.',
        'icon': 'zap',
        'points_bonus': 200,
        'category': Badge.Category.SOLIDARITY,
        'required_donations': 0,
    },
]

LEVELS = [
    {'level': 1, 'title': 'Citoyen Solidaire', 'min_points': 0, 'max_points': 99},
    {'level': 2, 'title': 'Donneur Engagé', 'min_points': 100, 'max_points': 299},
    {'level': 3, 'title': 'Gardien de Vie', 'min_points': 300, 'max_points': 599},
    {'level': 4, 'title': 'Héros National', 'min_points': 600, 'max_points': 999},
    {'level': 5, 'title': 'Légende Jappo Dundu', 'min_points': 1000, 'max_points': None},
]


def ensure_default_badges():
    """Garantit l'existence des badges officiels en base de données."""
    badges = []
    for spec in DEFAULT_BADGES:
        b, _ = Badge.objects.update_or_create(
            code=spec['code'],
            defaults={
                'name': spec['name'],
                'description': spec['description'],
                'icon': spec['icon'],
                'points_bonus': spec['points_bonus'],
                'category': spec['category'],
                'required_donations': spec['required_donations'],
            },
        )
        badges.append(b)
    return badges


def get_level_info(points):
    """Calcule le niveau et la progression vers le niveau suivant."""
    for i, lvl in enumerate(LEVELS):
        if lvl['max_points'] is None or points <= lvl['max_points']:
            is_max = lvl['max_points'] is None
            if is_max:
                progress = 100
                next_threshold = None
            else:
                span = (lvl['max_points'] + 1) - lvl['min_points']
                progress = min(100, max(0, int((points - lvl['min_points']) / span * 100)))
                next_threshold = lvl['max_points'] + 1
            return {
                'level': lvl['level'],
                'title': lvl['title'],
                'progress_percent': progress,
                'next_level_points': next_threshold,
                'points_to_next_level': (next_threshold - points) if next_threshold else 0,
            }
    return {
        'level': 5,
        'title': 'Légende Jappo Dundu',
        'progress_percent': 100,
        'next_level_points': None,
        'points_to_next_level': 0,
    }


def calculate_donor_points(donor):
    """Calcule le capital de points d'un donneur."""
    donations = donor.donations.all()
    # 100 points par don standard + 50 points bonus si don pour urgence critique
    points_donations = 0
    for d in donations:
        points_donations += 100
        if d.blood_request and d.blood_request.urgency == 'critical':
            points_donations += 50

    # Points des badges obtenus
    earned_badges = donor.earned_badges.select_related('badge').all()
    points_badges = sum(eb.badge.points_bonus for eb in earned_badges)

    return {
        'total_points': points_donations + points_badges,
        'donation_points': points_donations,
        'badge_points': points_badges,
        'donations_count': donations.count(),
    }


@transaction.atomic
def evaluate_and_award_badges(donor):
    """Vérifie l'éligibilité et attribue les nouveaux badges mérités."""
    ensure_default_badges()
    donations_count = donor.donations.count()
    has_critical_donation = donor.donations.filter(blood_request__urgency='critical').exists()
    is_o_negative = donor.blood_group == 'O-'

    already_earned = set(donor.earned_badges.values_list('badge__code', flat=True))
    newly_awarded = []

    all_badges = {b.code: b for b in Badge.objects.all()}

    # 1. Paliers de dons
    for b_code, req in [
        ('first_donation', 1),
        ('regular_donor', 3),
        ('bronze_donor', 5),
        ('silver_donor', 10),
        ('gold_donor', 20),
    ]:
        if donations_count >= req and b_code not in already_earned and b_code in all_badges:
            badge = all_badges[b_code]
            DonorBadge.objects.create(donor=donor, badge=badge)
            newly_awarded.append(badge)

    # 2. Sauveur Universel (O-)
    if is_o_negative and donations_count >= 1 and 'universal_savior' not in already_earned:
        badge = all_badges.get('universal_savior')
        if badge:
            DonorBadge.objects.create(donor=donor, badge=badge)
            newly_awarded.append(badge)

    # 3. Sauveur en Détresse (don sur urgence critique)
    if has_critical_donation and 'life_saver' not in already_earned:
        badge = all_badges.get('life_saver')
        if badge:
            DonorBadge.objects.create(donor=donor, badge=badge)
            newly_awarded.append(badge)

    if newly_awarded:
        logger.info(
            "Gamification : %d nouveau(x) badge(s) attribué(s) au donneur %s",
            len(newly_awarded),
            donor.pk,
        )

    return newly_awarded


def get_donor_gamification_profile(donor):
    """Génère le profil de gamification complet d'un donneur."""
    ensure_default_badges()
    points_info = calculate_donor_points(donor)
    level_info = get_level_info(points_info['total_points'])

    earned_badges = list(
        donor.earned_badges.select_related('badge')
        .order_by('-awarded_at')
    )
    earned_ids = {eb.badge_id for eb in earned_badges}

    all_badges = Badge.objects.all()
    available_badges = []
    for b in all_badges:
        if b.id not in earned_ids:
            available_badges.append({
                'id': b.id,
                'code': b.code,
                'name': b.name,
                'description': b.description,
                'icon': b.icon,
                'points_bonus': b.points_bonus,
                'category': b.category,
                'required_donations': b.required_donations,
                'unlocked': False,
            })

    unlocked_badges = [
        {
            'id': eb.badge.id,
            'code': eb.badge.code,
            'name': eb.badge.name,
            'description': eb.badge.description,
            'icon': eb.badge.icon,
            'points_bonus': eb.badge.points_bonus,
            'category': eb.badge.category,
            'awarded_at': eb.awarded_at,
            'unlocked': True,
        }
        for eb in earned_badges
    ]

    return {
        'donor_id': donor.id,
        'blood_group': donor.blood_group,
        'points': points_info['total_points'],
        'donation_points': points_info['donation_points'],
        'badge_points': points_info['badge_points'],
        'donations_count': points_info['donations_count'],
        'level': level_info['level'],
        'title': level_info['title'],
        'progress_percent': level_info['progress_percent'],
        'next_level_points': level_info['next_level_points'],
        'points_to_next_level': level_info['points_to_next_level'],
        'earned_badges_count': len(unlocked_badges),
        'badges': unlocked_badges,
        'locked_badges': available_badges,
    }
