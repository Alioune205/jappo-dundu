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

Chaque capacité renvoie `reserved_beds`, `available_beds` (installés − occupés −
réservés), `occupancy_rate` (0 à 1), `updated_at` et `updated_by`.

Les admissions et sorties sont atomiques : une mise à jour SQL conditionnelle
empêche de dépasser la capacité, même avec des requêtes simultanées. Des
contraintes en base garantissent aussi `occupied_beds ≤ total_beds` et
`reserved_beds ≤ total_beds − occupied_beds`.

## Réservations de lits

Un lit peut être **bloqué pour un patient attendu** : patient transporté par le
SAMU, transfert depuis un autre hôpital, admission programmée. Tant que la
réservation est en cours, le lit est compté comme indisponible partout (liste,
recherche des lits libres, admissions « sans réservation »).

| Route | Description |
|---|---|
| `GET /api/lits/reservations/` | Filtres : `status` (`active`, `fulfilled`, `cancelled`, `expired`), `facility`, `mission` |
| `POST /api/lits/reservations/` | `{"capacity_id"}` ou `{"facility_id", "category"}`, puis `mission_id`, `reference`, `notes`, `hold_minutes` (45 par défaut, 5 à 240) ; 409 s'il n'y a plus de lit libre |
| `POST /api/lits/reservations/<id>/fulfill/` | Le patient est arrivé : le lit réservé devient occupé |
| `POST /api/lits/reservations/<id>/cancel/` | Libère le lit (`{"reason"}` facultatif) |

Règles :
- **Qui réserve** : l'administrateur des lits pour son établissement, la
  régulation (administrateur des ambulances, personnel hospitalier) pour les
  établissements de sa région, l'administrateur général partout. Seul
  l'établissement qui accueille le patient (ou l'administrateur général)
  enregistre son arrivée ; celui qui a réservé peut toujours annuler.
- **Pas de nom de patient** : `reference` est un repère interne (« transfert
  bloc 2 »). Les citoyens ne réservent pas de lit : l'attribution reste une
  décision médicale.
- **Expiration** : sans arrivée ni annulation, la réservation expire et le lit
  redevient libre. Les réservations échues sont libérées avant chaque lecture
  ou écriture qui en dépend ; `python manage.py expire_bed_reservations` le fait
  aussi en lot (à planifier toutes les 5 minutes en production).
- **Missions SAMU** : réserver pour une mission oriente l'ambulance vers
  l'établissement (une seule réservation active par mission : réorienter
  remplace la précédente). Mission terminée → patient admis automatiquement ;
  mission annulée → lit libéré.
- **SIH** : le logiciel hospitalier fait foi sur l'état physique. S'il déclare
  le service plein, les réservations qui ne tiennent plus sont libérées (les
  plus récentes d'abord). Un ajustement manuel, lui, est refusé (409) tant
  qu'il supprimerait un lit réservé.

## Temps réel

| Flux | Type | `data.event` |
|---|---|---|
| `/ws/dashboard/` (national, `?hospital_id=`) | `kpi_update` | `bed_capacity_updated` (à chaque changement) |
| `/ws/alerts/` (national, `?region=`, `?hospital_id=`) | `bed_alert` | `bed_capacity_saturated`, `bed_capacity_restored` (services vitaux) |
