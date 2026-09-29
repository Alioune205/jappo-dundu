"""
Tests des règles métier : compatibilité ABO/Rh et éligibilité au don
(fonctions Python et filtre SQL, qui doivent concorder).

Auteur : Ibrahima Khalilou Diallo
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from ml.constants import BLOOD_GROUP_CODES

from ..compatibility import (
    DONORS_FOR_RECIPIENT,
    can_donate,
    compatible_donor_groups,
    compatible_recipient_groups,
)
from ..eligibility import age_on, next_eligible_date, years_before
from ..models import Donor

User = get_user_model()


class CompatibilityTests(SimpleTestCase):
    def test_every_group_is_covered(self):
        self.assertEqual(set(DONORS_FOR_RECIPIENT), set(BLOOD_GROUP_CODES))

    def test_universal_donor_and_recipient(self):
        self.assertEqual(set(compatible_recipient_groups('O-')), set(BLOOD_GROUP_CODES))
        self.assertEqual(set(compatible_donor_groups('AB+')), set(BLOOD_GROUP_CODES))
        self.assertEqual(compatible_donor_groups('O-'), ('O-',))
        self.assertEqual(compatible_recipient_groups('AB+'), ('AB+',))

    def test_rules_from_first_principles(self):
        """ABO : O donne à tous, AB reçoit de tous ; Rh- ne reçoit que du Rh-."""

        def abo(group):
            return group.rstrip('+-')

        for donor in BLOOD_GROUP_CODES:
            for recipient in BLOOD_GROUP_CODES:
                abo_ok = (
                    abo(donor) == 'O' or abo(recipient) == 'AB' or abo(donor) == abo(recipient)
                )
                rh_ok = donor.endswith('-') or recipient.endswith('+')
                with self.subTest(donor=donor, recipient=recipient):
                    self.assertEqual(can_donate(donor, recipient), abo_ok and rh_ok)

    def test_identical_group_comes_first(self):
        for group in BLOOD_GROUP_CODES:
            self.assertEqual(compatible_donor_groups(group)[0], group)

    def test_unknown_group(self):
        with self.assertRaises(KeyError):
            compatible_donor_groups('C+')


class EligibilityFunctionTests(SimpleTestCase):
    def test_age(self):
        birth = date(2000, 6, 15)
        self.assertEqual(age_on(birth, date(2018, 6, 14)), 17)
        self.assertEqual(age_on(birth, date(2018, 6, 15)), 18)

    def test_leap_day_birthday(self):
        birth = date(2008, 2, 29)
        self.assertEqual(age_on(birth, date(2026, 2, 28)), 17)
        self.assertEqual(age_on(birth, date(2026, 3, 1)), 18)
        self.assertEqual(years_before(date(2028, 2, 29), 18), date(2010, 2, 28))

    def test_donation_interval(self):
        self.assertIsNone(next_eligible_date('M', None))
        self.assertEqual(next_eligible_date('M', date(2026, 1, 1)), date(2026, 4, 1))
        self.assertEqual(next_eligible_date('F', date(2026, 1, 1)), date(2026, 5, 1))


class EligibilityAgreementTests(TestCase):
    """Le filtre SQL ``Donor.objects.eligible`` applique les mêmes règles."""

    def test_sql_and_python_agree(self):
        today = date(2026, 3, 1)
        births = [
            date(2008, 3, 2),
            date(2008, 3, 1),
            date(2008, 2, 29),
            date(2007, 12, 31),
            date(1960, 3, 2),
            date(1960, 3, 1),
            date(1961, 3, 1),
            date(1990, 1, 1),
        ]
        last_donations = [
            None,
            today - timedelta(days=89),
            today - timedelta(days=90),
            today - timedelta(days=119),
            today - timedelta(days=120),
        ]
        combinations = [
            (birth, sex, last, available)
            for birth in births
            for sex in ('M', 'F')
            for last in last_donations
            for available in (True, False)
        ]
        users = User.objects.bulk_create(
            [
                # Le premier compte est désactivé : jamais éligible.
                User(username=f'donneur{index}', is_active=index != 0)
                for index in range(len(combinations))
            ]
        )
        Donor.objects.bulk_create(
            [
                Donor(
                    user=user,
                    blood_group='O+',
                    sex=sex,
                    date_of_birth=birth,
                    last_donation_date=last,
                    is_available=available,
                )
                for user, (birth, sex, last, available) in zip(users, combinations, strict=True)
            ]
        )

        sql_ids = set(Donor.objects.eligible(today).values_list('pk', flat=True))
        python_ids = {
            donor.pk
            for donor in Donor.objects.select_related('user')
            if not donor.ineligibility_reasons(today)
        }
        self.assertEqual(sql_ids, python_ids)
        self.assertTrue(sql_ids)
        self.assertLess(len(sql_ids), len(combinations))
