# Lits d'hospitalisation — guide d'intégration

Responsable : Ibrahima Khalilou Diallo

Chaque établissement déclare ses services (`category`) avec le nombre de lits
installés et occupés. Les services vitaux (urgences, réanimation,
néonatologie) déclenchent une alerte quand ils saturent ou se libèrent.

Services : `emergency`, `intensive_care`, `surgery`, `internal_medicine`,
`maternity`, `pediatrics`, `neonatology`. Seuls les hôpitaux, centres de santé
et cliniques gèrent des lits.

## Accès

- Lecture : `admin`, `hospital_staff`, `ambulance_driver` (orientation des
  patients), pour tous les établissements actifs.
- Écriture : `admin`, ou personnel de l'établissement concerné (403 sinon).

## Routes

| Route | Description |
|---|---|
| `GET /api/lits/capacities/` | Filtres : `region`, `category`, `facility`, `available=true/false` |
| `POST /api/lits/capacities/` | `{"category", "total_beds", "occupied_beds", "facility_id" (admin)}` ; 409 si le service existe déjà |
| `PATCH /api/lits/capacities/<id>/` | `total_beds`, `occupied_beds` (le service ne change pas) |
| `POST /api/lits/capacities/<id>/admit/` | Un lit occupé de plus ; 409 si le service est plein |
| `POST /api/lits/capacities/<id>/discharge/` | Un lit libéré ; 409 si aucun lit n'est occupé |
| `GET /api/lits/capacities/summary/` | Par région et service : `total_beds`, `occupied_beds`, `available_beds`, `occupancy_rate` (filtres `region`, `category`) |
| `GET /api/lits/capacities/nearest/` | Établissements les plus proches ayant des lits libres : `latitude`, `longitude`, `category` (`emergency` par défaut), `radius_km` (50), `limit`, `min_available` (1) |

Chaque capacité renvoie `available_beds`, `occupancy_rate` (0 à 1), `updated_at`
et `updated_by`.

Les admissions et sorties sont atomiques : une mise à jour SQL conditionnelle
empêche de dépasser la capacité, même avec des requêtes simultanées. Une
contrainte en base garantit aussi `occupied_beds ≤ total_beds`.

## Temps réel

| Flux | Type | `data.event` |
|---|---|---|
| `/ws/dashboard/` (national, `?hospital_id=`) | `kpi_update` | `bed_capacity_updated` (à chaque changement) |
| `/ws/alerts/` (national, `?region=`, `?hospital_id=`) | `bed_alert` | `bed_capacity_saturated`, `bed_capacity_restored` (services vitaux) |
