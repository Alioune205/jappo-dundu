# 📋 README — Profils, Rôles et Droits d'Accès de la Plateforme Jappo Dundu

> **Plateforme Jappo Dundu** (« Soigner ensemble » en wolof)  
> Système intégré de régulation et de coordination des urgences médicales au Sénégal : **Disponibilité des lits hospitaliers**, **Dons et stocks de sang**, **Services ambulanciers SAMU** et **Interopérabilité SIH**.

Ce document présente de façon exhaustive et pédagogique l'ensemble des **8 profils d'utilisateurs et acteurs système**, leurs **missions**, leurs **interfaces d'accès** (Web, Mobile, API Machine) ainsi que leur **matrice détaillée des droits et permissions (RBAC / ABAC)**.

---

## 📑 Sommaire
1. [Architecture Globale de Contrôle d'Accès](#-1-architecture-globale-de-contrôle-daccès)
2. [Vue Synthétique des 8 Profils](#-2-vue-synthétique-des-8-profils)
3. [Fiches Détaillées par Profil](#-3-fiches-détaillées-par-profil)
   - [Profil 1 : Administrateur Général (`admin`)](#profil-1--administrateur-général-admin)
   - [Profil 2 : Gestionnaire des Lits (`bed_manager`)](#profil-2--gestionnaire-des-lits-bed_manager)
   - [Profil 3 : Gestionnaire du Sang & CNTS (`blood_manager`)](#profil-3--gestionnaire-du-sang-blood_manager)
   - [Profil 4 : Régulateur SAMU (`ambulance_manager`)](#profil-4--régulateur-samu-ambulance_manager)
   - [Profil 5 : Personnel Hospitalier Polyvalent (`hospital_staff`)](#profil-5--personnel-hospitalier-polyvalent-hospital_staff)
   - [Profil 6 : Ambulancier / Chauffeur (`ambulance_driver`)](#profil-6--ambulancier--chauffeur-ambulance_driver)
   - [Profil 7 : Citoyen Donneur de Sang (`donor`)](#profil-7--citoyen-donneur-de-sang-donor)
   - [Profil 8 : Connecteur Automatisé SIH (`sih_machine`)](#profil-8--connecteur-automatisé-sih-sih_machine)
4. [Matrice Croisée des Droits d'Accès (CRUD)](#-4-matrice-croisée-des-droits-daccès-crud)
5. [Mécanismes d'Authentification & Sécurité](#-5-mécanismes-dauthentification--sécurité)
6. [Comptes de Test & Démonstration](#-6-comptes-de-test--démonstration)

---

## 🔒 1. Architecture Globale de Contrôle d'Accès

La plateforme **Jappo Dundu** applique le principe de **moindre privilège** combinant deux modèles complémentaires :

1. **RBAC (Role-Based Access Control)** :  
   Chaque compte utilisateur est assigné à un rôle métier standardisé (stocké dans les Groupes Django et validé par `backend/security/roles.py`).
2. **ABAC (Attribute-Based Access Control)** :  
   Même avec un rôle identique, les actions d'un utilisateur sont strictement restreintes par ses attributs contextuels :
   - Son **établissement de santé** (`UserProfile.facility`) : un hôpital ne peut pas modifier les données d'un autre hôpital.
   - Sa **région administrative** (`facility.region`) : coordination régionale (ex: SAMU Dakar, CNTS Thiès).
   - Son **véhicule assigné** ou ses **données personnelles** pour les profils individuels.
3. **M2M (Machine to Machine)** :  
   Pour les logiciels hospitaliers externes (OpenMRS, DHIS2, ERP), l'accès s'opère via des clés d'API sécurisées à portée restreinte par domaine (`allow_beds`, `allow_blood`).

---

## 👥 2. Vue Synthétique des 8 Profils

| N° | Profil | Code Système | Type d'Acteur | Interface Utilisateur | Périmètre Géographique |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | **Administrateur Général** | `admin` | Humain | Web Dashboard & Django Admin | **National** (Tout le Sénégal) |
| **2** | **Gestionnaire des Lits** | `bed_manager` | Humain | Web Dashboard (React) | **Son Hôpital** |
| **3** | **Gestionnaire du Sang & CNTS** | `blood_manager` | Humain | Web Dashboard (React) | **Son Hôpital** (CNTS : Sa région) |
| **4** | **Régulateur SAMU** | `ambulance_manager` | Humain | Web Dashboard (React) | **Son Service & Sa Région** |
| **5** | **Personnel Hospitalier Polyvalent** | `hospital_staff` | Humain | Web Dashboard (React) | **Son Établissement** |
| **6** | **Ambulancier / Chauffeur** | `ambulance_driver` | Humain | Mobile (React Native / Expo) | **Sa Mission & Son Véhicule** |
| **7** | **Citoyen Donneur de Sang** | `donor` | Humain | Mobile (React Native / Expo) | **Données Propres & Rayon Proche** |
| **8** | **Connecteur Machine SIH** | `sih_machine` | Machine | API REST M2M (HTTP Headers) | **Son Établissement (Clé API)** |

---

## 📋 3. Fiches Détaillées par Profil

---

### Profil 1 : Administrateur Général (`admin`)

* **Rôle Métier** : Administrateur système du Ministère de la Santé et de l'Action Sociale (MSAS) ou ingénieur d'exploitation de la plateforme.
* **Interface Utilisée** :
  - **Web Dashboard** : Supervision globale et indicateurs décisionnels nationaux.
  - **Console Django Admin** (`/admin/`) : Gestion technique de bas niveau.
* **Critère d'attribution** : Compte utilisateur avec `is_staff = True` ou `is_superuser = True`.
* **Périmètre d'action** : **National**. Aucun filtrage par établissement ni par région.

#### Responsabilités & Accès Métier :
* **Gestion des Structures Sanitaires** : Création, modification et désactivation des hôpitaux, cliniques, banques de sang, centres SAMU.
* **Gestion des Utilisateurs** : Création des comptes des professionnels de santé, attribution des rôles, désactivation des comptes et réinitialisation des accès.
* **Supervision Nationale en Temps Réel** : Tableau de bord consolidé de l'ensemble des lits d'urgence, réserves de sang et interventions SAMU du pays.
* **Intelligence Artificielle & Modèles ML** : Consultation des modèles prédictifs et lancement des réentraînements du modèle de pénurie en ligne de commande.
* **Gouvernance SIH** : Création, audit et révocation de toutes les clés d'API des hôpitaux du pays.

#### Endpoints API Principaux :
* `GET / POST / PATCH /api/facilities/` — Gestion des structures sanitaires
* `GET / POST / PATCH /api/users/` — Gestion des utilisateurs et de leurs rôles
* `GET /api/ml/model-info/`, `POST /api/ml/predict/` — Moteur d'IA prédictif
* `GET / POST / DELETE /api/sih/keys/` — Contrôle des clés API SIH nationales

---

### Profil 2 : Gestionnaire des Lits (`bed_manager`)

* **Rôle Métier** : Surveillant général d'hôpital, chef du bureau des entrées, responsable de la régulation des lits d'hospitalisation.
* **Interface Utilisée** : **Web Dashboard (React)**.
* **Critère d'attribution** : Utilisateur associé au rôle `bed_manager` et rattaché obligatoirement à un établissement de santé (`facility`).
* **Périmètre d'action** : **Son établissement** pour la gestion active ; consultation en lecture seule des autres établissements pour orientation des patients.

#### Responsabilités & Accès Métier :
* **Capacités Hospitalières** : Déclarer et modifier les services de soins de son hôpital (Urgences, Réanimation, Chirurgie, Maternité, Pédiatrie, etc.) ainsi que le nombre de lits installés.
* **Mouvements Patients (ADT)** : Enregistrer les admissions de patients (`/admit/`) et les sorties / décharges (`/discharge/`) pour maintenir le décompte exact des lits occupés.
* **Orientation des Urgences** : Consulter en temps réel les lits disponibles dans les établissements partenaires les plus proches en cas de saturation de son propre hôpital.
* **Suivi des Véhicules entrants** : Visualiser les ambulances SAMU en approche vers son hôpital pour anticiper l'accueil des malades critiques.
* **Délégation SIH Lits** : Créer et gérer la clé API de synchronisation des lits pour le progiciel interne de son établissement.

#### Endpoints API Principaux :
* `GET / POST / PATCH /api/lits/capacities/` — Consultation et gestion des services et lits
* `POST /api/lits/capacities/<id>/admit/` — Enregistrement d'une admission
* `POST /api/lits/capacities/<id>/discharge/` — Enregistrement d'une sortie
* `GET /api/lits/capacities/nearest/` — Recherche des lits d'urgence disponibles aux alentours
* `GET / POST /api/sih/keys/` — Clés SIH lits de son établissement

---

### Profil 3 : Gestionnaire du Sang & CNTS (`blood_manager`)

* **Rôle Métier** : Médecin ou biologiste responsable de banque de sang hospitalière, coordinateur du Centre National de Transfusion Sanguine (CNTS).
* **Interface Utilisée** : **Web Dashboard (React)**.
* **Critère d'attribution** : Utilisateur associé au rôle `blood_manager` et rattaché à un hôpital ou au CNTS.
* **Périmètre d'action** :
  - *Hôpital ordinaire* : Son établissement uniquement.
  - *Centre CNTS* : **Toute sa région administrative** pour la régulation des réserves.

#### Responsabilités & Accès Métier :
* **Demandes de Sang Urgentes** : Créer, mettre à jour et clôturer les demandes d'extrême urgence en précisant le groupe sanguin, les rhésus compatibles, la quantité de poches requise et le niveau de criticité.
* **Validation & Enregistrement des Dons** :
  - Retrouver un donneur via sa carte numérique (`JD-XXXX-XXXX`) ou son numéro de téléphone (`/donors/lookup/`).
  - Confirmer les dons réalisés suite à une alerte d'urgence ou enregistrer les dons spontanés.
  - Attribution automatique des points de gamification et badges au donneur validé.
* **Saisie & Ajustement des Stocks de Sang** :
  - Déclarer les poches disponibles par groupe sanguin (A+, A-, B+, B-, AB+, AB-, O+, O-).
  - Effectuer des ajustements unitaires ou des saisies par lot (`/batch/`).
* **Prédictions IA de Pénurie** : Consulter les prévisions d'alerte à 7 jours calculées par l'algorithme de Machine Learning.
* **Délégation SIH Sang** : Créer et gérer la clé API sang pour le système de laboratoire (LIS) de son établissement.

#### Endpoints API Principaux :
* `GET / POST /api/sang/requests/` — Demandes de sang urgentes
* `POST /api/sang/requests/<id>/responses/<rid>/confirm/` — Validation d'un don lié à une alerte
* `GET /api/sang/donors/lookup/?card_code=...` — Recherche d'un donneur par carte ou tél
* `POST /api/sang/donations/` — Enregistrement d'un don spontané
* `POST /api/ml/stocks/`, `POST /api/ml/stocks/adjust/` — Saisie et ajustement manuel du stock
* `GET /api/ml/predictions/` — Alertes prédictives de pénurie

---

### Profil 4 : Régulateur SAMU (`ambulance_manager`)

* **Rôle Métier** : Médecin régulateur ou répartiteur du SAMU National (Service d'Aide Médicale Urgente 15).
* **Interface Utilisée** : **Web Dashboard (React - Poste de Régulation)**.
* **Critère d'attribution** : Utilisateur associé au rôle `ambulance_manager`.
* **Périmètre d'action** : **Son service SAMU et sa région administrative**.

#### Responsabilités & Accès Métier :
* **Gestion du Parc Ambulancier** : Enregistrer, activer/désactiver et suivre l'état opérationnel des véhicules (Type A, Type B médicalisé, Type C).
* **Création & Affectation de Missions** :
  - Déclencher une mission d'urgence sanitaire à partir d'un appel au 15.
  - Assigner un véhicule disponible et son chauffeur.
  - Choisir la structure hospitalière de destination en vérifiant en temps réel la **disponibilité des lits d'urgence**.
* **Supervision Cartographique en Temps Réel** : Suivre en continu les positions GPS transmises par les ambulances sur la carte interactive (`/ws/alerts/`).
* **Gestion des Incidents** : Réaffectation de véhicule, déroutement ou annulation de mission motivée.

#### Endpoints API Principaux :
* `GET / POST / PATCH /api/ambulances/vehicles/` — Gestion de la flotte de véhicules
* `GET / POST /api/ambulances/missions/` — Déclenchement et supervision des missions SAMU
* `POST /api/ambulances/missions/<id>/assign/` — Affectation d'un véhicule et d'un chauffeur
* `POST /api/ambulances/missions/<id>/cancel/` — Annulation d'une mission
* `GET /api/lits/capacities/nearest/` — Consultation des lits disponibles pour évacuation

---

### Profil 5 : Personnel Hospitalier Polyvalent (`hospital_staff`)

* **Rôle Métier** : Agent de santé polyvalent dans les centres de santé ou hôpitaux secondaires où un même opérateur prend en charge plusieurs activités (lits et dépôts de sang).
* **Interface Utilisée** : **Web Dashboard (React)**.
* **Critère d'attribution** : Rôle historique conservé pour la compatibilité avec les comptes existants.
* **Périmètre d'action** : **Son établissement de rattachement**.

#### Responsabilités & Accès Métier :
* **Cumul Opérationnel Local** : Possède les prérogatives conjointes de `bed_manager` (gestion des lits et admissions de son hôpital) et de `blood_manager` (stocks de sang et demandes de son hôpital).
* **Régulation Locale des Ambulances** : Vue restreinte aux véhicules de son hôpital et aux missions de sa région.

---

### Profil 6 : Ambulancier / Chauffeur (`ambulance_driver`)

* **Rôle Métier** : Conducteur d'ambulance, secouriste urgentiste sur le terrain.
* **Interface Utilisée** : **Application Mobile Jappo Dundu** (ou tablette embarquée dans l'ambulance).
* **Critère d'attribution** : Utilisateur associé au rôle `ambulance_driver`.
* **Périmètre d'action** : **Ses missions assignées et son véhicule**.

#### Responsabilités & Accès Métier :
* **Feuille de Route Mobile** : Réception immédiate de la notification de mission avec géolocalisation de la victime, motif médical et hôpital de destination désigné.
* **Avancement du Statut de Mission** :
  - *En route vers le patient* (`on_the_way`)
  - *Arrivé sur les lieux de détresse* (`on_scene`)
  - *Transport du patient vers l'hôpital* (`transporting`)
  - *Mission terminée et patient admis* (`completed`)
* **Télémétrie GPS en Direct** : Émission régulière de la position géographique du véhicule vers le backend pour l'affichage en temps réel au poste de régulation.
* **Consultation des Lits d'Urgence** : Possibilité de rechercher les lits d'urgence les plus proches en lecture seule en cas de dégradation brutale de l'état du patient imposant un déroutement.

#### Endpoints API Principaux :
* `GET /api/ambulances/missions/my-missions/` — Consultation de ses missions en cours
* `POST /api/ambulances/missions/<id>/status/` — Changement d'état de la mission
* `POST /api/ambulances/vehicles/<id>/location/` — Envoi de la position GPS en temps réel
* `GET /api/lits/capacities/nearest/` — Recherche de lits d'urgence libres à proximité

---

### Profil 7 : Citoyen Donneur de Sang (`donor`)

* **Rôle Métier** : Citoyen sénégalais bénévole prêt à donner son sang pour sauver des vies lors des urgences vitales.
* **Interface Utilisée** : **Application Mobile Citoyenne Jappo Dundu** (iOS & Android via Expo / React Native).
* **Critère d'attribution** : Compte citoyen créé automatiquement lors de la complétion du profil donneur (`PUT /api/sang/donors/me/`).
* **Périmètre d'action** : **Strictement limité à ses propres données personnelles** et aux alertes d'urgence compatibles dans son rayon géographique.

#### Responsabilités & Accès Métier :
* **Profil Médical & Carte Numérique de Donneur** :
  - Renseignement du groupe sanguin (ex: O+, A-, B+, O-), sexe, date de naissance et disponibilité pour don.
  - Carte numérique de donneur sécurisée contenant un QR code et un code unique de fidélité (`JD-XXXX-XXXX`).
* **Réception d'Alertes de Proximité Géolocalisées** :
  - Notification push dès qu'un hôpital ou centre de transfusion proche (< 15-30 km) publie un besoin urgent pour son groupe sanguin compatible.
  - Possibilité de répondre directement depuis l'application : `accepté`, `décliné`, `se désister`.
* **Gamification & Engagement Citoyen** :
  - Capital de points civiques : **+100 points** par don confirmé, **+50 points** bonus en cas d'extrême urgence vitale, points de badges.
  - Niveaux de fidélisation progressifs : de *Citoyen Solidaire* (Niveau 1) jusqu'à *Légende Jappo Dundu* (Niveau 5).
  - Déblocage de badges de reconnaissance officiels (*Premier Pas*, *Donneur Régulier*, *Sauveur Universel O-*, etc.).
* **Historique Personnel** : Consultation de ses dons passés et respect du délai biologique obligatoire entre deux dons (90 jours pour les hommes, 120 jours pour les femmes).

#### Endpoints API Principaux :
* `GET / PUT / PATCH /api/sang/donors/me/` — Consultation et mise à jour de son profil donneur
* `GET /api/sang/donors/me/gamification/` — Consultation de ses points, niveau et badges
* `GET /api/sang/badges/` — Catalogue des badges civiques disponibles
* `GET /api/sang/donors/me/donations/` — Historique médical de ses dons
* `GET /api/sang/requests/nearby/` — Liste des alertes de sang urgentes compatibles à proximité
* `POST /api/sang/requests/<id>/respond/` — Accepter ou décliner une demande urgente

---

### Profil 8 : Connecteur Automatisé SIH (`sih_machine`)

* **Rôle Métier** : Progiciel hospitalier externe du Système d'Information Hospitalier (OpenMRS, GNU Health, DHIS2, ERP interne ou logiciel de laboratoire LIS).
* **Interface Utilisée** : **API REST M2M** (Machine-to-Machine — aucun écran humain).
* **Critère d'attribution** : Authentification par **clé d'API secrète d'établissement** transmise via l'en-tête HTTP `X-Hospital-API-Key`.
* **Périmètre d'action** : **Son établissement uniquement**, strictement cantonné aux domaines activés sur la clé (`allow_beds` pour les lits, `allow_blood` pour le sang).

#### Responsabilités & Accès Métier :
* **Synchronisation en Masse des Lits (Batch)** : Envoi automatisé à intervalle régulier de l'état de l'ensemble des services de l'hôpital (lits installés, lits occupés).
* **Événements ADT en Temps Réel** : Notification unitaire et instantanée lors de chaque admission (`ADMISSION`), transfert (`TRANSFER`) ou sortie (`DISCHARGE`) enregistrée dans le dossier patient informatisé.
* **Synchronisation des Stocks de Sang (Batch)** : Mise à jour automatique des quantités de poches disponibles issues du système de gestion du laboratoire.
* **Traçabilité & Supervision** : Enregistrement de chaque échange dans les journaux d'audit de synchronisation (`HospitalSyncLog`), avec temps de traitement et statut HTTP.

#### Endpoints API Principaux :
* `GET /api/sih/ping/` — Diagnostic de connectivité et validité de la clé
* `GET /api/sih/status/` — Synthèse des ressources déclarées de l'établissement
* `POST /api/sih/beds/sync/` — Synchronisation en masse des lits (clé `allow_beds`)
* `POST /api/sih/beds/event/` — Événement unitaire ADT d'admission / sortie (clé `allow_beds`)
* `POST /api/sih/stocks/sync/` — Synchronisation automatique des stocks de sang (clé `allow_blood`)
* `GET /api/sih/logs/` — Consultation des logs d'audit des synchronisations

---

## 📊 4. Matrice Croisée des Droits d'Accès (CRUD)

| Ressource / Module Métier | `admin` | `bed_manager` | `blood_manager` | `ambulance_manager` | `hospital_staff` | `ambulance_driver` | `donor` | Clé SIH M2M |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Capacités en Lits & Services** | L + É *(Tous)* | L *(Tous)*<br>É *(Son hôpital)* | ❌ 403 | L *(Tous)* | L *(Tous)*<br>É *(Son hôpital)* | L *(Tous)* | ❌ 403 | L + É *(Son hôpital - Clé lits)* |
| **Admissions & Sorties (ADT)** | L + É *(Tous)* | L + É *(Son hôpital)* | ❌ 403 | ❌ 403 | L + É *(Son hôpital)* | ❌ 403 | ❌ 403 | É *(Son hôpital - Clé lits)* |
| **Demandes Urgentes de Sang** | L + É *(Tous)* | ❌ 403 | L + É *(Son hôpital / Région CNTS)* | ❌ 403 | L + É *(Son hôpital)* | ❌ 403 | L *(Proches compatibles)* | ❌ 403 |
| **Validation / Confirmation de Don** | L + É *(Tous)* | ❌ 403 | L + É *(Son hôpital / Région CNTS)* | ❌ 403 | L + É *(Son hôpital)* | ❌ 403 | ❌ 403 | ❌ 403 |
| **Profil & Carte de Donneur** | L + É *(Tous)* | ❌ 403 | L *(Recherche carte/tél)* | ❌ 403 | L *(Recherche carte/tél)* | ❌ 403 | L + É *(Ses données)* | ❌ 403 |
| **Gamification (Badges & Points)** | L *(Tous)* | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | L *(Ses données)* | ❌ 403 |
| **Stocks de Sang (Saisie & Ajustement)**| L + É *(Tous)* | ❌ 403 | L + É *(Son hôpital / Région CNTS)* | 403 | L + É *(Son hôpital)* | ❌ 403 | ❌ 403 | L + É *(Son hôpital - Clé sang)* |
| **Prévisions ML de Pénurie** | L + É *(Tous)* | ❌ 403 | L *(Son hôpital / Région CNTS)* | ❌ 403 | L *(Son hôpital)* | ❌ 403 | ❌ 403 | ❌ 403 |
| **Flotte d'Ambulances (Véhicules)** | L + É *(Tous)* | ❌ 403 | ❌ 403 | L + É *(Son service)* | L *(Son hôpital)* | L *(Son véhicule)* | ❌ 403 | ❌ 403 |
| **Missions d'Urgence SAMU** | L + É *(Tous)* | L *(Vers son hôpital)* | ❌ 403 | L + É *(Sa région)* | L + É *(Sa région)* | L + É *(Sa mission assignée)* | ❌ 403 | ❌ 403 |
| **Comptes & Établissements de Santé**| L + É *(Tous)* | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| **Clés API SIH (Création / Révocation)**| L + É *(Toutes)*| L + É *(Son hôpital - Lits)*| L + É *(Son hôpital - Sang)*| ❌ 403 | L + É *(Son hôpital)*| ❌ 403 | ❌ 403 | ❌ 403 |

> **Légende** :  
> - **L** = Consultation en lecture  
> - **É** = Création, modification ou action d'écriture  
> - **❌ 403** = Refus systématique avec code d'erreur HTTP 403 Forbidden

---

## 🔑 5. Mécanismes d'Authentification & Sécurité

### 1. Utilisateurs Humains (Web & Mobile) — Jetons JWT
- **Connexion** : `POST /api/auth/token/`
- **Identifiant accepté** : `username` ou **numéro de téléphone sénégalais** (ex: `+221771112233` ou `771112233`).
- **En-tête requis** sur chaque appel protégé :  
  `Authorization: Bearer <access_token>`
- **Durées de validité** : Access Token = **30 minutes**, Refresh Token = **7 jours** avec rotation systématique.
- **Révocation d'accès** : Toute modification administrative d'un compte (changement de rôle, modification d'établissement, désactivation) révoque instantanément ses refresh tokens et coupe ses WebSockets actifs (code 4401).

### 2. Connecteurs Progiciels (SIH Machine) — Clés d'API
- **En-tête requis** sur chaque appel :  
  `X-Hospital-API-Key: jd_sih_xxxxxxxxxxxxxxxxxxxx`
- **Sécurité cryptographique** : Seul le hachage **SHA-256** de la clé est conservé en base de données. La clé en clair n'est affichée qu'une seule et unique fois lors de sa génération.
- **Protection anti-déni de service** : Double limitation de débit par clé (`THROTTLE_SIH_BURST_RATE` et `THROTTLE_SIH_SUSTAINED_RATE`).

---

## 🧪 6. Comptes de Test & Démonstration

Pour tester immédiatement les différents profils dans l'environnement de développement, la base de données intègre un jeu de comptes prédéfinis via la commande de seed :

```bash
cd backend
python seed_demo_data.py
```

> **Mot de passe commun de test** : `Password123!`

| Rôle Métier | Identifiant (`username`) | Téléphone | Établissement de Rattachement | Interface Recommandée |
| :--- | :--- | :--- | :--- | :---: |
| **Administrateur Général** | `admin` | `+221770000001` | *National (Sans restriction)* | Web Dashboard / Admin |
| **Gestionnaire des Lits** | `dr.diop` | `+221771112233` | Hôpital Principal de Dakar | Web Dashboard (Lits) |
| **Gestionnaire du Sang** | `cnts.dakar` | `+221773334455` | Centre National de Transfusion Sanguine | Web Dashboard (Sang) |
| **Régulateur SAMU** | `samu.regulation` | `+221774445566` | SAMU National 15 | Web Dashboard (SAMU) |
| **Ambulancier / Chauffeur** | `samu.driver` | `+221775556677` | SAMU National 15 | Mobile Expo / Tablettes |
| **Citoyen Donneur de Sang** | `awa.ndiaye` | `+221778889900` | *Citoyen (Donneur O+, Dakar)* | Mobile Expo (Donneur) |

---

*Document de référence généré pour le projet de fin d'études Jappo Dundu — Fait à Dakar.*
