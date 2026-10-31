"""
Tests de la fiche d'urgence du citoyen : consentements, contacts prévenus
par SMS, fiche visible par la régulation, historique des alertes.
"""

from unittest import mock

from django.test import TestCase

from security.roles import Role
from users.tests.factories import api_client, make_user, offset

from .models import Mission
from .tests import MISSIONS, AmbulanceFixturesMixin

PROFILE = '/api/ambulances/sos/profile/'
SOS = '/api/ambulances/sos/'


class EmergencyProfileTests(AmbulanceFixturesMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.citizen = make_user('fatou', Role.DONOR, phone='+221771112233')

    def send_sos(self):
        latitude, longitude = offset(1, 0)
        with mock.patch('identity.sms.send_sms') as sms, self.captureOnCommitCallbacks(execute=True):
            response = api_client(self.citizen).post(
                SOS, {'latitude': latitude, 'longitude': longitude, 'kind': 'malaise'}, format='json'
            )
        return response, sms

    def test_empty_then_saved_profile(self):
        client = api_client(self.citizen)
        self.assertEqual(client.get(PROFILE).data['share_with_samu'], False)
        response = client.put(
            PROFILE,
            {
                'share_with_samu': True,
                'allergies': 'Pénicilline',
                'conditions': 'Diabète',
                'medications': '',
                'contacts': [{'name': 'Moussa', 'phone': '77 222 33 44', 'relation': 'Frère'}],
                'notify_contacts': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['contacts'][0]['phone'], '+221772223344')
        too_many = client.put(PROFILE, {'contacts': [{'name': 'x', 'phone': '771234567'}] * 4}, format='json')
        self.assertEqual(too_many.status_code, 400)

    def test_contacts_warned_and_card_shared_only_with_consent(self):
        client = api_client(self.citizen)
        client.put(
            PROFILE,
            {
                'share_with_samu': False,
                'allergies': 'Pénicilline',
                'contacts': [{'name': 'Moussa', 'phone': '772223344'}],
                'notify_contacts': True,
            },
            format='json',
        )
        response, sms = self.send_sos()
        self.assertEqual(sms.call_count, 1)
        self.assertEqual(sms.call_args.args[0], '+221772223344')
        mission = api_client(self.admin).get(f"{MISSIONS}{response.data['id']}/").data
        self.assertIsNone(mission['caller_card'])  # pas de consentement au partage
        client.put(PROFILE, {'share_with_samu': True, 'allergies': 'Pénicilline'}, format='json')
        mission = api_client(self.admin).get(f"{MISSIONS}{response.data['id']}/").data
        self.assertEqual(mission['caller_card']['allergies'], 'Pénicilline')
        self.assertEqual(mission['caller_history'], {'days': 30, 'alerts': 1, 'cancelled_by_regulation': 0})

    def test_no_sms_without_consent(self):
        api_client(self.citizen).put(
            PROFILE, {'contacts': [{'name': 'Moussa', 'phone': '772223344'}], 'notify_contacts': False}, format='json'
        )
        _, sms = self.send_sos()
        sms.assert_not_called()
        self.assertEqual(Mission.objects.filter(source='sos').count(), 1)
