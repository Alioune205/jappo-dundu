# Sécurité de l'API — guide d'intégration

Responsable : El Hadji Massogui Diop

## Authentification (JWT)

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/auth/token/` | `{"username", "password"}` | `access`, `refresh`, `user` (id, username, email, full_name, role, roles, groups) |
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

| Rôle | Attribution |
|---|---|
| `admin` | compte `is_staff` |
| `hospital_staff` | groupe Django `hospital_staff` |
| `ambulance_driver` | groupe `ambulance_driver` |
| `donor` | groupe `donor` |

Les groupes sont créés par `python manage.py setup_roles` (idempotent, lancé à
chaque déploiement). Si le module `users` ajoute un champ `role` au modèle
utilisateur, il est pris en compte automatiquement.

## Protéger une vue (modules sang, lits, ambulances, users)

Toute route exige déjà un utilisateur authentifié (réglage par défaut de DRF).
Pour restreindre à des rôles :

```python
from security.permissions import IsAdminOrHospitalStaff, role_permission
from security.roles import Role

class DemandeSangView(APIView):
    permission_classes = [IsAdminOrHospitalStaff]

class PositionAmbulanceView(APIView):
    permission_classes = [role_permission(Role.ADMIN, Role.AMBULANCE_DRIVER)]
```

Classes disponibles : `IsAdmin`, `IsHospitalStaff`, `IsDonor`,
`IsAmbulanceDriver`, `IsAdminOrHospitalStaff`, `IsOwnerOrAdmin` (l'objet doit
avoir un attribut `user` ou `owner`), et `role_permission(...)` pour toute autre
combinaison. Dans du code métier : `security.roles.user_has_role(user, Role.DONOR)`.

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
