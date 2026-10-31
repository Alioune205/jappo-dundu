"""
Tests du stock de sang et des commandes de poches : recherche des poches
compatibles, cycle de vie d'une commande, stock jamais négatif, demande de
sang couverte à la réception, périmètres.
"""

from django.test import TestCase

from security.roles import Role
from users.models import HealthFacility
from users.tests.factories import api_client, make_facility, make_user

from .. import stocks
from ..compatibility import compatible_supply_groups
from ..models import BloodStock, BloodSupplyOrder
from .helpers import SangFixturesMixin, make_request

STOCKS = '/api/sang/stocks/'
ORDERS = '/api/sang/orders/'


class StockFixturesMixin(SangFixturesMixin):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.cnts = make_facility("CNTS Dakar", north_km=3, facility_type=HealthFacility.FacilityType.BLOOD_BANK)
        cls.far_bank = make_facility(
            "CRTS Thiès", north_km=60, region='thies', city="Thiès", facility_type=HealthFacility.FacilityType.BLOOD_BANK
        )
        cls.cnts_manager = make_user('cnts', Role.BLOOD_MANAGER, facility=cls.cnts)
        cls.blood_manager = make_user('sang_a', Role.BLOOD_MANAGER, facility=cls.hospital)
        stocks.set_stock(cls.cnts, blood_group='O-', component='red_cells', units_available=3)
        stocks.set_stock(cls.cnts, blood_group='A-', component='red_cells', units_available=10)
        stocks.set_stock(cls.far_bank, blood_group='A-', component='red_cells', units_available=20)


class CompatibilityTests(TestCase):
    def test_components(self):
        self.assertEqual(compatible_supply_groups('A-', 'red_cells'), ('A-', 'O-'))
        self.assertEqual(compatible_supply_groups('AB+', 'plasma'), ('AB+', 'AB-'))
        self.assertIn('AB+', compatible_supply_groups('O+', 'plasma'))
        self.assertTrue(all(g.endswith('-') for g in compatible_supply_groups('B-', 'platelets')))


class StockTests(StockFixturesMixin, TestCase):
    def test_inventory_is_scoped(self):
        client = api_client(self.cnts_manager)
        response = client.post(
            STOCKS,
            {'blood_group': 'B+', 'component': 'plasma', 'units_available': 4, 'units_expiring_soon': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['facility']['id'], self.cnts.pk)
        bad = client.post(STOCKS, {'blood_group': 'B+', 'component': 'plasma', 'units_available': 1, 'units_expiring_soon': 2}, format='json')
        self.assertEqual(bad.status_code, 400)
        # Le personnel d'un hôpital ne voit que son stock.
        self.assertEqual(api_client(self.blood_manager).get(STOCKS).data['count'], 0)

    def test_nearby_compatible_stock_covering_the_need_first(self):
        response = api_client(self.blood_manager).get(
            f'{STOCKS}nearby/', {'blood_group': 'A-', 'component': 'red_cells', 'units': 12, 'radius_km': 200}
        )
        self.assertEqual(response.status_code, 200)
        # Le CNTS (13 poches A-/O-) couvre le besoin et il est plus proche.
        self.assertEqual([row['name'] for row in response.data], ["CNTS Dakar", "CRTS Thiès"])
        self.assertEqual(response.data[0]['total_units'], 13)
        self.assertEqual(response.data[0]['stock_lines'][0]['blood_group'], 'A-')  # identique d'abord
        need = api_client(self.blood_manager).get(
            f'{STOCKS}nearby/', {'blood_group': 'A-', 'component': 'red_cells', 'units': 15, 'radius_km': 200}
        )
        self.assertEqual(need.data[0]['name'], "CRTS Thiès")  # seul à couvrir 15 poches


class OrderLifecycleTests(StockFixturesMixin, TestCase):
    def order(self, **fields):
        body = {'supplier_id': self.cnts.pk, 'blood_group': 'O-', 'component': 'red_cells', 'units': 2, **fields}
        return api_client(self.blood_manager).post(ORDERS, body, format='json')

    def test_full_cycle_covers_the_blood_request(self):
        request = make_request(self.hospital, 'O-', units_needed=2)
        response = self.order(blood_request_id=request.pk)
        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data['id']
        cnts = api_client(self.cnts_manager)
        self.assertEqual(cnts.post(f'{ORDERS}{order_id}/accept/', {}, format='json').data['status'], 'accepted')
        shipped = cnts.post(f'{ORDERS}{order_id}/dispatch/', {'note': 'Moto, 20 min'}, format='json')
        self.assertEqual(shipped.data['status'], 'dispatched')
        self.assertEqual(BloodStock.objects.get(facility=self.cnts, blood_group='O-').units_available, 1)
        # Seul le demandeur confirme la réception.
        self.assertEqual(cnts.post(f'{ORDERS}{order_id}/deliver/').status_code, 403)
        delivered = api_client(self.blood_manager).post(f'{ORDERS}{order_id}/deliver/')
        self.assertEqual(delivered.data['status'], 'delivered')
        request.refresh_from_db()
        self.assertEqual((request.units_collected, request.status), (2, 'fulfilled'))

    def test_stock_never_goes_negative(self):
        order_id = self.order(units=5).data['id']
        response = api_client(self.cnts_manager).post(f'{ORDERS}{order_id}/dispatch/', {}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(BloodStock.objects.get(facility=self.cnts, blood_group='O-').units_available, 3)

    def test_guards(self):
        request = make_request(self.hospital, 'A+', units_needed=1)
        # Poches B+ incompatibles avec un receveur A+.
        self.assertEqual(self.order(blood_group='B+', blood_request_id=request.pk).status_code, 409)
        self.assertEqual(self.order(supplier_id=self.hospital.pk).status_code, 409)
        order_id = self.order().data['id']
        refused = api_client(self.cnts_manager).post(f'{ORDERS}{order_id}/refuse/', {}, format='json')
        self.assertEqual(refused.status_code, 400)  # motif obligatoire
        self.assertEqual(api_client(self.blood_manager).post(f'{ORDERS}{order_id}/accept/').status_code, 403)
        self.assertEqual(api_client(self.blood_manager).post(f'{ORDERS}{order_id}/cancel/').data['status'], 'cancelled')

    def test_lists_by_side(self):
        self.order()
        self.assertEqual(api_client(self.cnts_manager).get(ORDERS, {'role': 'received'}).data['count'], 1)
        self.assertEqual(api_client(self.cnts_manager).get(ORDERS, {'role': 'sent'}).data['count'], 0)
        self.assertEqual(api_client(self.blood_manager).get(ORDERS, {'open': 'true'}).data['count'], 1)
        self.assertEqual(BloodSupplyOrder.objects.count(), 1)
