# 🏥 Module SIH - Interopérabilité Hospitalière (Jappo Dundu)

Ce module fournit une **interface machine-to-machine (M2M)** sécurisée permettant aux progiciels hospitaliers externes (ex: **OpenMRS**, **GNU Health**, **DHIS2**, ERP internes) de synchroniser automatiquement leurs données opérationnelles avec la plateforme nationale Jappo Dundu, sans double saisie manuelle.

---

## 🔐 1. Authentification

Chaque établissement de santé dispose d'une ou plusieurs clés d'API, générées par l'administrateur général ou par les administrateurs des lits / du sang de l'établissement (voir E). Les flux `/api/sih/` n'acceptent que la clé (pas de JWT).

Chaque clé porte les domaines qu'elle peut synchroniser : `allow_beds` (lits) et `allow_blood` (stocks de sang) ; un appel hors domaine renvoie 403. Seule une empreinte SHA-256 de la clé est stockée. Le débit est limité par clé (`THROTTLE_SIH_BURST_RATE`, `THROTTLE_SIH_SUSTAINED_RATE`).

L'authentification s'effectue en passant la clé dans l'en-tête HTTP :
```http
X-Hospital-API-Key: jd_sih_VOTRE_CLE_SECRETE
```
ou
```http
Authorization: Api-Key jd_sih_VOTRE_CLE_SECRETE
```

---

## 📡 2. Endpoints Disponibles

### A. Vivacité & Connectivité
* **`GET /api/sih/ping/`**
  * Vérifie la validité de la clé API et renvoie l'établissement associé.
  * Réponse :
    ```json
    {
      "status": "connected",
      "timestamp": "2026-10-10T01:00:00Z",
      "facility": {
        "id": 1,
        "name": "Hôpital Principal de Dakar",
        "region": "dakar",
        "city": "Dakar",
        "facility_type": "hospital"
      },
      "auth_method": "api_key",
      "api_key_name": "Connecteur OpenMRS"
    }
    ```

* **`GET /api/sih/status/`**
  * Retourne la synthèse globale de l'établissement : nombre total de lits, taux d'occupation, répartition par service et dernière synchronisation.

---

### B. Lits & Capacités Hospitalières

* **`GET /api/sih/beds/status/`**
  * État actuel de tous les services de l'établissement (total, occupés, disponibles, taux d'occupation).

* **`POST /api/sih/beds/sync/`** (Synchronisation par lot)
  * Met à jour ou initialise les capacités par service. Déclenche immédiatement les alertes WebSockets (ex: saturation ou rétablissement d'un service critique).
  * Exemple de requête :
    ```json
    {
      "services": [
        {
          "category": "emergency",
          "total_beds": 40,
          "occupied_beds": 28
        },
        {
          "category": "intensive_care",
          "total_beds": 15,
          "occupied_beds": 15
        }
      ]
    }
    ```

* **`POST /api/sih/beds/event/`** (Flux ADT unitaire en temps réel)
  * Envoie une admission ou une sortie de patient en temps réel.
  * Exemple de requête :
    ```json
    {
      "category": "emergency",
      "action": "admit",
      "delta": 1,
      "patient_ref": "IP-2026-8841"
    }
    ```
  * En cas de saturation (`occupied_beds >= total_beds`), retourne une erreur `409 Conflict`.

---

### C. Stocks Sanguins

* **`GET /api/sih/stocks/status/`**
  * Liste des derniers niveaux de stock enregistrés pour cet établissement.

* **`POST /api/sih/stocks/sync/`** (Synchronisation du stock de sang)
  * Injecte les niveaux de stock quotidiens par groupe sanguin.
  * Exemple de requête :
    ```json
    {
      "date": "2026-10-10",
      "stocks": [
        {
          "blood_group": "O+",
          "units_available": 35,
          "units_donated": 8,
          "units_used": 4,
          "units_expired": 0
        },
        {
          "blood_group": "AB-",
          "units_available": 3,
          "units_donated": 0,
          "units_used": 1,
          "units_expired": 0
        }
      ]
    }
    ```

---

### D. Audit & Logs d'Interopérabilité
* **`GET /api/sih/logs/`**
  * Historique des 100 dernières requêtes de synchronisation (statut, éléments traités, temps d'exécution en ms, IP source).

---

### E. Gestion des Clés API
Réservé (JWT) à `admin` (tous établissements, `facility_id` obligatoire), `hospital_staff`, `bed_manager` et `blood_manager` (leur établissement). Les autres rôles reçoivent 403.

* **`GET /api/sih/keys/`** : Liste des clés de l'établissement (préfixe `key_prefix` seulement, jamais la clé). Un administrateur des lits ne voit pas les clés qui touchent au sang, et inversement.
* **`POST /api/sih/keys/`** : Création d'une nouvelle clé (`{"name": "Système Laboratoire", "allow_beds": false, "allow_blood": true}`). Par défaut, la clé reçoit les domaines que son créateur administre ; demander un autre domaine renvoie 403. **La réponse contient la clé en clair (`key`) : c'est la seule fois où elle est lisible.**
* **`DELETE /api/sih/keys/<id>/`** : Révocation douce (désactivation).
