# 🛡️ Guide Officiel des Profils, Rôles et Droits d'Accès — Jappo Dundu

Ce document constitue la **référence officielle** de la gouvernance des identités et des accès (IAM / RBAC / ABAC) de la plateforme **Jappo Dundu** (« Soigner ensemble »). Il détaille l'ensemble des acteurs, leurs responsabilités métier, leurs interfaces d'accès (Web, Mobile, M2M) et leur périmètre d'autorisation précis sur l'ensemble des modules du système.

---

## 📑 Sommaire
1. [Architecture de Sécurité & Contrôle d'Accès](#-1-architecture-de-sécurité)
2. [Vue d'Ensemble des 8 Profils & Acteurs](#-2-vue-densemble-des-8-profils--acteurs)
3. [Fiches Détaillées par Profil](#-3-fiches-détaillées-par-profil)
   - [1. Administrateur Général (`admin`)](#1-administrateur-général-admin)
   - [2. Gestionnaire des Lits (`bed_manager`)](#2-gestionnaire-des-lits-bed_manager)
   - [3. Gestionnaire du Sang & CNTS (`blood_manager`)](#3-gestionnaire-du-sang-blood_manager)
   - [4. Régulateur SAMU (`ambulance_manager`)](#4-régulateur-samu-ambulance_manager)
   - [5. Personnel Hospitalier Polyvalent (`hospital_staff`)](#5-personnel-hospitalier-polyvalent-hospital_staff)
   - [6. Ambulancier / Chauffeur (`ambulance_driver`)](#6-ambulancier--chauffeur-ambulance_driver)
   - [7. Citoyen Donneur de Sang (`donor`)](#7-citoyen-donneur-de-sang-donor)
   - [8. Connecteur Machine SIH (`sih_machine`)](#8-connecteur-machine-sih-sih_machine)
4. [Matrice Croisée des Droits d'Accès (CRUD)](#-4-matrice-croisée-des-droits-daccès)
5. [Authentification, Jetons JWT & Clés API](#-5-authentification-jetons-jwt--clés-api)
6. [Comptes de Démonstration & Tests](#-6-comptes-de-démonstration)

---

## 🔒 1. Architecture de Sécurité

La sécurité de Jappo Dundu repose sur un modèle hybride rigoureux :
* **RBAC (Role-Based Access Control)** : Chaque compte possède un rôle principal et des groupes de permissions (`security/roles.py`).
* **ABAC (Attribute-Based Access Control)** : Le périmètre d'action est restreint dynamiquement selon l'établissement de rattachement (`UserProfile.facility`) ou la région administrative (`facility.region`), assurant une étanchéité stricte entre hôpitaux.
* **Sécurité en profondeur** : Le contrôle est opéré côté backend au niveau des requêtes SQL (`get_queryset()` avec `scope_to_facility()`) et des permissions DRF (`has_permission`, `has_object_permission`).

---

## 👥 2. Vue d'Ensemble des 8 Profils & Acteurs

| Profil | Code Rôle | Interface | Périmètre Géographique | Rattachement Obligatoire |
| :--- | :--- | :---: | :---: | :---: |
| **Administrateur Général** | `admin` | Web Dashboard & Admin | National (Sénégal entier) | Aucun |
| **Gestionnaire des Lits** | `bed_manager` | Web Dashboard | Son établissement | Hôpital / Clinique |
| **Gestionnaire du Sang** | `blood_manager` | Web Dashboard | Son établissement (CNTS : sa région) | Hôpital / CNTS |
| **Régulateur SAMU** | `ambulance_manager` | Web Dashboard | Sa région & ses ambulances | Service SAMU / Hôpital |
| **Personnel Hospitalier (Historique)** | `hospital_staff` | Web Dashboard | Son établissement (missions : sa région) | Tout type d'établissement |
| **Ambulancier / Chauffeur** | `ambulance_driver` | Mobile (Tablette/Tél) | Son véhicule et ses missions | Service SAMU (Optionnel) |
| **Citoyen Donneur** | `donor` | Mobile Citoyen | Son rayon de proximité | Aucun |
| **Connecteur Progiciel SIH** | *(clé API, pas un rôle)* | API REST M2M | Son établissement, domaines de la clé | Établissement de santé |

> Seuls `admin`, `bed_manager`, `blood_manager`, `ambulance_manager` et `hospital_staff` ouvrent une session sur le tableau de bord web. Un donneur ou un ambulancier y est refusé : il utilise l'application mobile.
>
> Les rôles sont relus en base à chaque requête (groupes Django + `is_staff`) : les claims `role`/`roles` du JWT ne servent qu'à l'affichage. Le rôle `admin` correspond à `is_staff` ; il ne s'attribue que via `PATCH /api/users/<id>/ {"role": "admin"}` (ou `createsuperuser`), jamais pour un simple accès à `/admin/`.

---

## 📋 3. Fiches Détaillées par Profil

---

### 1. Administrateur Général (`admin`)
* **Profil Métier** : Ministère de la Santé et de l'Action Sociale (MSAS), administrateurs techniques de la plateforme.
* **Interface** : Web (Tableau de bord de supervision national + Django Admin `/admin/`).
* **Attribution** : Compte Django avec indicateurs `is_staff=True` ou `is_superuser=True`.
* **Périmètre** : **National**. Aucun filtrage par établissement ni région.

#### Accès & Responsabilités :
* **Comptes & Établissements** : Création, modification, désactivation des hôpitaux, centres de transfusion, cliniques et comptes du personnel.
* **Supervision Nationale** : Vue consolidée en temps réel de tous les lits disponibles, stocks de sang et missions SAMU du Sénégal.
* **Machine Learning & IA** : Prédictions nationales. Le réentraînement du modèle de pénurie (`HistGradientBoosting`) se lance en ligne de commande (`python manage.py train_model`) : il n'existe pas d'endpoint d'entraînement.
* **Gestion SIH** : Création et révocation de clés API pour n'importe quel établissement (`facility_id` obligatoire).

#### Endpoints DRF Clés :
* `GET/POST/PATCH /api/facilities/` (pas de suppression : `PATCH {"is_active": false}` retire un établissement)
* `GET/POST/PATCH /api/users/` (pas de suppression : `PATCH {"is_active": false}` désactive le compte et ferme ses sessions)
* `GET /api/ml/model-info/`, `POST /api/ml/predict/`
* `GET/POST/DELETE /api/sih/keys/` (Toutes les clés SIH du pays)

---

### 2. Gestionnaire des Lits (`bed_manager`)
* **Profil Métier** : Surveillant général d'hôpital, chef du bureau des entrées, responsable de la régulation des admissions.
* **Interface** : Web Dashboard (React).
* **Attribution** : Utilisateur appartenant au groupe Django `bed_manager`.
* **Périmètre** : **Son établissement** (`UserProfile.facility`). Lecture globale possible pour orienter les patients.

#### Accès & Responsabilités :
* **Gestion des Capacités** : Déclarer les services d'hospitalisation de son établissement (`emergency`, `intensive_care`, `surgery`, `maternity`, etc.) et le nombre de lits installés.
* **Entrées / Sorties (Temps Réel)** : Saisir les admissions (`/admit/`) et les sorties de patients (`/discharge/`).
* **Orientation des Urgences** : Consulter en lecture seule les lits disponibles dans les **autres hôpitaux** pour réorienter les transferts.
* **Missions en cours** : Suivre en direct les ambulances actuellement en route vers son propre hôpital.

#### Endpoints DRF Clés :
* `GET /api/lits/capacities/` (Consultation des lits)
* `POST /api/lits/capacities/` (Création d'un service dans son hôpital)
* `PATCH /api/lits/capacities/<id>/` (Ajustement lits installés/occupés)
* `POST /api/lits/capacities/<id>/admit/` & `/discharge/`
* `GET /api/lits/capacities/nearest/` (Recherche lits libres proches)

---

### 3. Gestionnaire du Sang & CNTS (`blood_manager`)
* **Profil Métier** : Responsable de banque de sang hospitalière, biologiste, médecin du Centre National de Transfusion Sanguine (CNTS).
* **Interface** : Web Dashboard (React).
* **Attribution** : Groupe Django `blood_manager`.
* **Périmètre** : 
  * *Hôpital classique* : Son établissement uniquement.
  * *Centre de Transfusion (CNTS)* : **Toute sa région administrative** pour la coordination et l'approvisionnement.

#### Accès & Responsabilités :
* **Demandes de Sang Urgentes** : Créer, modifier et clôturer les demandes d'extrême urgence (`BloodRequest`).
* **Enregistrement des Dons** : Confirmer les dons réalisés suite à une alerte ou enregistrer les dons spontanés avec attribution automatique de badges et points.
* **Recherche de Donneurs** : Scanner/saisir le code de carte donneur (`JD-XXXX-XXXX`) ou le numéro de téléphone pour retrouver un profil donneur (`/donors/lookup/`).
* **Stocks & Prédictions ML** :
  * Saisir et ajuster manuellement les stocks de poches (`/api/ml/stocks/`, `/adjust/`, `/batch/`).
  * Consulter les prévisions d'alerte de pénurie générées par l'algorithme d'IA (`/api/ml/predictions/`).

#### Endpoints DRF Clés :
* `GET/POST /api/sang/requests/` (Demandes de sang de son périmètre)
* `POST /api/sang/requests/<id>/responses/<rid>/confirm/` (Confirmation de don)
* `GET /api/sang/donors/lookup/?card_code=...` (Retrouver un donneur)
* `POST /api/sang/donations/` (Enregistrer un don spontané)
* `POST /api/ml/stocks/`, `POST /api/ml/stocks/adjust/` (Gestion des stocks)
* `GET /api/ml/predictions/` (Prévisions de pénuries à 7 jours)

---

### 4. Régulateur SAMU (`ambulance_manager`)
* **Profil Métier** : Médecin régulateur du SAMU National, coordinateur de flotte d'ambulances d'urgence.
* **Interface** : Web Dashboard (React - Centre de régulation des appels).
* **Attribution** : Groupe Django `ambulance_manager`.
* **Périmètre** : **Son service d'ambulances et sa région**.

#### Accès & Responsabilités :
* **Gestion de Flotte** : Enregistrer, activer, désactiver et suivre la disponibilité des véhicules sanitaires (Type A, B, C, médicalisé).
* **Régulation des Missions** :
  * Créer une mission d'urgence (`AmbulanceMission`) suite à un appel de détresse.
  * Assigner un véhicule disponible et un ambulancier.
  * Choisir l'hôpital de destination en consultant en temps réel les **lits disponibles**.
* **Suivi Cartographique** : Visualiser la progression GPS des ambulances en direct sur la carte temps réel (`/ws/alerts/`).

#### Endpoints DRF Clés :
* `GET/POST /api/ambulances/vehicles/` (Flotte de véhicules)
* `GET/POST /api/ambulances/missions/` (Création et régulation des missions)
* `POST /api/ambulances/missions/<id>/assign/` & `/cancel/`
* `GET /api/lits/capacities/nearest/` (Orientation vers hôpitaux libres)

---

### 5. Personnel Hospitalier Polyvalent (`hospital_staff`)
* **Profil Métier** : Rôle historique d'agent de santé polyvalent (utilisé dans les centres de santé secondaires où la même personne gère les lits et le dépôt de sang).
* **Interface** : Web Dashboard (React).
* **Attribution** : Groupe Django `hospital_staff`.
* **Périmètre** : **Son établissement**.
* **Droits** : Cumule les accès opérationnels de `bed_manager` et `blood_manager` sur son établissement. Il conserve aussi la régulation des ambulances, mais **limitée** comme celle d'un `ambulance_manager` : véhicules de son établissement, missions de sa région (le périmètre national est réservé à `admin`).
* **Statut** : Rôle conservé pour les comptes existants ; les nouveaux comptes reçoivent un rôle spécialisé.

---

### 6. Ambulancier / Chauffeur (`ambulance_driver`)
* **Profil Métier** : Conducteur d'ambulance, ambulancier secouriste sur le terrain.
* **Interface** : **Application Mobile** ou Tablette embarquée.
* **Attribution** : Groupe Django `ambulance_driver`.
* **Périmètre** : Ses missions assignées et son véhicule.

#### Accès & Responsabilités :
* **Missions en direct** : Recevoir sa feuille de route d'urgence avec géolocalisation du patient et hôpital de destination.
* **Statuts de Mission** : Faire progresser la mission (`en route patient` ➔ `sur les lieux` ➔ `transport vers hôpital` ➔ `terminée`).
* **Télémétrie GPS** : Émettre sa position géographique en temps réel vers le serveur pour affichage sur le tableau de bord du SAMU.
* **Recherche de Lits** : Consulter en lecture seule les capacités en lits d'urgence les plus proches en cas de déroutement.
* **Limites** : La liste des véhicules ne renvoie que **son** ambulance (pas l'annuaire de la flotte). Seul le conducteur de l'ambulance affectée peut faire avancer une mission ; l'annulation relève de la régulation.

#### Endpoints DRF Clés :
* `GET /api/ambulances/missions/my-missions/` (Missions en cours)
* `POST /api/ambulances/missions/<id>/status/` (Mise à jour du statut)
* `POST /api/ambulances/vehicles/<id>/location/` (Ping GPS en temps réel)
* `GET /api/lits/capacities/nearest/` (Recherche lits d'urgence)

---

### 7. Citoyen Donneur de Sang (`donor`)
* **Profil Métier** : Citoyen sénégalais bénévole souhaitant donner son sang pour sauver des vies.
* **Interface** : **Application Mobile Jappo Dundu** (React Native / iOS & Android).
* **Attribution** : Rôle attribué automatiquement dès la création du profil donneur (`PUT /api/sang/donors/me/`).
* **Périmètre** : Strictement limité à ses propres données personnelles et aux alertes proches anonymisées.

#### Accès & Responsabilités :
* **Profil Donneur & Carte Numérique** :
  * Groupe sanguin (ex: O+, A-, O-), sexe, date de naissance, disponibilité.
  * Carte numérique sécurisée avec QR code et identifiant unique (`JD-XXXX-XXXX`).
* **Alertes de Proximité** :
  * Réception de notifications push et alertes temps réel quand un hôpital à proximité immédiate (< 15-30 km) a besoin de son groupe sanguin compatible.
  * Possibilité de répondre (`accepté`, `décliné`, `se désister`).
* **Gamification & Fidélisation** :
  * Suivi de son capital de points (100 pts par don, +50 pts bonus urgence critique, points de badges).
  * Niveau et titre honorifique (de *Citoyen Solidaire* jusqu'à *Légende Jappo Dundu*).
  * Déblocage de badges de reconnaissance officiels (*Premier Pas*, *Donneur Régulier*, *Sauveur Universel O-*, etc.).

#### Endpoints DRF Clés :
* `GET/PUT/PATCH /api/sang/donors/me/` (Profil et géolocalisation)
* `GET /api/sang/donors/me/gamification/` (Points, niveau, badges débloqués/verrouillés)
* `GET /api/sang/badges/` (Catalogue des badges de valorisation)
* `GET /api/sang/donors/me/donations/` (Historique médical de ses dons)
* `GET /api/sang/requests/nearby/` (Demandes compatibles proches)
* `POST /api/sang/requests/<id>/respond/` (Accepter / Décliner une alerte)

---

### 8. Connecteur Machine SIH (`sih_machine`)
* **Profil Métier** : Logiciel externe du Système d'Information Hospitalier (OpenMRS, GNU Health, DHIS2, ERP interne d'hôpital).
* **Interface** : **API REST M2M** (Machine-to-Machine, sans interface graphique).
* **Attribution** : Authentification via clé secrète d'établissement (`X-Hospital-API-Key` ou `Authorization: Api-Key <clé>`). Ce n'est pas un rôle : la clé est créée par un administrateur (voir la matrice) et les flux `/api/sih/` n'acceptent **que** cette clé (pas de JWT).
* **Périmètre** : Strictement limité à l'établissement détenteur de la clé, et aux domaines délégués : `allow_beds` (lits) et/ou `allow_blood` (stocks de sang). Une clé ne reçoit que les domaines que son créateur administre (`bed_manager` → lits, `blood_manager` → sang).
* **Sécurité des clés** : Seule une empreinte SHA-256 est stockée ; la clé en clair n'est affichée **qu'une fois**, dans la réponse de création. Débit limité par clé (`THROTTLE_SIH_BURST_RATE`, `THROTTLE_SIH_SUSTAINED_RATE`).

#### Accès & Responsabilités :
* **Synchronisation en Masse des Lits** : Mettre à jour automatiquement les capacités de chaque service toutes les heures ou à chaque changement de quart.
* **Événements ADT (Admission / Sortie)** : Émettre un événement unitaire en temps réel lors de l'enregistrement d'un patient dans le logiciel hospitalier.
* **Stocks de Sang** : Synchroniser automatiquement les poches disponibles depuis le logiciel de laboratoire (LIS).
* **Supervision & Traçabilité** : Consultation des logs d'audit et diagnostic de connexion (`/ping/`).

#### Endpoints DRF Clés :
* `GET /api/sih/ping/` (Vérification de connectivité)
* `GET /api/sih/status/` (Synthèse des ressources)
* `POST /api/sih/beds/sync/` (Synchronisation batch des lits — clé `allow_beds`)
* `POST /api/sih/beds/event/` (Admission / Sortie unitaire ADT — clé `allow_beds`)
* `POST /api/sih/stocks/sync/` (Synchronisation automatique des stocks de sang — clé `allow_blood`)
* `GET /api/sih/logs/` (Journaux d'audit de synchronisation)

---

## 📊 4. Matrice Croisée des Droits d'Accès

> **Légende** :
> * **L** = Lecture
> * **É** = Écriture / Modification
> * **Propre** = Limité aux données propres de l'utilisateur
> * **Étab.** = Limité à l'établissement de rattachement
> * **Région** = Limité à la région administrative
> * **403** = Accès formellement interdit (Interdiction HTTP Forbidden)

| Ressource / Module | `admin` | `bed_manager` | `blood_manager` | `ambulance_manager` | `hospital_staff` | `ambulance_driver` | `donor` | Clé SIH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Lits : Capacités & Services** | L+É (Tous) | L (Tous), É (Étab.) | 403 | L (Tous) | L (Tous), É (Étab.) | L (Tous) | 403 | L+É (Étab., clé lits) |
| **Lits : Entrées / Sorties (ADT)** | L+É (Tous) | L+É (Étab.) | 403 | 403 | L+É (Étab.) | 403 | 403 | É (Étab., clé lits) |
| **Sang : Demandes urgentes** | L+É (Tous) | 403 | L+É (Étab. ; CNTS : Région) | 403 | L+É (Étab.) | 403 | L (Proches) | 403 |
| **Sang : Confirmation de don** | L+É (Tous) | 403 | L+É (Étab. ; CNTS : Région) | 403 | L+É (Étab.) | 403 | 403 | 403 |
| **Sang : Carte & Profil donneur** | L+É (Tous) | 403 | L (Lookup carte/tél) | 403 | L (Lookup carte/tél) | 403 | L+É (Propre) | 403 |
| **Gamification : Badges & Points** | L (Tous) | 403 | 403 | 403 | 403 | 403 | L (Propre) | 403 |
| **Stocks Sang : Saisie & Ajustement** | L+É (Tous) | 403 | L+É (Étab. ; CNTS : Région) | 403 | L+É (Étab.) | 403 | 403 | L+É (Étab., clé sang) |
| **IA : Prédictions de pénuries** | L+É (Tous) | 403 | L (Étab. ; CNTS : Région) | 403 | L (Étab.) | 403 | 403 | 403 |
| **IA : Réentraînement du modèle** | CLI serveur | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| **Ambulances : Flotte de véhicules** | L+É (Tous) | 403 | 403 | L+É (Son service) | L (Son étab.) | L (Son véhicule) | 403 | 403 |
| **Ambulances : Missions SAMU** | L+É (Tous) | L (Vers son étab.) | 403 | L+É (Sa région) | L+É (Sa région) | L + statut (Assignée) | 403 | 403 |
| **Comptes & Établissements** | L+É (Tous) | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| **Clés API SIH (Gestion)** | L+É (Toutes) | L+É (Étab., clés lits) | L+É (Étab., clés sang) | 403 | L+É (Étab.) | 403 | 403 | 403 |

> **Stocks de sang** : le centre et la région envoyés par le client ne sont jamais crus sur parole. Un administrateur du sang saisit pour son établissement, ou pour un établissement de sa région s'il est rattaché à un CNTS ; toute autre cible renvoie 403.
>
> **Alertes temps réel** (`/ws/alerts/`) : les alertes lits et ambulances, qui portent la position du patient, ne sont remises qu'aux destinataires de la même région que l'événement (sauf `admin`).

---

## 🔑 5. Authentification, Jetons JWT & Clés API

### 1. Authentification Humaine (Web & Mobile) — JWT
* **Connexion** : `POST /api/auth/token/`
  * Corps : `{"username": "...", "password": "..."}` *(le champ username accepte indifféremment l'identifiant ou le numéro de téléphone sénégalais).*
  * Réponse :
    ```json
    {
      "access": "eyJhbGciOi...",
      "refresh": "eyJhbGciOi...",
      "user": {
        "id": 12,
        "username": "dr.diop",
        "email": "...",
        "full_name": "...",
        "is_staff": false,
        "role": "bed_manager",
        "roles": ["bed_manager"],
        "groups": ["bed_manager"]
      }
    }
    ```
* **Envoi sur chaque requête** : En-tête HTTP `Authorization: Bearer <access_token>`.
* **Durée de vie** : `Access Token` = 30 minutes, `Refresh Token` = 7 jours avec rotation automatique des jetons.
* **Révocation** : Changement de mot de passe, désactivation, changement de rôle ou d'établissement par un administrateur → tous les refresh tokens du compte sont révoqués. Dans les trois derniers cas, ses WebSockets ouverts sont aussi fermés (code 4401, reconnexion avec les droits à jour).
* **Coordonnées sensibles** : Remplacer un téléphone ou un e-mail déjà renseigné (`PATCH /api/users/me/`) exige `current_password`, car ce sont l'identifiant de connexion et les canaux de réinitialisation du mot de passe. Une première saisie reste libre.
* **Connexion sociale** (Google, Apple, Facebook) : Réservée aux donneurs. Un compte devenu professionnel n'est plus ouvert par une liaison sociale existante.

### 2. Authentification Machine (SIH M2M) — Clés d'API
* **Envoi sur chaque requête** :
  ```http
  X-Hospital-API-Key: jd_sih_v7K9s2mPqL0w8ZxY...
  ```
* Aucun jeton JWT requis (ni accepté) pour les appels machines de synchronisation SIH.
* L'établissement émetteur et les domaines autorisés sont déduits de la clé par `HospitalApiKeyAuthentication`.

---

## 🧪 6. Comptes de Démonstration

Ces comptes sont générés automatiquement par la commande de seed :
```bash
python seed_demo_data.py
```
> **Mot de passe universel de démonstration** : `Password123!` (réinitialisé à chaque exécution).
>
> ⚠️ Le script refuse de s'exécuter lorsque `DEBUG=False`, car il crée un superutilisateur au mot de passe public. Sur une instance de démonstration assumée uniquement : `python seed_demo_data.py --allow-production`.

| Rôle | Identifiant (`username`) | Téléphone | Établissement de rattachement |
| :--- | :--- | :--- | :--- |
| **Administrateur Général** | `admin` | `+221770000001` | *National (Sans rattachement)* |
| **Gestionnaire des Lits** | `dr.diop` | `+221771112233` | Hôpital Principal de Dakar |
| **Gestionnaire du Sang** | `cnts.dakar` | `+221773334455` | Centre National de Transfusion Sanguine (CNTS) |
| **Régulateur SAMU** | `samu.regulation` | `+221774445566` | SAMU National 15 |
| **Ambulancier** | `samu.driver` | `+221775556677` | SAMU National 15 |
| **Donneur Citoyen** | `awa.ndiaye` | `+221778889900` | *Citoyen (Groupe O+, Dakar)* |

> Le seed ne crée aucun compte `hospital_staff` (rôle historique).
