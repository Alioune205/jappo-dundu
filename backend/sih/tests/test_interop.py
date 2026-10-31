"""Tests de l'interopérabilité sortante : FHIR, DHIS2, webhooks signés, supervision des flux."""

import json
from unittest import mock

from django.test import TestCase, override_settings

from lits.models import BedCapacity
from security.roles import Role
from sih.interop import dispatch_webhook, sign
from sih.models import HospitalApiKey, HospitalSyncLog, Webhook
from users.tests.factories import api_client, make_facility, make_user


class InteropTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user('admin', Role.ADMIN)
        cls.hospital = make_facility("Hôpital A")
        cls.other = make_facility("Hôpital B", north_km=5)
        cls.manager = make_user('lits_a', Role.BED_MANAGER, facility=cls.hospital)
        BedCapacity.objects.create(facility=cls.hospital, category='emergency', total_beds=10, occupied_beds=4)
        BedCapacity.objects.create(facility=cls.other, category='emergency', total_beds=5, occupied_beds=5)

    def test_fhir_measure_report(self):
        bundle = api_client(self.manager).get('/api/sih/fhir/beds/').data
        self.assertEqual(bundle['resourceType'], 'Bundle')
        self.assertEqual(len(bundle['entry']), 1)  # son établissement seulement
        report = bundle['entry'][0]['resource']
        self.assertEqual(report['resourceType'], 'MeasureReport')
        counts = {p['code']['text']: p['count'] for p in report['group'][0]['population']}
        self.assertEqual(counts, {'numTotBeds': 10, 'numBedsOcc': 4, 'numBedsAvail': 6})
        self.assertEqual(len(api_client(self.admin).get('/api/sih/fhir/beds/').data['entry']), 2)

    def test_dhis2_export_admin_only(self):
        data = api_client(self.admin).get('/api/sih/dhis2/', {'facility': self.hospital.pk}).data
        values = {row['dataElement']: row['value'] for row in data['dataValues']}
        self.assertEqual(values['JD_BEDS_TOTAL'], '10')
        self.assertEqual(api_client(self.manager).get('/api/sih/dhis2/').status_code, 403)

    @override_settings(WEBHOOKS_ASYNC=False)
    def test_webhook_is_signed_and_filtered_by_event(self):
        Webhook.objects.create(facility=self.hospital, url='https://sih.example/hook', secret='s3cret', events=['prealert'])
        with mock.patch('sih.interop._post', return_value=200) as post:
            self.assertEqual(dispatch_webhook(self.hospital, 'blood_order', {}), 0)
            self.assertEqual(dispatch_webhook(self.hospital, 'prealert', {'mission': 4}), 1)
        url, body, signature = post.call_args.args
        self.assertEqual(json.loads(body)['data'], {'mission': 4})
        self.assertEqual(signature, sign('s3cret', body))
        self.assertEqual(Webhook.objects.get().last_status, 200)

    def test_sync_monitoring_flags_silent_facilities(self):
        key = HospitalApiKey.objects.create(facility=self.hospital, name='OpenMRS', key_prefix='jd_sih_ab', key_hash='x')
        HospitalApiKey.objects.create(facility=self.other, name='GNU Health', key_prefix='jd_sih_cd', key_hash='y')
        HospitalSyncLog.objects.create(
            facility=self.hospital, api_key=key, sync_type='beds_sync', status='success', items_count=1
        )
        rows = {row['facility']['name']: row for row in api_client(self.admin).get('/api/sih/monitoring/').data}
        self.assertFalse(rows["Hôpital A"]['stale'])
        self.assertTrue(rows["Hôpital B"]['stale'])
