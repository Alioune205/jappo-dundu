# Don de sang — guide d'intégration

Responsable : Ibrahima Khalilou Diallo

## Parcours

1. Le citoyen s'inscrit (`/api/users/register/`) puis crée son profil donneur
   (groupe sanguin, sexe, date de naissance, position).
2. Un établissement publie une demande de sang. Les donneurs de la région
   reçoivent une alerte `blood_alert` en temps réel.
3. Sur l'écran « Alertes », le donneur voit les demandes compatibles proches
   et répond (accepter, décliner, se désister).
4. L'établissement voit les donneurs engagés (nom et téléphone), confirme les
   dons ; la demande se clôt quand toutes les poches sont collectées.

## Règles métier

- **Compatibilité ABO/Rh des globules rouges** : O- donne à tous, AB+ reçoit de
  tous, un receveur Rh- ne reçoit que du Rh- (`GET /api/sang/compatibility/`).
- **Éligibilité** : de 18 à 65 ans ; 90 jours entre deux dons pour un homme,
  120 pour une femme ; donneur disponible et compte actif. Ces valeurs sont à
  valider avec le CNTS (`sang/eligibility.py`).
- **Appariement** : donneurs éligibles, de groupe compatible, n'ayant pas déjà
  répondu, dans le rayon de la demande, du plus proche au plus éloigné. La
  recherche utilise PostGIS : index GiST et tri KNN.
- **Confidentialité** : la position d'un donneur n'est jamais transmise. Les
  donneurs suggérés à un établissement sont anonymes (groupe et distance). Le
  nom et le téléphone ne sont visibles qu'après engagement (réponse
  `accepted`). Les précisions cliniques d'une demande (`notes`) ne sont pas
  montrées aux donneurs.

## Donneur (application mobile)

| Route | Description |
|---|---|
| `GET /api/sang/donors/me/` | Profil, avec `is_eligible`, `next_eligible_date` et `ineligibility_reasons` (404 si aucun profil) |
| `PUT /api/sang/donors/me/` | Création (201) ou remplacement : `blood_group`, `sex` (`M`/`F`), `date_of_birth`, `is_available`, `latitude`, `longitude`, `last_donation_date` (facultatif) |
| `PATCH /api/sang/donors/me/` | Ex. `{"is_available": false}` ou nouvelle position |
| `GET /api/sang/requests/nearby/` | Écran « Alertes » : demandes ouvertes compatibles dont le rayon atteint le donneur. Paramètres : `latitude`/`longitude` (position du téléphone, sinon celle du profil), `radius_km` (200 au maximum), `limit` ; chaque demande indique `distance_km` et `my_response` |
| `POST /api/sang/requests/<id>/respond/` | `{"status": "accepted" \| "declined" \| "cancelled"}` ; 409 si la demande est clôturée, si le groupe est incompatible ou si le donneur n'est pas éligible (raison dans `detail`) |
| `GET /api/sang/donors/me/donations/` | Écran « Historique » : dons |
| `GET /api/sang/donors/me/responses/` | Écran « Historique » : réponses aux demandes |

## Établissement (web : personnel hospitalier, admin)

Le personnel ne voit et ne gère que les demandes de son établissement.

| Route | Description |
|---|---|
| `GET /api/sang/requests/` | Filtres : `status`, `blood_group`, `urgency`, `region`, `facility` ; chaque demande donne `response_counts` |
| `POST /api/sang/requests/` | `blood_group`, `units_needed` (1 à 50), `urgency` (`critical`, `urgent`, `normal`), `notes`, `needed_by`, `search_radius_km` (1 à 200, 20 par défaut), `facility_id` (admin uniquement) |
| `PATCH /api/sang/requests/<id>/` | Demande ouverte : besoin, urgence, rayon, échéance, précisions |
| `POST /api/sang/requests/<id>/cancel/` | Annulation |
| `GET /api/sang/requests/<id>/matches/` | Donneurs compatibles et éligibles les plus proches, anonymes (`limit`, `radius_km` ≤ rayon de la demande) |
| `GET /api/sang/requests/<id>/responses/` | Réponses (`status` en filtre) |
| `POST /api/sang/requests/<id>/responses/<rid>/confirm/` | Don effectué : historique du donneur, poches collectées, clôture automatique |
| `POST /api/sang/requests/<id>/responses/<rid>/no-show/` | Donneur engagé absent |
| `GET /api/sang/donors/lookup/?phone_number=…` | Retrouver un donneur par son téléphone (recherche exacte) |
| `GET/POST /api/sang/donations/` | Dons spontanés : `{"donor_id", "donated_on"}` |

## Temps réel

| Flux | Type | `data.event` |
|---|---|---|
| `/ws/alerts/` (national, `?region=`, `?hospital_id=`) | `blood_alert` | `blood_request_created`, `blood_request_updated`, `blood_request_closed` |
| `/ws/dashboard/` (national, `?hospital_id=`) | `dashboard_update` | les mêmes, plus `blood_response_updated` (compteurs de réponses) |

Les alertes ne contiennent aucune donnée personnelle : groupe, poches
restantes, urgence, établissement (nom, ville, position).
