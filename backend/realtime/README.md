# Temps réel (WebSockets) — guide d'intégration

Responsable : El Hadji Massogui Diop

## Connexion (web et mobile)

| Flux | URL | Accès |
|---|---|---|
| Alertes | `wss://<domaine>/ws/alerts/` | tout utilisateur connecté |
| Tableau de bord | `wss://<domaine>/ws/dashboard/` | `admin`, `hospital_staff` |

Authentification :
- navigateur : l'API WebSocket ne permet pas d'envoyer d'en-tête. Le client
  échange son access token contre un **ticket à usage unique** (valable 30 s),
  puis l'ajoute à l'URL :

  ```js
  const { ticket } = await api.post('/api/realtime/ticket/')  // Authorization: Bearer <access>
  new WebSocket(`${url}?ticket=${ticket}`)
  ```

  Un ticket neuf est nécessaire à chaque (re)connexion. Le JWT n'est **jamais**
  accepté dans l'URL : une query string finit dans les journaux des proxies et
  outils de supervision, où un jeton d'accès pourrait être rejoué.
- mobile, scripts : en-tête `Authorization: Bearer <access>` (même access token
  que l'API REST).

Périmètre (paramètres de l'URL) :
- `/ws/alerts/` sans paramètre : flux national, toutes les alertes ;
- `/ws/alerts/?region=thies` : alertes de la région uniquement (codes : voir `ml/constants.py`) ;
- `?hospital_id=5` : flux d'un hôpital, réservé à `admin`, `hospital_staff` et
  `ambulance_driver` (disponible aussi sur `/ws/dashboard/`).

Codes de fermeture :

| Code | Signification | Action côté client |
|---|---|---|
| 4401 | ticket ou token absent, invalide, expiré ou déjà utilisé | demander un nouveau ticket (rafraîchir le token si besoin), puis se reconnecter |
| 4403 | rôle insuffisant | ne pas se reconnecter |
| 4400 | paramètre invalide (région inconnue…) | corriger l'URL |

## Messages

Le serveur envoie :

```json
{"type": "connection_established", "groups": ["alerts_region_thies"], "user": {"id": 3, "username": "awa", "roles": ["donor"]}, "message": "..."}
{"type": "blood_alert", "id": "<identifiant unique>", "sent_at": "2026-09-28T06:00:00+00:00", "data": {...}}
```

Types diffusés :
- alertes : `alert`, `blood_alert`, `bed_alert`, `ambulance_alert` ;
- tableau de bord : `dashboard_update`, `kpi_update`, `prediction_update`.

Le client peut envoyer :

```json
{"type": "ping"}                                            → {"type": "pong"}
{"type": "subscribe", "group": "alerts_region_dakar"}       → {"type": "subscribed", ...}
{"type": "unsubscribe", "group": "alerts_region_dakar"}     → {"type": "unsubscribed", ...}
```

Seuls les groupes du flux auquel on est connecté, et autorisés pour son rôle,
sont acceptés (20 au maximum). Toute erreur de protocole donne
`{"type": "error", "code": "...", "message": "..."}` sans fermer la connexion.

Bonne pratique : charger l'état initial via l'API REST (par exemple
`GET /api/ml/predictions/summary/`), puis appliquer les messages reçus.

## Publier une alerte depuis le backend (modules sang, lits, ambulances)

```python
from django.db import transaction
from realtime.broadcast import broadcast_alert, broadcast_dashboard

transaction.on_commit(lambda: broadcast_alert(
    'blood',                                   # general | blood | bed | ambulance
    {'blood_group': 'O-', 'units_needed': 4},  # dictionnaire sérialisable en JSON (dates acceptées)
    region='dakar',                            # facultatif
    hospital_id=12,                            # facultatif
))

broadcast_dashboard('kpi', {'available_beds': 87}, hospital_id=12)  # dashboard | kpi | prediction
```

- Une alerte part toujours sur le flux national et, si précisés, sur le flux de
  sa région et de son hôpital.
- Les fonctions renvoient `False` sans lever d'exception si Redis est
  indisponible : la transaction métier n'est pas bloquée, et l'échec est journalisé.
- Appelez-les après validation de la transaction (`transaction.on_commit`) pour
  ne jamais annoncer une donnée qui serait ensuite annulée.
