"""Assistant IA de supervision : accès, bascule Gemini → Grok, données envoyées."""

import io
import json
import urllib.error
from unittest import mock

from django.test import TestCase, override_settings

from ambulances.models import Ambulance
from lits.models import BedCapacity
from sang.tests.helpers import make_request
from security.roles import Role
from users.tests.factories import api_client, make_facility, make_user

from .snapshot import network_snapshot

URL = '/api/assistant/ask/'
KEYS = {'GEMINI_API_KEY': 'cle-gemini', 'GROK_API_KEY': 'cle-grok'}


def reply(payload):
    """Réponse HTTP simulée de urlopen (utilisable comme gestionnaire de contexte)."""
    response = mock.MagicMock()
    response.__enter__.return_value = io.BytesIO(json.dumps(payload).encode())
    return response


def gemini_ok():
    return reply({'candidates': [{'content': {'parts': [{'text': 'Fann est en tension.'}]}}]})


def grok_ok():
    return reply({'choices': [{'message': {'content': 'Réponse de Grok.'}}]})


def http_error(code):
    return urllib.error.HTTPError(URL, code, 'erreur', {}, None)


class AssistantTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fann = make_facility("CHU de Fann")
        BedCapacity.objects.create(
            facility=cls.fann, category=BedCapacity.Category.INTENSIVE_CARE, total_beds=16, occupied_beds=15
        )
        make_request(cls.fann, blood_group='O-', units_needed=4, urgency='critical')
        Ambulance.objects.create(plate_number='DK-1', facility=cls.fann)
        cls.admin = make_user('superviseur', Role.ADMIN)
        cls.bed_manager = make_user('lits', Role.BED_MANAGER, facility=cls.fann)

    def ask(self, user, question='Situation de Fann ?'):
        return api_client(user).post(URL, {'question': question}, format='json')

    @override_settings(**KEYS)
    def test_gemini_repond_en_premier(self):
        with mock.patch('urllib.request.urlopen', return_value=gemini_ok()) as call:
            response = self.ask(self.admin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'answer': 'Fann est en tension.', 'provider': 'gemini'})
        request = call.call_args.args[0]
        self.assertIn('generativelanguage.googleapis.com', request.full_url)
        self.assertEqual(request.headers['X-goog-api-key'], 'cle-gemini')
        self.assertIn('Situation de Fann ?', request.data.decode())

    @override_settings(**KEYS)
    def test_suit_la_conversation_et_parle_a_l_administrateur_par_son_prenom(self):
        history = [
            {'role': 'assistant', 'content': 'Bonjour !'},
            {'role': 'user', 'content': 'Quels hôpitaux sont saturés ?'},
            {'role': 'assistant', 'content': 'Fann surtout.'},
        ]
        with mock.patch('urllib.request.urlopen', return_value=gemini_ok()) as call:
            response = api_client(self.admin).post(URL, {'question': 'Et en réanimation ?', 'history': history}, format='json')
        self.assertEqual(response.status_code, 200)
        body = json.loads(call.call_args.args[0].data)
        roles = [turn['role'] for turn in body['contents']]
        # Le message d'accueil de Jappo est écarté : la conversation commence par l'utilisateur.
        self.assertEqual(roles, ['user', 'model', 'user'])
        self.assertIn('Et en réanimation ?', body['contents'][-1]['parts'][0]['text'])
        self.assertIn('Superviseur', body['systemInstruction']['parts'][0]['text'])

    def test_historique_trop_long_refuse(self):
        history = [{'role': 'user', 'content': 'x'}] * 9
        response = api_client(self.admin).post(URL, {'question': 'Et ?', 'history': history}, format='json')
        self.assertEqual(response.status_code, 400)

    @override_settings(**KEYS)
    def test_bascule_sur_grok_si_gemini_echoue(self):
        for failure in (http_error(429), http_error(401), TimeoutError()):
            with self.subTest(failure=failure), mock.patch('urllib.request.urlopen', side_effect=[failure, grok_ok()]) as call:
                response = self.ask(self.admin)
            self.assertEqual(response.data, {'answer': 'Réponse de Grok.', 'provider': 'grok'})
            grok_request = call.call_args.args[0]
            self.assertEqual(grok_request.full_url, 'https://api.x.ai/v1/chat/completions')
            self.assertEqual(grok_request.headers['Authorization'], 'Bearer cle-grok')

    @override_settings(GEMINI_API_KEY='', GROK_API_KEY='cle-grok')
    def test_sans_cle_gemini_grok_repond_directement(self):
        with mock.patch('urllib.request.urlopen', return_value=grok_ok()) as call:
            response = self.ask(self.admin)
        self.assertEqual(response.data['provider'], 'grok')
        self.assertEqual(call.call_count, 1)

    @override_settings(**KEYS)
    def test_503_si_les_deux_echouent(self):
        with mock.patch('urllib.request.urlopen', side_effect=[http_error(429), http_error(500)]):
            response = self.ask(self.admin)
        self.assertEqual(response.status_code, 503)

    @override_settings(GEMINI_API_KEY='', GROK_API_KEY='')
    def test_503_sans_aucune_cle(self):
        with mock.patch('urllib.request.urlopen') as call:
            response = self.ask(self.admin)
        self.assertEqual(response.status_code, 503)
        call.assert_not_called()

    @override_settings(**KEYS)
    def test_reserve_a_l_administrateur_general(self):
        with mock.patch('urllib.request.urlopen') as call:
            self.assertEqual(self.ask(self.bed_manager).status_code, 403)
            self.assertEqual(api_client().post(URL, {'question': 'x'}, format='json').status_code, 401)
        call.assert_not_called()

    def test_question_vide_ou_trop_longue_refusee(self):
        self.assertEqual(self.ask(self.admin, '').status_code, 400)
        self.assertEqual(self.ask(self.admin, 'x' * 501).status_code, 400)

    def test_donnees_agregees_sans_donnee_personnelle(self):
        snapshot = network_snapshot()
        fann = snapshot['etablissements'][0]
        self.assertEqual(fann['nom'], 'CHU de Fann')
        self.assertEqual(fann['services'][0]['lits_libres'], 1)
        self.assertEqual(fann['demandes_de_sang_ouvertes'][0]['groupe'], 'O-')
        self.assertEqual(fann['ambulances'], {'Disponible': 1})
        text = json.dumps(snapshot, ensure_ascii=False)
        for personal in ('superviseur', 'Superviseur', '+22177'):
            self.assertNotIn(personal, text)
