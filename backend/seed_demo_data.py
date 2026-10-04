"""
Script d'initialisation des données de démonstration pour Jappo Dundu.
Crée les rôles, les établissements de santé au Sénégal, les lits,
les ambulances, les demandes de sang et les comptes d'accès avec différents rôles.
"""
import os
import sys
import django

# Configuration de Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction
from django.utils import timezone

from ambulances.models import Ambulance
from lits.models import BedCapacity
from sang.models import BloodRequest, Donor
from security.roles import GROUP_ROLES, Role
from users.models import HealthFacility, UserProfile
from users.services import set_role

User = get_user_model()

@transaction.atomic
def seed():
    print("1. Configuration des groupes de rôles...")
    for role in GROUP_ROLES:
        Group.objects.get_or_create(name=role.value)

    print("2. Création des structures sanitaires de référence...")
    facilities = {
        'principal': HealthFacility.objects.update_or_create(
            name="Hôpital Principal de Dakar",
            region="dakar",
            defaults={
                'facility_type': HealthFacility.FacilityType.HOSPITAL,
                'city': "Dakar",
                'address': "1 Avenue Nelson Mandela, Dakar Plateau",
                'phone_number': "+221338395050",
                'latitude': 14.6644,
                'longitude': -17.4336,
                'is_active': True,
            }
        )[0],
        'cnts': HealthFacility.objects.update_or_create(
            name="Centre National de Transfusion Sanguine (CNTS)",
            region="dakar",
            defaults={
                'facility_type': HealthFacility.FacilityType.BLOOD_BANK,
                'city': "Dakar",
                'address': "Avenue Cheikh Anta Diop, Fann",
                'phone_number': "+221338234417",
                'latitude': 14.6853,
                'longitude': -17.4589,
                'is_active': True,
            }
        )[0],
        'fann': HealthFacility.objects.update_or_create(
            name="Centre Hospitalier Universitaire de Fann",
            region="dakar",
            defaults={
                'facility_type': HealthFacility.FacilityType.HOSPITAL,
                'city': "Dakar",
                'address': "Avenue Cheikh Anta Diop, Fann",
                'phone_number': "+221338691818",
                'latitude': 14.6917,
                'longitude': -17.4694,
                'is_active': True,
            }
        )[0],
        'samu': HealthFacility.objects.update_or_create(
            name="SAMU National 15",
            region="dakar",
            defaults={
                'facility_type': HealthFacility.FacilityType.AMBULANCE_SERVICE,
                'city': "Dakar",
                'address': "Grand Yoff, Dakar",
                'phone_number': "+221338698252",
                'latitude': 14.7315,
                'longitude': -17.4522,
                'is_active': True,
            }
        )[0],
        'dalal_jamm': HealthFacility.objects.update_or_create(
            name="Hôpital Dalal Jamm",
            region="dakar",
            defaults={
                'facility_type': HealthFacility.FacilityType.HOSPITAL,
                'city': "Guédiawaye",
                'address': "Golf Sud, Guédiawaye",
                'phone_number': "+221338792020",
                'latitude': 14.7812,
                'longitude': -17.4201,
                'is_active': True,
            }
        )[0],
        'thies': HealthFacility.objects.update_or_create(
            name="Hôpital Régional de Thiès",
            region="thies",
            defaults={
                'facility_type': HealthFacility.FacilityType.HOSPITAL,
                'city': "Thiès",
                'address': "Quartier Dixième, Thiès",
                'phone_number': "+221339511032",
                'latitude': 14.7915,
                'longitude': -16.9256,
                'is_active': True,
            }
        )[0],
    }

    print("3. Configuration des capacités en lits d'hospitalisation...")
    bed_configs = [
        (facilities['principal'], BedCapacity.Category.EMERGENCY, 35, 29),
        (facilities['principal'], BedCapacity.Category.INTENSIVE_CARE, 20, 18),
        (facilities['principal'], BedCapacity.Category.SURGERY, 50, 42),
        (facilities['principal'], BedCapacity.Category.INTERNAL_MEDICINE, 80, 68),
        (facilities['principal'], BedCapacity.Category.MATERNITY, 30, 22),
        (facilities['principal'], BedCapacity.Category.PEDIATRICS, 25, 19),
        (facilities['fann'], BedCapacity.Category.EMERGENCY, 30, 26),
        (facilities['fann'], BedCapacity.Category.INTENSIVE_CARE, 16, 15),
        (facilities['fann'], BedCapacity.Category.INTERNAL_MEDICINE, 70, 58),
        (facilities['dalal_jamm'], BedCapacity.Category.EMERGENCY, 25, 17),
        (facilities['dalal_jamm'], BedCapacity.Category.INTENSIVE_CARE, 12, 8),
        (facilities['thies'], BedCapacity.Category.EMERGENCY, 20, 15),
        (facilities['thies'], BedCapacity.Category.INTENSIVE_CARE, 10, 8),
    ]
    for fac, cat, tot, occ in bed_configs:
        BedCapacity.objects.update_or_create(
            facility=fac,
            category=cat,
            defaults={'total_beds': tot, 'occupied_beds': occ}
        )

    print("4. Enregistrement de la flotte d'ambulances...")
    ambulances = [
        ('DK-8492-AA', facilities['principal'], Ambulance.AmbulanceType.MEDICALIZED, Ambulance.Status.AVAILABLE, 14.6644, -17.4336),
        ('DK-5120-BB', facilities['samu'], Ambulance.AmbulanceType.MEDICALIZED, Ambulance.Status.AVAILABLE, 14.7315, -17.4522),
        ('DK-3341-CC', facilities['samu'], Ambulance.AmbulanceType.BASIC, Ambulance.Status.ON_MISSION, 14.7120, -17.4480),
        ('DK-9901-DD', facilities['dalal_jamm'], Ambulance.AmbulanceType.BASIC, Ambulance.Status.AVAILABLE, 14.7812, -17.4201),
        ('TH-2104-AB', facilities['thies'], Ambulance.AmbulanceType.BASIC, Ambulance.Status.AVAILABLE, 14.7915, -16.9256),
    ]
    for plate, fac, atype, status, lat, lon in ambulances:
        Ambulance.objects.update_or_create(
            plate_number=plate,
            defaults={
                'facility': fac,
                'ambulance_type': atype,
                'status': status,
                'latitude': lat,
                'longitude': lon,
            }
        )

    print("5. Création des comptes utilisateurs de démonstration...")
    users_data = [
        {
            'username': 'admin',
            'password': 'Password123!',
            'role': Role.ADMIN,
            'is_superuser': True,
            'is_staff': True,
            'first_name': "Super",
            'last_name': "Administrateur",
            'email': "admin@jappodundu.sn",
            'facility': None,
            'phone': "+221770000001",
            'region': "dakar",
        },
        {
            'username': 'dr.diop',
            'password': 'Password123!',
            'role': Role.HOSPITAL_STAFF,
            'is_superuser': False,
            'is_staff': False,
            'first_name': "Dr. Cheikh",
            'last_name': "Diop",
            'email': "dr.diop@hopital-principal.sn",
            'facility': facilities['principal'],
            'phone': "+221771112233",
            'region': "dakar",
        },
        {
            'username': 'cnts.dakar',
            'password': 'Password123!',
            'role': Role.HOSPITAL_STAFF,
            'is_superuser': False,
            'is_staff': False,
            'first_name': "Responsable",
            'last_name': "CNTS",
            'email': "contact@cnts.sn",
            'facility': facilities['cnts'],
            'phone': "+221773334455",
            'region': "dakar",
        },
        {
            'username': 'samu.driver',
            'password': 'Password123!',
            'role': Role.AMBULANCE_DRIVER,
            'is_superuser': False,
            'is_staff': False,
            'first_name': "Moussa",
            'last_name': "Sall",
            'email': "moussa.sall@samu.sn",
            'facility': facilities['samu'],
            'phone': "+221775556677",
            'region': "dakar",
        },
        {
            'username': 'awa.ndiaye',
            'password': 'Password123!',
            'role': Role.DONOR,
            'is_superuser': False,
            'is_staff': False,
            'first_name': "Awa",
            'last_name': "Ndiaye",
            'email': "awa.ndiaye@example.sn",
            'facility': None,
            'phone': "+221778889900",
            'region': "dakar",
            'blood_group': "O+",
            'date_of_birth': date(1998, 5, 14),
            'sex': 'F',
        },
    ]

    for udata in users_data:
        username = udata['username']
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': udata['email'],
                'first_name': udata['first_name'],
                'last_name': udata['last_name'],
                'is_staff': udata['is_staff'],
                'is_superuser': udata['is_superuser'],
            }
        )
        user.set_password(udata['password'])
        user.is_staff = udata['is_staff']
        user.is_superuser = udata['is_superuser']
        user.save()

        # Profil utilisateur
        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                'phone_number': udata['phone'],
                'region': udata['region'],
                'facility': udata['facility'],
            }
        )

        set_role(user, udata['role'])

        # Profil donneur si rôle DONOR
        if udata['role'] == Role.DONOR:
            Donor.objects.update_or_create(
                user=user,
                defaults={
                    'blood_group': udata['blood_group'],
                    'date_of_birth': udata['date_of_birth'],
                    'sex': udata['sex'],
                    'latitude': 14.6720,
                    'longitude': -17.4410,
                    'is_available': True,
                    'last_donation_date': date.today() - timedelta(days=120),
                }
            )

    print("6. Création de demandes de sang urgentes de test...")
    BloodRequest.objects.get_or_create(
        facility=facilities['principal'],
        blood_group='O-',
        status=BloodRequest.Status.OPEN,
        defaults={
            'units_needed': 4,
            'urgency': BloodRequest.Urgency.CRITICAL,
            'notes': "Choc hémorragique aux urgences vitales",
            'created_by': User.objects.get(username='dr.diop'),
        }
    )
    BloodRequest.objects.get_or_create(
        facility=facilities['fann'],
        blood_group='A+',
        status=BloodRequest.Status.OPEN,
        defaults={
            'units_needed': 3,
            'urgency': BloodRequest.Urgency.URGENT,
            'notes': "Intervention chirurgicale programmée",
            'created_by': User.objects.get(username='admin'),
        }
    )

    print("\nInitialisation terminée avec succès !")

if __name__ == '__main__':
    seed()
