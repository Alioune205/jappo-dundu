"""
Tests de la validation des numéros de téléphone et des filtres de requête.

Auteur : Ibrahima Khalilou Diallo
"""

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError as APIValidationError

from users.filters import boolean_param, choice_param, int_param
from users.validators import normalize_phone_number, validate_phone_number


class PhoneNumberTests(SimpleTestCase):
    def test_accepted_formats(self):
        for raw in (
            "77 123 45 67",
            '771234567',
            "+221 77 123 45 67",
            '+221771234567',
            '00221771234567',
            '221771234567',
            '77-123-45-67',
            "(77) 123.45.67",
        ):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_phone_number(raw), '+221771234567')

    def test_landline(self):
        self.assertEqual(normalize_phone_number("33 821 00 00"), '+221338210000')

    def test_rejected_formats(self):
        for raw in ('', '12345', "67 123 45 67", "77 123 45 6", '+33612345678', 'abc', None):
            with self.subTest(raw=raw), self.assertRaises(ValidationError):
                normalize_phone_number(raw)

    def test_model_validator_requires_normalized_value(self):
        validate_phone_number('+221771234567')
        with self.assertRaises(ValidationError):
            validate_phone_number("77 123 45 67")


class QueryParamTests(SimpleTestCase):
    def test_choice_param(self):
        self.assertIsNone(choice_param({}, 'region', ('dakar',)))
        self.assertEqual(choice_param({'region': 'dakar'}, 'region', ('dakar',)), 'dakar')
        with self.assertRaises(APIValidationError):
            choice_param({'region': 'paris'}, 'region', ('dakar',))

    def test_int_param(self):
        self.assertEqual(int_param({}, 'n', default=5), 5)
        self.assertEqual(int_param({'n': '7'}, 'n', maximum=10), 7)
        for value in ('0', '11', 'x', '1.5'):
            with self.subTest(value=value), self.assertRaises(APIValidationError):
                int_param({'n': value}, 'n', maximum=10)

    def test_boolean_param(self):
        self.assertIsNone(boolean_param({}, 'b'))
        self.assertTrue(boolean_param({'b': 'True'}, 'b'))
        self.assertFalse(boolean_param({'b': 'non'}, 'b'))
        with self.assertRaises(APIValidationError):
            boolean_param({'b': "peut-être"}, 'b')
