"""
Référentiels partagés par le module ML et le temps réel.

Auteur : El Hadji Massogui Diop
"""

BLOOD_GROUPS = [
    ('A+', 'A Positif'),
    ('A-', 'A Négatif'),
    ('B+', 'B Positif'),
    ('B-', 'B Négatif'),
    ('AB+', 'AB Positif'),
    ('AB-', 'AB Négatif'),
    ('O+', 'O Positif'),
    ('O-', 'O Négatif'),
]

# Les 14 régions administratives du Sénégal.
REGIONS = [
    ('dakar', 'Dakar'),
    ('thies', 'Thiès'),
    ('saint_louis', 'Saint-Louis'),
    ('kaolack', 'Kaolack'),
    ('ziguinchor', 'Ziguinchor'),
    ('tambacounda', 'Tambacounda'),
    ('louga', 'Louga'),
    ('fatick', 'Fatick'),
    ('kolda', 'Kolda'),
    ('matam', 'Matam'),
    ('kaffrine', 'Kaffrine'),
    ('kedougou', 'Kédougou'),
    ('sedhiou', 'Sédhiou'),
    ('diourbel', 'Diourbel'),
]

BLOOD_GROUP_CODES = tuple(code for code, _ in BLOOD_GROUPS)
REGION_CODES = tuple(code for code, _ in REGIONS)
REGION_LABELS = dict(REGIONS)
