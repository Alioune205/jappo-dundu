# Ambulances et missions — guide d'intégration

Responsable : Ibrahima Khalilou Diallo

## Rôles

- **Régulation** (`admin`, `hospital_staff`) : crée les missions, affecte les
  ambulances, suit les indicateurs.
- **Conducteur** (`ambulance_driver`) : envoie sa position, déclare les étapes
  de sa mission et ne voit que les missions de son ambulance.
- **Admin** : gère la flotte (création, établissement, type, conducteur).

## Cycle de vie d'une mission

```
pending ──assign──► assigned ──► on_site ──► transporting ──► completed
   │                    │            │  └──────────────────────► completed (soins sur place)
   └────────────────────┴────────────┴──► cancelled (régulation, motif obligatoire)
```

- L'affectation choisit par défaut l'ambulance disponible la plus proche du
  lieu d'intervention (PostGIS, tri KNN). On peut aussi imposer une ambulance
  (`ambulance_id`) ou un type (`ambulance_type`).
- Deux affectations simultanées n'obtiennent jamais la même ambulance : la
  réservation se fait par une mise à jour SQL conditionnelle, et une contrainte
  en base interdit deux missions actives pour une même ambulance.
- `transporting` exige un établissement de destination.
- À la fin ou à l'annulation d'une mission, l'ambulance redevient disponible.
- Chaque étape est horodatée (`assigned_at`, `on_site_at`, `transporting_at`,
  `completed_at`, `cancelled_at`) ; `response_time_minutes` mesure le délai
  entre le signalement et l'arrivée sur place.

## Routes — flotte (`/api/ambulances/vehicles/`)

| Route | Accès | Description |
|---|---|---|
| `GET /` | régulation, conducteurs | Filtres : `status`, `ambulance_type`, `region`, `facility` |
| `POST /` ; `PATCH /<id>/` | admin | `plate_number` (normalisée en majuscules), `facility_id`, `ambulance_type` (`basic`, `medicalized`), `driver_id` (compte `ambulance_driver`, une ambulance par conducteur) |
| `GET /nearest/` | régulation | Ambulances disponibles les plus proches : `latitude`, `longitude`, `radius_km` (50), `limit`, `ambulance_type` |
| `GET /mine/` | conducteur | Son ambulance |
| `POST /<id>/position/` | conducteur de l'ambulance, admin | `{"latitude", "longitude"}` |
| `POST /<id>/availability/` | conducteur de l'ambulance, admin | `{"status": "available" \| "out_of_service"}` ; 409 pendant une mission |

## Routes — missions (`/api/ambulances/missions/`)

| Route | Accès | Description |
|---|---|---|
| `GET /` | régulation ; conducteur (ses missions) | Filtres : `status`, `active=true/false`, `priority`, `region`, `ambulance` |
| `POST /` | régulation | `priority` (`critical`, `urgent`, `normal`), `description`, `pickup_address`, `pickup_latitude`, `pickup_longitude`, `region`, `caller_phone`, `destination_id` |
| `PATCH /<id>/` | régulation | Mission non clôturée : priorité, description, destination, téléphone (le lieu d'intervention est figé) |
| `POST /<id>/assign/` | régulation | `{}`, `{"ambulance_type": "medicalized", "radius_km": 80}` ou `{"ambulance_id": 4}` ; 409 si aucune ambulance n'est disponible |
| `POST /<id>/status/` | conducteur (`on_site`, `transporting`, `completed`), régulation (tout) | `{"status", "destination_id", "cancellation_reason"}` ; 409 si la transition est impossible |
| `GET /<id>/destinations/` | régulation, conducteur | Établissements proches avec lits libres (module Lits), depuis l'ambulance ou le lieu d'intervention : `category` (`emergency` par défaut), `radius_km`, `limit` |
| `GET /stats/` | régulation | Sur `days` jours (30 par défaut), avec `region` en filtre : missions par statut, délai d'affectation et délai d'intervention (moyenne et médiane, en minutes), état de la flotte |

## Temps réel

| Flux | Type | `data.event` |
|---|---|---|
| `/ws/alerts/` (national, `?region=`, `?hospital_id=` de destination) | `ambulance_alert` | `mission_created`, `mission_updated` |
| `/ws/dashboard/` | `dashboard_update` | `mission_created`, `mission_updated`, `ambulance_position`, `ambulance_status` |

Une position est diffusée au tableau de bord national et à celui de l'hôpital
de destination (sinon celui de l'établissement de l'ambulance) : les cartes se
mettent à jour sans rechargement.
