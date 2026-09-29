# Comptes et établissements — guide d'intégration

Responsable : Ibrahima Khalilou Diallo

Toutes les routes exigent l'en-tête `Authorization: Bearer <access>`, sauf
l'inscription. Les rôles sont ceux de `security/README.md` (`admin`,
`hospital_staff`, `ambulance_driver`, `donor`).

## Conventions communes (users, sang, lits, ambulances)

- Chaque champ à choix est accompagné de son libellé français : `region` et
  `region_display`, `status` et `status_display`…
- Une relation se lit sous forme d'objet (`facility: {id, name, …}`) et s'écrit
  par identifiant (`facility_id`).
- Les positions sont en degrés décimaux WGS 84 : `latitude`, `longitude`. Les
  recherches de proximité renvoient `distance_km`.
- Les listes sont paginées (`count`, `next`, `previous`, `results`, 50 par page).
  Les recherches de proximité renvoient une liste simple, triée du plus proche
  au plus éloigné.
- Les téléphones sont acceptés sous toutes les formes courantes
  (`77 123 45 67`, `+221771234567`…) et renvoyés au format `+221XXXXXXXXX`.
- Codes d'erreur : 400 (donnée invalide, détail par champ), 401 (token absent
  ou expiré), 403 (rôle ou établissement non autorisé), 404, 409 (action
  incompatible avec l'état actuel : lit plein, demande clôturée…).

## Inscription et compte

| Route | Accès | Description |
|---|---|---|
| `POST /api/users/register/` | public | Inscription d'un citoyen ; il reçoit le rôle `donor`. Réponse : `access`, `refresh`, `user`. Limitée à 20 par heure et par adresse IP |
| `GET /api/users/me/` | connecté | Compte : identité, téléphone, région, `role`, `roles`, `facility` |
| `PATCH /api/users/me/` | connecté | `first_name`, `last_name`, `email`, `phone_number`, `region` |
| `POST /api/users/me/password/` | connecté | `{"current_password", "new_password"}` ; les autres sessions sont fermées et une nouvelle paire de tokens est renvoyée |

```json
POST /api/users/register/
{"username": "awa", "password": "…", "first_name": "Awa", "last_name": "Ndiaye",
 "phone_number": "77 123 45 67", "region": "thies", "email": "awa@example.sn"}
```

Le nom d'utilisateur, l'e-mail et le téléphone sont uniques (sans tenir compte
des majuscules). Le mot de passe suit les règles de Django (8 caractères au
moins, pas trop courant, pas trop proche de l'identité).

## Gestion des comptes (admin)

| Route | Description |
|---|---|
| `GET /api/users/` | Filtres : `role`, `facility`, `region`, `is_active`, `search` (nom, e-mail, téléphone) |
| `POST /api/users/` | `username`, `password`, `role`, `facility_id` (obligatoire pour `hospital_staff`, possible pour `ambulance_driver`), `first_name`, `last_name`, `email`, `phone_number`, `region` |
| `PATCH /api/users/<id>/` | Rôle, établissement, activation (`is_active`), mot de passe… |

Un compte n'est jamais supprimé : `is_active: false` le désactive et révoque
ses sessions. Un administrateur ne peut ni se retirer son propre rôle ni
désactiver son propre compte, et le rôle d'un superutilisateur n'est pas
modifiable.

## Établissements de santé

Types : `hospital`, `health_center`, `clinic`, `blood_bank` (centre de
transfusion), `ambulance_service`.

| Route | Accès | Description |
|---|---|---|
| `GET /api/facilities/` | connecté | Filtres : `region`, `facility_type`, `search` ; seuls les établissements actifs (l'admin voit tout et peut filtrer avec `is_active`) |
| `GET /api/facilities/nearest/` | connecté | `latitude`, `longitude`, `radius_km` (50 par défaut), `limit` (10 par défaut), `facility_type` |
| `POST /api/facilities/` ; `PATCH /api/facilities/<id>/` | admin | Création et modification ; `is_active: false` pour retirer un établissement |

Le nom d'un établissement est unique dans sa région.

## Pour les autres modules du backend

```python
from users.permissions import IsFacilityStaffOrAdmin, facility_for_write, scope_to_facility
from users.services import user_facility_id

queryset = scope_to_facility(MonModele.objects.all(), request.user)   # personnel : son établissement
facility = facility_for_write(request.user, requested_facility)       # admin : obligatoire ; personnel : le sien
```
