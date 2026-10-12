"""
Tests unitaires et d'intégration du système de Gamification des Donneurs.

Valide :
- Le calcul des points (dons standards, urgences critiques, badges)
- Les niveaux et la progression (Citoyen Solidaire -> Légende Jappo Dundu)
- L'attribution automatique et idempotente des badges de reconnaissance
- Les API REST GET /api/sang/donors/me/gamification/ et GET /api/sang/badges/
- L'intégration de la gamification lors de la confirmation d'un don

Auteur : Pape Alioune Sene
"""

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from security.roles import Role
from users.tests.factories import make_facility, make_user

from .. import gamification, services
from ..models import Badge, Donation, DonorBadge
from .helpers import make_donor, make_request


class GamificationLogicTests(TestCase):
    """Tests unitaires de la logique métier de gamification."""

    def setUp(self):
        self.facility = make_facility("Centre Hospitalier Principal")
        self.donor_o_pos = make_donor('amadou', blood_group='O+')
        self.donor_o_neg = make_donor('fatou', blood_group='O-')
        self.staff = make_user('staff_gamif', Role.HOSPITAL_STAFF, facility=self.facility)

    def test_ensure_default_badges_is_idempotent(self):
        badges_first = gamification.ensure_default_badges()
        self.assertGreaterEqual(len(badges_first), 7)
        count_first = Badge.objects.count()

        badges_second = gamification.ensure_default_badges()
        self.assertEqual(Badge.objects.count(), count_first)
        self.assertEqual(len(badges_second), count_first)

    def test_level_calculation_thresholds(self):
        # Niveau 1 (0-99)
        lvl1 = gamification.get_level_info(0)
        self.assertEqual(lvl1['level'], 1)
        self.assertEqual(lvl1['title'], 'Citoyen Solidaire')
        self.assertEqual(lvl1['progress_percent'], 0)
        self.assertEqual(lvl1['next_level_points'], 100)

        # Niveau 2 (100-299)
        lvl2 = gamification.get_level_info(100)
        self.assertEqual(lvl2['level'], 2)
        self.assertEqual(lvl2['title'], 'Donneur Engagé')

        # Niveau 3 (300-599)
        lvl3 = gamification.get_level_info(450)
        self.assertEqual(lvl3['level'], 3)
        self.assertEqual(lvl3['title'], 'Gardien de Vie')
        self.assertEqual(lvl3['progress_percent'], 50)

        # Niveau 4 (600-999)
        lvl4 = gamification.get_level_info(600)
        self.assertEqual(lvl4['level'], 4)
        self.assertEqual(lvl4['title'], 'Héros National')

        # Niveau 5 (1000+)
        lvl5 = gamification.get_level_info(1500)
        self.assertEqual(lvl5['level'], 5)
        self.assertEqual(lvl5['title'], 'Légende Jappo Dundu')
        self.assertEqual(lvl5['progress_percent'], 100)
        self.assertIsNone(lvl5['next_level_points'])
        self.assertEqual(lvl5['points_to_next_level'], 0)

    def test_calculate_donor_points_standard_and_critical(self):
        import datetime

        # 0 don
        pts = gamification.calculate_donor_points(self.donor_o_pos)
        self.assertEqual(pts['total_points'], 0)
        self.assertEqual(pts['donations_count'], 0)

        # 1 don standard il y a 4 mois (100 pts don + 100 pts badge first_donation = 200 pts total)
        past_date = timezone.localdate() - datetime.timedelta(days=120)
        services.record_donation(
            donor=self.donor_o_pos,
            facility=self.facility,
            donated_on=past_date,
            recorded_by=self.staff,
        )
        pts = gamification.calculate_donor_points(self.donor_o_pos)
        self.assertEqual(pts['donation_points'], 100)
        self.assertEqual(pts['badge_points'], 100)
        self.assertEqual(pts['total_points'], 200)

        # 1 don pour urgence critique aujourd'hui (100 + 50 = 150 pts don + 200 pts badge life_saver)
        critical_req = make_request(self.facility, blood_group='O+', urgency='critical')
        donor_resp = services.respond(self.donor_o_pos, critical_req, 'accepted')
        services.confirm_donation(critical_req, donor_resp.id, recorded_by=self.staff)

        pts = gamification.calculate_donor_points(self.donor_o_pos)
        self.assertEqual(pts['donation_points'], 250)
        self.assertEqual(pts['badge_points'], 300)
        self.assertEqual(pts['total_points'], 550)
        self.assertEqual(pts['donations_count'], 2)

    def test_award_badges_first_donation_and_o_negative(self):
        # Don pour un donneur O-
        services.record_donation(
            donor=self.donor_o_neg,
            facility=self.facility,
            recorded_by=self.staff,
        )
        earned_codes = set(self.donor_o_neg.earned_badges.values_list('badge__code', flat=True))

        # Doit recevoir le premier pas et le sauveur universel
        self.assertIn('first_donation', earned_codes)
        self.assertIn('universal_savior', earned_codes)
        self.assertEqual(self.donor_o_neg.earned_badges.count(), 2)

        # Idempotence : une nouvelle évaluation sans nouveaux dons n'attribue rien de plus
        re_evaluated = gamification.evaluate_and_award_badges(self.donor_o_neg)
        self.assertEqual(len(re_evaluated), 0)
        self.assertEqual(self.donor_o_neg.earned_badges.count(), 2)

    def test_award_badges_life_saver_critical_request(self):
        critical_req = make_request(self.facility, blood_group='O+', urgency='critical')
        donor_resp = services.respond(self.donor_o_pos, critical_req, 'accepted')
        services.confirm_donation(critical_req, donor_resp.id, recorded_by=self.staff)

        earned_codes = set(self.donor_o_pos.earned_badges.values_list('badge__code', flat=True))
        self.assertIn('first_donation', earned_codes)
        self.assertIn('life_saver', earned_codes)

    def test_donation_milestones_badges(self):
        # Enregistrer 3 dons pour obtenir regular_donor
        for i in range(3):
            services.record_donation(
                donor=self.donor_o_pos,
                facility=self.facility,
                recorded_by=self.staff,
            )

        earned_codes = set(self.donor_o_pos.earned_badges.values_list('badge__code', flat=True))
        self.assertIn('first_donation', earned_codes)
        self.assertIn('regular_donor', earned_codes)
        self.assertNotIn('bronze_donor', earned_codes)

        # Enregistrer 2 dons supplémentaires (total 5) pour bronze_donor
        for i in range(2):
            services.record_donation(
                donor=self.donor_o_pos,
                facility=self.facility,
                recorded_by=self.staff,
            )

        earned_codes = set(self.donor_o_pos.earned_badges.values_list('badge__code', flat=True))
        self.assertIn('bronze_donor', earned_codes)


class GamificationAPITests(TestCase):
    """Tests des endpoints REST de gamification."""

    def setUp(self):
        self.client = APIClient()
        self.facility = make_facility("Hôpital Fann")
        self.staff = make_user('staff_fann_api', Role.HOSPITAL_STAFF, facility=self.facility)
        self.donor_user = make_user('donneur1', Role.DONOR)
        self.donor = make_donor('donneur_profile', blood_group='O+')
        self.donor.user = self.donor_user
        self.donor.save(update_fields=['user'])

        self.other_user = make_user('non_donor')

    def test_gamification_profile_unauthenticated(self):
        response = self.client.get('/api/sang/donors/me/gamification/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_gamification_profile_non_donor(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get('/api/sang/donors/me/gamification/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_gamification_profile_authenticated_donor(self):
        # Ajouter 1 don spontané
        services.record_donation(
            donor=self.donor,
            facility=self.facility,
            recorded_by=self.staff,
        )

        self.client.force_authenticate(user=self.donor_user)
        response = self.client.get('/api/sang/donors/me/gamification/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['donor_id'], self.donor.id)
        self.assertEqual(data['blood_group'], 'O+')
        self.assertEqual(data['donations_count'], 1)
        self.assertEqual(data['donation_points'], 100)
        # Badge 'first_donation' apporte 100 points
        self.assertEqual(data['badge_points'], 100)
        self.assertEqual(data['points'], 200)
        self.assertEqual(data['level'], 2)  # 200 points = Niveau 2 (Donneur Engagé)
        self.assertEqual(data['title'], 'Donneur Engagé')
        self.assertEqual(data['earned_badges_count'], 1)
        self.assertEqual(len(data['badges']), 1)
        self.assertEqual(data['badges'][0]['code'], 'first_donation')
        self.assertTrue(len(data['locked_badges']) >= 6)

    def test_badge_list_endpoint(self):
        self.client.force_authenticate(user=self.donor_user)
        response = self.client.get('/api/sang/badges/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(isinstance(response.data, list))
        self.assertGreaterEqual(len(response.data), 7)
        first_badge = response.data[0]
        self.assertIn('code', first_badge)
        self.assertIn('name', first_badge)
        self.assertIn('points_bonus', first_badge)
        self.assertIn('category', first_badge)

    def test_confirm_donation_triggers_badge_awarding(self):
        blood_req = make_request(self.facility, blood_group='O+', urgency='critical')

        # Répondre à la demande
        donor_response = services.respond(self.donor, blood_req, 'accepted')

        # Le donneur n'a pas encore de badge
        self.assertEqual(self.donor.earned_badges.count(), 0)

        # Confirmer le don
        donation = services.confirm_donation(
            blood_req, donor_response.id, recorded_by=self.staff
        )

        # Badges attribués automatiquement : 'first_donation' et 'life_saver'
        self.donor.refresh_from_db()
        self.assertEqual(self.donor.earned_badges.count(), 2)
        badge_codes = set(self.donor.earned_badges.values_list('badge__code', flat=True))
        self.assertIn('first_donation', badge_codes)
        self.assertIn('life_saver', badge_codes)
