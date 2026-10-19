"""Tests de la commande seed_donors (donneurs de démonstration)."""

from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from security.roles import Role, get_user_roles
from users.tests.factories import make_facility

from ..models import Donor


@override_settings(DEBUG=True)
class SeedDonorsTests(TestCase):
    def run_command(self, **options):
        call_command('seed_donors', stdout=StringIO(), stderr=StringIO(), **options)

    def test_creates_coherent_donors_once(self):
        make_facility("CNTS Test", facility_type='blood_bank')
        self.run_command(count=12)
        donors = Donor.objects.select_related('user__profile')
        self.assertEqual(donors.count(), 12)
        for donor in donors:
            self.assertEqual(get_user_roles(donor.user), {Role.DONOR})
            self.assertTrue(donor.has_location)
            self.assertTrue(donor.user.profile.phone_number)
            dates = list(donor.donations.values_list('donated_on', flat=True))
            self.assertEqual(donor.last_donation_date, max(dates) if dates else None)

        # Relancer ne recrée pas les comptes existants.
        self.run_command(count=12)
        self.assertEqual(Donor.objects.count(), 12)

    @override_settings(DEBUG=False)
    def test_refused_outside_debug(self):
        with self.assertRaises(CommandError):
            self.run_command(count=1)
