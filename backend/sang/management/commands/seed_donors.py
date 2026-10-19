"""
Commande Django : donneurs de démonstration (idempotente, reproductible).

Usage :
    python manage.py seed_donors                 # 150 donneurs
    python manage.py seed_donors --count 300 --seed 7

Crée des citoyens donneurs réalistes : noms sénégalais, groupes sanguins
dans des proportions proches de la population (O+ majoritaire, rhésus
négatif rare), positions autour des villes (surtout Dakar et Thiès, où sont
les établissements), historique de dons respectant les délais du CNTS. Une
partie des donneurs est volontairement non éligible (indisponible, délai
entre deux dons en cours, poids insuffisant) pour que les écrans le montrent.

Les comptes s'appellent ``donneur.demo.NNN`` (mot de passe de démonstration
commun) : relancer la commande ne recrée pas ceux qui existent déjà. Refusée
hors DEBUG (mot de passe public), sauf --allow-production.
"""

import math
import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from geo.distance import EARTH_RADIUS_M
from security.roles import Role
from users.models import HealthFacility, UserProfile
from users.services import add_role

from ...eligibility import DONATION_INTERVAL_DAYS, MAX_DONOR_AGE, MIN_DONOR_AGE
from ...models import Donation, Donor

User = get_user_model()

USERNAME_PREFIX = 'donneur.demo.'
DEMO_PASSWORD = 'Password123!'

# Répartition approximative des groupes au Sénégal (somme : 100).
BLOOD_GROUP_WEIGHTS = {
    'O+': 48,
    'A+': 22,
    'B+': 18,
    'AB+': 4,
    'O-': 3,
    'A-': 2,
    'B-': 2,
    'AB-': 1,
}

# (région, ville, latitude, longitude, dispersion en km, poids)
CITIES = [
    ('dakar', 'Dakar', 14.6928, -17.4467, 7, 40),
    ('dakar', 'Pikine', 14.7549, -17.3900, 4, 10),
    ('dakar', 'Guédiawaye', 14.7767, -17.3956, 3, 6),
    ('dakar', 'Rufisque', 14.7158, -17.2733, 4, 4),
    ('thies', 'Thiès', 14.7910, -16.9359, 5, 12),
    ('thies', 'Mbour', 14.4199, -16.9634, 4, 4),
    ('diourbel', 'Touba', 14.8500, -15.8833, 5, 6),
    ('saint_louis', 'Saint-Louis', 16.0326, -16.4818, 4, 5),
    ('kaolack', 'Kaolack', 14.1520, -16.0726, 4, 5),
    ('ziguinchor', 'Ziguinchor', 12.5681, -16.2719, 4, 4),
    ('louga', 'Louga', 15.6173, -16.2240, 3, 2),
    ('tambacounda', 'Tambacounda', 13.7707, -13.6673, 3, 2),
]

MALE_FIRST_NAMES = [
    'Mamadou', 'Moussa', 'Ibrahima', 'Cheikh', 'Abdoulaye', 'Ousmane', 'Modou', 'Babacar', 'Aliou',
    'Pape', 'Serigne', 'Lamine', 'Mouhamed', 'Amadou', 'Assane', 'Saliou', 'Malick', 'Idrissa',
]
FEMALE_FIRST_NAMES = [
    'Fatou', 'Aminata', 'Awa', 'Mariama', 'Khady', 'Aïssatou', 'Coumba', 'Ndèye', 'Astou',
    'Rokhaya', 'Bineta', 'Sokhna', 'Adama', 'Dieynaba', 'Marème', 'Seynabou', 'Oumou', 'Penda',
]
LAST_NAMES = [
    'Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Gueye', 'Diallo', 'Sarr', 'Faye', 'Mbaye', 'Cissé',
    'Thiam', 'Seck', 'Niang', 'Kane', 'Diouf', 'Camara', 'Touré', 'Sy', 'Lô', 'Ndour', 'Sène',
]
PHONE_PREFIXES = ('77', '78', '76', '70', '75')


def _weighted(rng, weights):
    items = list(weights)
    return rng.choices(items, weights=[weights[i] for i in items])[0]


def _jitter(rng, latitude, longitude, spread_km):
    """Point aléatoire autour d'un centre (répartition plus dense au centre)."""
    distance = spread_km * 1000 * rng.random() ** 1.5
    bearing = rng.uniform(0, 2 * math.pi)
    d_lat = math.degrees(distance * math.cos(bearing) / EARTH_RADIUS_M)
    d_lon = math.degrees(
        distance * math.sin(bearing) / (EARTH_RADIUS_M * math.cos(math.radians(latitude)))
    )
    return round(latitude + d_lat, 6), round(longitude + d_lon, 6)


def _birth_date(rng, today):
    # Surtout des 20-40 ans, comme les donneurs réguliers.
    age = min(MAX_DONOR_AGE - 1, max(MIN_DONOR_AGE, int(rng.triangular(MIN_DONOR_AGE, MAX_DONOR_AGE - 1, 28))))
    return today - timedelta(days=age * 365 + rng.randrange(365))


def _donation_history(rng, sex, today):
    """Dates de dons passés, espacées d'au moins le délai réglementaire."""
    if rng.random() < 0.35:
        return []  # nouveau donneur, jamais donné
    interval = DONATION_INTERVAL_DAYS[sex]
    count = rng.choices([1, 2, 3, 4, 6, 8], weights=[30, 25, 18, 12, 9, 6])[0]
    # Dernier don : 30 % encore dans le délai (non éligibles), le reste au-delà.
    if rng.random() < 0.3:
        last = today - timedelta(days=rng.randrange(10, interval))
    else:
        last = today - timedelta(days=rng.randrange(interval, interval + 400))
    dates = [last]
    for _ in range(count - 1):
        dates.append(dates[-1] - timedelta(days=interval + rng.randrange(0, 120)))
    return sorted(dates)


class Command(BaseCommand):
    help = "Crée des donneurs de démonstration réalistes (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=150, help="Nombre total de donneurs de démo (150).")
        parser.add_argument('--seed', type=int, default=2026, help="Graine aléatoire (reproductible).")
        parser.add_argument(
            '--allow-production',
            action='store_true',
            help="Autorise l'exécution hors DEBUG (instance de démonstration uniquement).",
        )

    def handle(self, *args, count, seed, allow_production, **options):
        if not settings.DEBUG and not allow_production:
            raise CommandError(
                "Refusé : DEBUG=False. Ces comptes ont un mot de passe public. "
                "Instance de démonstration uniquement : relancez avec --allow-production."
            )
        if count < 1:
            raise CommandError("--count doit être positif.")

        rng = random.Random(seed)
        today = timezone.localdate()
        password_hash = make_password(DEMO_PASSWORD)  # un seul hachage : création rapide
        collection_points = self._collection_points()

        created = skipped = donations = 0
        used_phones = set(UserProfile.objects.exclude(phone_number=None).values_list('phone_number', flat=True))
        with transaction.atomic():
            for index in range(1, count + 1):
                # Tirages faits même si le compte existe : mêmes données à chaque exécution.
                profile = self._draw_profile(rng, today, used_phones)
                username = f'{USERNAME_PREFIX}{index:03d}'
                if User.objects.filter(username=username).exists():
                    skipped += 1
                    continue
                donor = self._create_donor(username, password_hash, profile, today)
                donations += self._create_donations(donor, profile, collection_points)
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Donneurs créés : {created} (déjà présents : {skipped}), dons historiques : {donations}. "
                f"Mot de passe : {DEMO_PASSWORD}"
            )
        )
        eligible = Donor.objects.eligible(today).count()
        self.stdout.write(f"Donneurs en base : {Donor.objects.count()} dont éligibles aujourd'hui : {eligible}")

    # --- Tirages ---------------------------------------------------------

    def _draw_profile(self, rng, today, used_phones):
        sex = rng.choice(['M', 'F'])
        region, city, lat, lon, spread, _ = rng.choices(CITIES, weights=[c[-1] for c in CITIES])[0]
        latitude, longitude = _jitter(rng, lat, lon, spread)
        while True:
            phone = f"+221{rng.choice(PHONE_PREFIXES)}{rng.randrange(10**7):07d}"
            if phone not in used_phones:
                used_phones.add(phone)
                break
        return {
            'sex': sex,
            'first_name': rng.choice(MALE_FIRST_NAMES if sex == 'M' else FEMALE_FIRST_NAMES),
            'last_name': rng.choice(LAST_NAMES),
            'blood_group': _weighted(rng, BLOOD_GROUP_WEIGHTS),
            'date_of_birth': _birth_date(rng, today),
            # 5 % sous les 50 kg exigés : non éligibles, visibles comme tels.
            'weight_kg': rng.randint(42, 49) if rng.random() < 0.05 else rng.randint(52, 98),
            'is_available': rng.random() < 0.85,
            'region': region,
            'city': city,
            'latitude': latitude,
            'longitude': longitude,
            'phone': phone,
            'donation_dates': _donation_history(rng, sex, today),
        }

    def _collection_points(self):
        """Lieux de don par région : centres de transfusion d'abord, sinon hôpitaux."""
        points = {}
        for facility in HealthFacility.objects.filter(is_active=True).order_by('facility_type', 'pk'):
            if facility.facility_type in (HealthFacility.FacilityType.BLOOD_BANK, HealthFacility.FacilityType.HOSPITAL):
                points.setdefault(facility.region, facility)
        if not points:
            raise CommandError("Aucun établissement actif : lancez d'abord seed_demo_data.py.")
        return points

    # --- Création --------------------------------------------------------

    def _create_donor(self, username, password_hash, profile, today):
        user = User.objects.create(
            username=username,
            password=password_hash,
            first_name=profile['first_name'],
            last_name=profile['last_name'],
        )
        UserProfile.objects.create(user=user, phone_number=profile['phone'], region=profile['region'])
        add_role(user, Role.DONOR)
        dates = profile['donation_dates']
        return Donor.objects.create(
            user=user,
            blood_group=profile['blood_group'],
            sex=profile['sex'],
            date_of_birth=profile['date_of_birth'],
            weight_kg=profile['weight_kg'],
            is_available=profile['is_available'],
            latitude=profile['latitude'],
            longitude=profile['longitude'],
            location_updated_at=timezone.now(),
            last_donation_date=dates[-1] if dates else None,
        )

    def _create_donations(self, donor, profile, collection_points):
        dates = profile['donation_dates']
        if not dates:
            return 0
        # Don au centre de sa région, sinon au premier centre connu (CNTS de Dakar).
        facility = collection_points.get(profile['region']) or collection_points.get('dakar') or next(
            iter(collection_points.values())
        )
        Donation.objects.bulk_create(Donation(donor=donor, facility=facility, donated_on=d) for d in dates)
        try:
            from ... import gamification

            gamification.evaluate_and_award_badges(donor)
        except Exception as exc:  # noqa: BLE001 — les badges ne doivent pas bloquer le peuplement
            self.stderr.write(f"Badges non attribués pour {donor.user.username} : {exc}")
        return len(dates)

