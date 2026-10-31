"""Tests du rappel « vous pouvez de nouveau donner »."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from ..reminders import remind_eligible_donors
from .helpers import SangFixturesMixin, make_donor


class EligibilityReminderTests(SangFixturesMixin, TestCase):
    def test_one_reminder_per_donation(self):
        today = timezone.localdate()
        ready = make_donor('pret', last_donation_date=today - timedelta(days=100))
        make_donor('trop_tot', last_donation_date=today - timedelta(days=30))
        make_donor('jamais_donne')
        with mock.patch('push.services.notify_can_donate_again') as notify:
            self.assertEqual(remind_eligible_donors(today), 1)
            notify.assert_called_once_with([ready.user_id])
            # Pas de second rappel pour le même don…
            self.assertEqual(remind_eligible_donors(today), 0)
        # … mais un nouveau don relance le cycle.
        ready.last_donation_date = today - timedelta(days=95)
        ready.save()
        with mock.patch('push.services.notify_can_donate_again'):
            self.assertEqual(remind_eligible_donors(today), 1)
