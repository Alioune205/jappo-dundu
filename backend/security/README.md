# Sécurité de l'API — guide d'intégration

Responsable : El Hadji Massogui Diop

## Authentification (JWT)

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/auth/token/` | `{"username", "password"}` — `username` accepte aussi le numéro de téléphone (« 77 123 45 67 », « +221771234567 ») | `access`, `refresh`, `user` (id, username, email, full_name, role, roles, groups) |
| `POST /api/auth/token/refresh/` | `{"refresh"}` | nouveaux `access` **et** `refresh` (l'ancien refresh est révoqué) |
| `POST /api/auth/token/verify/` | `{"token"}` | 200 si valide, 401 sinon |
| `POST /api/auth/logout/` | `{"refresh"}` | 200 ; le refresh est révoqué |

- Chaque appel envoie l'en-tête `Authorization: Bearer <access>`.
- L'access token dure 30 minutes et le refresh token 7 jours (réglables par variables d'environnement).
- Après chaque rafraîchissement, **remplacez le refresh token stocké** : l'ancien
  est refusé, ce qui limite l'usage d'un token volé.
- Le token contient les claims `role` (rôle principal), `roles`, `username` et
  `is_staff`, mais aucune donnée personnelle.
- La connexion est limitée à 10 tentatives par minute et par adresse IP (réponse 429).

## Rôles

| Rôle | Libellé | Attribution | Établissement |
|---|---|---|---|
| `admin` | Administrateur général | compte `is_staff` | aucun (national) |
| `bed_manager` | Administrateur des lits | groupe `bed_manager` | hôpital, centre de santé, clinique |
| `blood_manager` | Administrateur du sang | groupe `blood_manager` | CNTS ou hôpital |
| `ambulance_manager` | Administrateur des ambulances | groupe `ambulance_manager` | service d'ambulances (ou hôpital) |
| `hospital_staff` | Personnel hospitalier (historique) | groupe `hospital_staff` | obligatoire |
| `ambulance_driver` | Ambulancier | groupe `ambulance_driver` | facultatif |
| `donor` | Donneur | groupe `donor` | aucun |

Les groupes sont créés par `python manage.py setup_roles` (idempotent, lancé à
chaque déploiement). Un compte peut cumuler plusieurs rôles (ex. lits + sang
dans un petit hôpital). `hospital_staff` est le rôle d'avant la séparation des
domaines : il garde exactement ses droits (lits, sang et régulation nationale)
mais n'est plus proposé pour les nouveaux comptes.

### Matrice des droits

L = lecture, É = écriture ; « son étab. » = filtré sur `UserProfile.facility`.

| Module | admin | bed_manager | blood_manager | ambulance_manager |
|---|---|---|---|---|
| Lits : capacités, entrées / sorties | L+É partout | L partout, É son étab. | 403 | L partout |
| Sang : demandes, dons, donneurs proches | L+É partout | 403 | L+É son étab. (CNTS : sa région) | 403 |
| Prévisions ML | L+É | 403 | L+É | 403 |
| Véhicules | L+É partout | 403 | 403 | L+É son service |
| Missions SAMU | L+É partout | L (vers son étab.) | 403 | L+É sa région, ses véhicules |
| Comptes et établissements | L+É | 403 | 403 | 403 |
| Alertes temps réel | toutes | lits | sang | lits, ambulances |

Règles transverses : le filtrage se fait dans les `get_queryset()` (un objet
hors périmètre renvoie 404) et dans `has_object_permission` (403) ; jamais
seulement côté interface.

## Protéger une vue (modules sang, lits, ambulances, users)

Toute route exige déjà un utilisateur authentifié (réglage par défaut de DRF).
Pour un domaine, avec cloisonnement par établissement :

```python
from security.roles import Domain
from users.permissions import facility_permission, facility_for_write, scope_to_facility

class DemandeSangViewSet(viewsets.ModelViewSet):
    permission_classes = [facility_permission(Domain.BLOOD)]

    def get_queryset(self):
        return scope_to_facility(BloodRequest.objects.all(), self.request.user, Domain.BLOOD)
```

Sans objet rattaché à un établissement : `ManagesBeds`, `ManagesBlood`,
`ManagesAmbulances` (rôles du domaine, `security.roles.DOMAIN_ROLES`). Autres
classes : `IsAdmin`, `IsDonor`, `IsAmbulanceDriver`, `IsOwnerOrAdmin`, et
`role_permission(...)` pour toute autre combinaison. Dans du code métier :
`security.roles.manages(user, Domain.BEDS)` ou `user_has_role(user, Role.DONOR)`.

La matrice est reprise côté web dans `frontend/src/lib/access.ts` (affichage
des modules et des boutons) ; toute modification doit être faite des deux côtés.

## Supervision

- `GET /api/health/` : sonde publique, sans dépendance (Docker, load balancer).
- `GET /api/status/` : admin uniquement. Donne l'état de la base, du channel
  layer et du modèle ML ; renvoie 503 si une dépendance critique est hors service.

## Protections transverses

- CORS limité à `/api/` et aux origines de `CORS_ALLOWED_ORIGINS`.
- En-têtes ajoutés : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Cache-Control: no-store` sur l'API, et HSTS en production.
- Chaque réponse porte un `X-Request-ID` (réutilisé s'il est fourni par le client
  ou le proxy), présent aussi dans les journaux.

## Format des erreurs de l'API

Toutes les routes suivent la convention Django REST Framework :

| Cas | Corps de la réponse |
|---|---|
| Erreur générale (401, 403, 404, 429, 503…) | `{"detail": "Message lisible."}` |
| Données invalides (400) | `{"champ": ["Message…"], "non_field_errors": ["…"]}` |

Le client web (`frontend/src/lib/api.ts`, `parseErrorBody`) affiche `detail`,
ou les messages par champ à côté des formulaires. Une nouvelle vue doit lever
les exceptions DRF (`NotFound`, `ValidationError`, `APIException`…) plutôt que
construire son propre corps d'erreur.
