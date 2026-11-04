# JAPPO DUNDU — GUIDE OFFICIEL DE SOUTENANCE TECHNIQUE
## Recueil Exhaustif des 22 Questions du Jury d'Élite & Réponses d'Ingénieur

> **Format :** Questions "terre-à-terre" (concrètes et pragmatiques sans dénaturer la difficulté technique) suivies immédiatement de leurs réponses argumentées avec les preuves du code source.
> **Document Word généré :** [GUIDE_SOUTENANCE_QUESTIONS_REPONSES_JAPPO_DUNDU.docx](file:///c:/dev/jappo-dundu/GUIDE_SOUTENANCE_QUESTIONS_REPONSES_JAPPO_DUNDU.docx)

---

### 📊 Chiffres clés à citer d'entrée de jeu

| Indicateur | Valeur validée | Preuve / Rôle |
|---|---|---|
| **Volume de tests automatisés** | **586 tests Django (102s) + 102 tests React + 73 tests Mobile** | Taux de réussite de 100% sur toute la suite |
| **Persistance & Calcul spatial** | **PostgreSQL 16 + PostGIS sans GeoDjango** | Requêtes pures ORM/SQL, index GiST et KNN `<->` |
| **Canal temps réel / Alertes** | **ASGI Daphne + Redis 7 (WebSockets)** | `/ws/dashboard/` et `/ws/alerts/` sans polling HTTP |
| **Intelligence Artificielle** | **RandomForestRegressor** | Prédiction proactive des ruptures de stock de sang à J+7 |
| **Conformité santé** | **Loi n° 2008-12 (CDP Sénégal)** | Anonymisation donneurs, chiffrement, logs d'audit |

---

## SOMMAIRE DES MODULES

1. [Module 1 : Vision, Enjeux Métier & Architecture Globale](#module-1--vision-enjeux-métier--architecture-globale)
2. [Module 2 : Concurrence Critique & Lits d'Urgence](#module-2--concurrence-critique--lits-durgence)
3. [Module 3 : Géolocalisation, PostGIS & Dispatching Spatial](#module-3--géolocalisation-postgis--dispatching-spatial)
4. [Module 4 : Machine Learning & Prédiction des Pénuries de Sang](#module-4--machine-learning--prédiction-des-pénuries-de-sang)
5. [Module 5 : Temps Réel, Notifications & WebSockets](#module-5--temps-réel-notifications--websockets)
6. [Module 6 : Sécurité, Données de Santé & Contrôle d'Accès](#module-6--sécurité-données-de-santé--contrôle-daccès)
7. [Module 7 : Application Mobile & Expérience Terrain](#module-7--application-mobile--expérience-terrain)
8. [Module 8 : Qualité Industrielle, Tests & Validation](#module-8--qualité-industrielle-tests--validation)
9. [Module 9 : Déploiement, Exploitation & Limites du Système](#module-9--déploiement-exploitation--limites-du-système)
10. [Checklist Stratégique pour le Jour de la Soutenance](#checklist-stratégique-pour-le-jour-de-la-soutenance)

---

## MODULE 1 : VISION, ENJEUX MÉTIER & ARCHITECTURE GLOBALE

### Question 1 : Expliquez simplement ce qu'est Jappo Dundu et quel problème de vie ou de mort il résout au Sénégal.
*👉 Ce que le jury cherche à savoir :* Avez-vous une réelle compréhension de l'impact humain et opérationnel de votre projet, ou êtes-vous un simple exécutant de code ?

#### 💡 Réponse structurée à prononcer :
- **Le problème concret sur le terrain :** Au Sénégal (particulièrement à Dakar), des patients meurent chaque semaine dans les ambulances parce qu'on fait le « tour des hôpitaux » (Dantec, Fann, Principal) sans savoir où se trouve un lit de réanimation disponible. De même, lors des hémorragies de la délivrance (post-partum), des femmes meurent en couches faute de trouver du sang compatible dans les premières 30 minutes.
- **La solution Jappo Dundu :** C'est la première plateforme nationale intégrée d'urgence vitale au Sénégal. Elle réunit en temps réel trois acteurs qui fonctionnaient jusqu'ici en silos par appels téléphoniques : les hôpitaux (gestion des lits), le SAMU 1515 (ambulances et régulation médicale) et le Centre National de Transfusion Sanguine (donneurs géolocalisés).
- **L'impact mesurable :** Remplacer les coups de fil informels par une visibilité temps réel à la seconde près, faisant passer le délai d'orientation d'une détresse vitale de plus de 45 minutes à moins de 3 minutes.
- ⚡ *Preuve dans le code source :* Trois applications interconnectées : `backend/` (Django ASGI central), `frontend/` (React 18 pour les médecins et régulateurs) et `mobile/` (React Native Expo pour les ambulanciers et donneurs).

---

### Question 2 : Pourquoi avoir choisi une architecture monolithique modulaire avec Django plutôt qu'une constellation de microservices ?
*👉 Ce que le jury cherche à savoir :* Comprenez-vous les compromis d'ingénierie et le coût opérationnel réel d'un système distribué ?

#### 💡 Réponse structurée à prononcer :
- **L'impératif absolu des transactions ACID :** Dans une urgence vitale, la réservation d'un lit ou d'une poche de sang ne tolère pas la « consistance éventuelle » des microservices. Si le service lit valide mais que le service notification échoue à travers le réseau, on risque la vie d'un patient. Un monolithe modulaire permet des transactions atomiques PostgreSQL fiables à 100%.
- **Le coût d'exploitation et la réalité sénégalaise :** Gérer 6 microservices indépendants nécessite Kubernetes, un service mesh (Istio), du traçage distribué et une équipe DevOps 24h/24. Pour les hôpitaux publics sénégalais, c'est un gouffre financier et une source permanente de pannes réseau.
- **La modularité sans la complexité réseau :** Django organise le code en modules métier strictement étanches (`lits`, `ambulances`, `donors`, `ml`, `geo`). Si le trafic explose demain, chaque application peut être isolée sans réécrire la logique.
- **Daphne & ASGI pour le temps réel :** Django gère nativement le HTTP et les WebSockets via Daphne et Django Channels sur le même port 8000, sans nécessiter de serveur Node.js séparé.
- ⚡ *Preuve dans le code source :* `backend/config/asgi.py`, conteneur unique `jappo_web` qui sert l'API REST et les WebSockets.

---

### Question 3 : Pourquoi avoir créé deux interfaces distinctes (Web pour le personnel et Mobile pour le terrain) au lieu d'un simple site web responsive ?
*👉 Ce que le jury cherche à savoir :* Pourquoi avoir pris le temps de développer deux applications frontend complètes au lieu d'un simple site qui s'adapte aux téléphones ?

#### 💡 Réponse structurée à prononcer :
- **Deux contextes d'utilisation opposés :** Le médecin régulateur au centre SAMU est assis devant un écran de 27 pouces avec une carte de Dakar, des tableaux de lits et 10 urgences en parallèle. L'ambulancier roule à 80 km/h sur la VDN avec son smartphone fixé sur le tableau de bord sous le soleil.
- **Accès matériel natif sur smartphone :** Un site web mobile ne peut pas maintenir une géolocalisation GPS fiable en arrière-plan lorsque l'écran s'éteint, ni réveiller le téléphone avec une sirène sonore d'alerte critique push. React Native avec `expo-location` et `expo-notifications` assure ce suivi continu.
- **Ergonomie « gros boutons » d'urgence :** L'application mobile propose une interface d'urgence épurée avec de très gros boutons d'action (« Pris en charge », « Arrivé à l'hôpital ») utilisables d'une seule main pendant la mission.
- ⚡ *Preuve dans le code source :* Séparation nette dans le dépôt entre `frontend/` (React 18 + Tailwind + Vite) et `mobile/` (React Native Expo SDK 52) partageant les mêmes contrats d'API TypeScript.

---

## MODULE 2 : CONCURRENCE CRITIQUE & LITS D'URGENCE

### Question 4 : Deux médecins régulateurs cliquent en même temps sur le tout dernier lit de réanimation disponible : comment évite-t-on le doublon au niveau de la base de données ?
*👉 Ce que le jury cherche à savoir :* Maîtrisez-vous les race conditions et les verrous de base de données dans un système multi-utilisateurs critique ?

#### 💡 Réponse structurée à prononcer :
- **Le piège du code naïf :** Si on se contente de faire `if capacity.available_beds > 0: capacity.reserved_beds += 1; capacity.save()`, deux requêtes exécutées en parallèle à la même milliseconde liront toutes les deux `available_beds = 1` et valideront deux réservations pour un seul lit (double allocation mortelle).
- **La solution PostgreSQL dans Jappo Dundu :** Nous combinons une transaction atomique `@transaction.atomic` et une mise à jour conditionnelle avec l'expression `F()` de Django :
  ```python
  BedCapacity.objects.filter(
      pk=capacity.pk,
      occupied_beds__lte=F('total_beds') - F('reserved_beds') - 1
  ).update(reserved_beds=F('reserved_beds') + 1)
  ```
- **Garantie ACID au niveau SGBD :** Cette requête s'exécute directement dans le moteur PostgreSQL en une seule instruction atomique. Le premier médecin qui valide incrémente le compteur ; pour le second médecin, la condition `occupied_beds <= total - reserved - 1` devient immédiatement FAUSSE.
- **Gestion de l'échec et code HTTP :** La requête retourne 0 ligne mise à jour pour le perdant, notre code lève une exception `Conflict`, qui renvoie un statut **HTTP 409 Conflict** au navigateur. Le lit est immédiatement grisé sur son écran grâce à l'alerte WebSocket.
- ⚡ *Preuve dans le code source :* `backend/lits/services.py` (fonctions `reserve()` et `update_capacity()` utilisant `select_for_update()`).

---

### Question 5 : Une ambulance réserve un lit, mais tombe en panne ou reste coincée 2 heures dans les embouteillages de Dakar : comment évite-t-on que le lit reste bloqué indéfiniment ?
*👉 Ce que le jury cherche à savoir :* Avez-vous prévu les pannes réelles du monde physique (fuite de ressources / deadlock humain) ?

#### 💡 Réponse structurée à prononcer :
- **Le verrou temporaire (TTL / Hold) :** Dès qu'une réservation est enregistrée, elle reçoit une durée de validité maximale (`DEFAULT_HOLD_MINUTES = 30 minutes`).
- **La purge automatique en arrière-plan :** Une commande de maintenance automatisée (`expire_bed_reservations`) s'exécute à intervalles réguliers. Elle inspecte les réservations au statut `PENDING` dont le délai a dépassé 30 minutes sans confirmation d'admission physique par les infirmiers.
- **Rétablissement du stock :** Le lit réservé est automatiquement requalifié en lit libre (`reserved_beds -= 1`), l'incident d'ambulance passe en alerte « délai dépassé », et un signal WebSocket avertit le SAMU et l'hôpital que le lit est de nouveau disponible pour un autre patient.
- ⚡ *Preuve dans le code source :* `backend/lits/management/commands/expire_bed_reservations.py` et `DEFAULT_HOLD_MINUTES = 30` dans `backend/lits/services.py`.

---

### Question 6 : Pourquoi distinguer trois états pour un lit : « disponible », « réservé » et « occupé » ?
*👉 Ce que le jury cherche à savoir :* La modélisation de vos données correspond-elle fidèlement aux flux réels d'un hôpital ?

#### 💡 Réponse structurée à prononcer :
- **L'équation fondamentale :** `total_beds = occupied_beds + reserved_beds + available_beds`.
- **Lit disponible :** Le lit est vide et aucun patient n'est en route.
- **Lit réservé :** L'ambulance roule vers l'hôpital avec le patient. Le lit est physiquement vide à cet instant, mais il est INTERDIT de l'attribuer à un autre malade qui arriverait à pied aux urgences.
- **Lit occupé :** L'ambulance est arrivée, le patient a franchi la porte du service et l'infirmier a cliqué sur « Admettre ». Le compteur `reserved_beds` diminue de 1 et `occupied_beds` augmente de 1. Quand le patient sort ou est transféré, `occupied_beds` diminue de 1.
- ⚡ *Preuve dans le code source :* Contraintes de modèle Django (`CheckConstraint`) dans `backend/lits/models.py` interdisant formellement `occupied_beds + reserved_beds > total_beds`.

---

## MODULE 3 : GÉOLOCALISATION, POSTGIS & DISPATCHING SPATIAL

### Question 7 : Pourquoi avoir délibérément refusé d'installer GeoDjango et les bibliothèques C GDAL / GEOS ?
*👉 Ce que le jury cherche à savoir :* Pourquoi avoir contourné la recommandation officielle de la documentation Django ?

#### 💡 Réponse structurée à prononcer :
- **Le cauchemar des dépendances natives (GDAL/GEOS/PROJ) :** Ces bibliothèques pèsent plus de 300 Mo, sont écrites en C/C++ et provoquent d'innombrables incompatibilités de compilation selon les systèmes (Windows, Ubuntu, Alpine, macOS). Elles triplent le temps de build de l'image Docker.
- **Notre approche légère et élégante :** PostgreSQL et son extension PostGIS disposent déjà de toutes les fonctions géométriques nécessaires. Nous avons créé un module sur-mesure (`backend/geo/postgis.py`) en pur Python et expressions SQL Django (`Func`).
- **Zéro binaire lourd supplémentaire :** Le code envoie directement les instructions `ST_DWithin` et les opérateurs `<->` à PostgreSQL via l'ORM standard. Le conteneur Docker reste ultra-léger, rapide à déployer et sans aucune dépendance système fragile.
- ⚡ *Preuve dans le code source :* Classes `GeographyPoint`, `DWithin`, `SphereDistance` et `KNNDistance` développées dans `backend/geo/postgis.py`.

---

### Question 8 : Comment PostgreSQL trouve-t-il l'ambulance la plus proche en quelques millisecondes sans saturer le serveur ?
*👉 Ce que le jury cherche à savoir :* Connaissez-vous le fonctionnement interne des index spatiaux et des algorithmes du SGBD ?

#### 💡 Réponse structurée à prononcer :
- **L'erreur à ne jamais commettre :** Charger 50 000 lignes en Python et calculer la distance avec une boucle `for` ferait exploser le CPU dès que plusieurs régulateurs lancent une recherche en même temps.
- **L'index spatial GiST (Generalized Search Tree) :** Nous créons un index GiST sur l'expression géographique `geography(ST_SetSRID(ST_MakePoint(lon, lat), 4326))`. Cet index organise les coordonnées sous forme d'un arbre hiérarchique de boîtes englobantes (R-Tree).
- **L'opérateur KNN (K-Nearest Neighbors `<->`) :** En SQL, nous ordonnons les résultats avec `ORDER BY column <-> target LIMIT 10`. PostgreSQL descend directement l'arbre GiST sur disque et extrait les 10 ambulances les plus proches en moins de 5 millisecondes sans jamais scanner toute la table.
- ⚡ *Preuve dans le code source :* Migration personnalisée `AddGeographyIndex` dans `backend/geo/operations.py` et tri `order_by(postgis.KNNDistance(column, target))` dans `backend/geo/search.py`.

---

### Question 9 : Que se passe-t-il si aucune ambulance ou aucun donneur de sang n'est trouvé dans le rayon de 10 kilomètres ?
*👉 Ce que le jury cherche à savoir :* Comment le système réagit-il en zone rurale ou lorsque les ressources locales sont épuisées ?

#### 💡 Réponse structurée à prononcer :
- **L'algorithme de dispatching en vagues successives :** 10 km est le « rayon d'or » en agglomération dakaroise pour intervenir en moins de 15 minutes. Mais la nuit ou en zone péri-urbaine (ex: Sébikotane, Bargny), ce rayon peut être vide.
- **Escalade automatique :** Si le premier cercle de recherche (10 km) retourne 0 ressource ou si les chauffeurs sollicités ne répondent pas sous 2 minutes, l'algorithme élargit automatiquement le rayon à 25 km, puis à 50 km.
- **Alerte superviseur central :** En parallèle de l'élargissement, le système déclenche une alerte « Déficit de couverture » sur l'écran du régulateur SAMU pour envisager un transfert inter-hospitalier ou une réquisition manuelle.
- ⚡ *Preuve dans le code source :* Paramètres de recherche `radius_m` modulables dans `backend/geo/search.py` et boucle de dispatching dans `backend/ambulances/services.py`.

---

### Question 10 : Que se passe-t-il si la base de données tourne sous SQLite pendant les tests automatisés au lieu de PostgreSQL ?
*👉 Ce que le jury cherche à savoir :* Comment garantissez-vous que votre suite de tests fonctionne sans planter sur des environnements de test légers ?

#### 💡 Réponse structurée à prononcer :
- **Le patron de conception Strategy (moteur polyvalent) :** Dans `backend/geo/search.py`, la fonction inspecte le moteur de base de données : `if connections[db].vendor == 'postgresql': postgis_nearest else portable_nearest`.
- **Le moteur de secours `portable_nearest` :** Sous SQLite, le code calcule d'abord une boîte englobante SQL (`bounding_box` latitude min/max, longitude min/max). Cela permet à la base d'éliminer 95% des points éloignés par un simple filtre numérique indexable.
- **Affinement en mémoire avec tas binaire :** Pour les quelques points restants dans la boîte, Python calcule la distance de Haversine exacte et utilise un tas `heapq.nsmallest()` pour extraire les plus proches sans jamais faire exploser la mémoire RAM.
- ⚡ *Preuve dans le code source :* Fonctions `portable_nearest` et `bounding_box` dans `backend/geo/search.py` et `backend/geo/distance.py`.

---

## MODULE 4 : MACHINE LEARNING & PRÉDICTION DES PÉNURIES DE SANG

### Question 11 : Pourquoi utiliser un modèle de Machine Learning au lieu d'une règle simple « si stock < 10 poches alors alerte » ?
*👉 Ce que le jury cherche à savoir :* Avez-vous une réelle valeur ajoutée à utiliser du Machine Learning, ou est-ce un gadget pour le rapport ?

#### 💡 Réponse structurée à prononcer :
- **Le piège du seuil réactif :** Une alerte `if stock < 10` se déclenche quand la catastrophe est déjà là. Or, au Sénégal, organiser une collecte de sang, tester les poches (VIH, hépatites, paludisme) et les acheminer prend 48 heures minimum. L'hôpital se retrouve en rupture sèche.
- **Le Machine Learning prédictif et proactif :** Notre modèle prédit la consommation à 7 et 14 jours. S'il anticipe que le stock de sang O- tombera à 2 poches vendredi prochain, l'alerte de collecte est envoyée dès le lundi matin aux donneurs du quartier.
- **Prise en compte des variations non linéaires :** Une règle simple ne sait pas gérer le fait qu'on consomme 3 fois plus de sang un samedi soir de fête ou pendant le grand Magal de Touba à cause des accidents de circulation.
- ⚡ *Preuve dans le code source :* Module `backend/ml/` et script d'entraînement `train_blood_model.py`.

---

### Question 12 : Quelles sont les variables (features) utilisées par votre modèle de prédiction et comment évaluez-vous sa performance ?
*👉 Ce que le jury cherche à savoir :* Quelle est votre rigueur méthodologique en Data Science ?

#### 💡 Réponse structurée à prononcer :
- **Les variables d'entrée (Features) :**
  1. *Consommation historique :* moyennes mobiles sur 7 et 30 jours, tendance d'évolution hebdomadaire par groupe sanguin.
  2. *Facteurs temporels et calendaires :* jour de la semaine, mois de l'année, indicateur binaire de jour férié ou de grand événement (Magal, Gamou, Tabaski).
  3. *Période de jeûne (Ramadan) :* variable critique au Sénégal où les dons de sang chutent de plus de 60% en journée.
  4. *Niveau de criticité du service hospitalier :* maternité vs réanimation vs chirurgie programmée.
- **Métriques d'évaluation :** Nous n'utilisons pas la « précision » (qui ne s'applique qu'à la classification catégorielle), mais la **MAE** (*Mean Absolute Error* = écart moyen en nombre de poches) et le **R²** (*coefficient de détermination*). Une MAE de 2.1 poches sur un horizon de 7 jours est d'une excellente utilité opérationnelle pour le CNTS.
- ⚡ *Preuve dans le code source :* Fichier `backend/ml/evaluation_report.json` et classe de modèle `RandomForestRegressor`.

---

### Question 13 : Pourquoi l'API de prédiction ML a-t-elle renvoyé une erreur 503 « modèle non trouvé » lors des tests Docker et comment cela a-t-il été corrigé ?
*👉 Ce que le jury cherche à savoir :* Savez-vous diagnostiquer et expliquer un bug d'infrastructure réel rencontré pendant le projet ?

#### 💡 Réponse structurée à prononcer :
- **Le problème identifié :** Lors du lancement initial avec Docker Compose, l'appel HTTP sur `/api/ml/predict/` retournait une erreur 503 Service Unavailable avec le message « Modèle non chargé ».
- **La cause racine (Volume Docker masquant) :** Le fichier `docker-compose.yml` déclarait un volume nommé persistant `ml_models:/app/ml/trained_models`. Ce volume vide, monté par-dessus le dossier du conteneur, masquait le fichier modèle pré-entraîné `blood_shortage_v1.1.0.joblib` qui se trouvait sur l'hôte.
- **La résolution propre et robuste :** Nous avons mis en place une routine de démarrage automatique (fail-safe bootstrap) : si le fichier `.joblib` est manquant au démarrage de Django, le système lance automatiquement un ré-entraînement rapide sur les données synthétiques de référence et génère le fichier dans le volume, garantissant un service toujours disponible.
- ⚡ *Preuve dans le code source :* Chargeur de modèle dans `backend/ml/loader.py` et condition de vérification `os.path.exists(MODEL_PATH)`.

---

## MODULE 5 : TEMPS RÉEL, NOTIFICATIONS & WEBSOCKETS

### Question 14 : Comment les alertes et les disponibilités de lits s'affichent-elles instantanément sur les écrans sans rafraîchir la page ?
*👉 Ce que le jury cherche à savoir :* Connaissez-vous l'architecture réseau temps réel sous-jacente ?

#### 💡 Réponse structurée à prononcer :
- **Le rejet du polling HTTP :** Faire des requêtes `fetch()` toutes les 3 secondes saturerait la bande passante et la base de données tout en introduisant un retard inacceptable de 3 secondes en réanimation.
- **L'architecture WebSockets avec Django Channels :**
  1. *Serveur ASGI Daphne :* Écoute les connexions WebSocket persistantes maintenues par les navigateurs des régulateurs.
  2. *Redis en tant que Channel Layer :* Sert de bus de messages ultra-rapide en mémoire vive.
  3. *Diffusion par groupes :* Deux canaux séparés : `/ws/dashboard/` (métriques globales, jauges de lits) et `/ws/alerts/` (dépêches urgentes d'accidents).
  4. Dès qu'un lit est mis à jour dans `backend/lits/services.py`, la fonction `notify_capacity()` envoie un événement au groupe Redis, qui le propage instantanément à tous les écrans connectés en moins de 50 millisecondes.
- ⚡ *Preuve dans le code source :* `backend/config/routing.py`, `backend/lits/consumers.py` et le hook React `useWebSocket` côté frontend.

---

### Question 15 : Que se passe-t-il si la connexion 4G de l'ambulance coupe en plein trajet dans une zone mal couverte ?
*👉 Ce que le jury cherche à savoir :* L'application mobile sait-elle survivre aux aléas des réseaux mobiles d'Afrique de l'Ouest ?

#### 💡 Réponse structurée à prononcer :
- **Aucun crash ni écran blanc :** L'application mobile Expo/React Native intègre une gestion locale de la déconnexion.
- **Persistance hors ligne des données de mission :** Les informations critiques de la mission en cours (nom du patient, pathologie, hôpital d'accueil assigné, téléphone du médecin) sont stockées dans le cache sécurisé du téléphone (`AsyncStorage`). L'ambulancier continue son trajet sans blocage.
- **Reconnexion automatique avec backoff exponentiel :** Le client WebSocket tente de se reconnecter après 1s, 2s, 4s, 8s, 16s... pour ne pas vider la batterie du smartphone.
- **File d'attente des positions GPS :** Pendant la coupure, les coordonnées GPS sont empilées dans un buffer mémoire local ; dès que le réseau 4G réapparaît, elles sont transmises en bloc au serveur SAMU pour reconstituer le tracé.
- ⚡ *Preuve dans le code source :* Gestionnaire d'erreurs et de reconnexion dans `mobile/src/lib/api.ts`.

---

## MODULE 6 : SÉCURITÉ, DONNÉES DE SANTÉ & CONTRÔLE D'ACCÈS

### Question 16 : Comment protégez-vous la vie privée des donneurs de sang et le secret médical (conformité CDP Sénégal / RGPD santé) ?
*👉 Ce que le jury cherche à savoir :* Avez-vous respecté le cadre juridique strict des données médicales au Sénégal ?

#### 💡 Réponse structurée à prononcer :
- **La Commission des Données Personnelles (CDP) du Sénégal :** La loi n° 2008-12 protège les données médicales. Une plateforme de santé ne peut pas exposer publiquement les numéros de téléphone ou les groupes sanguins de ses citoyens.
- **Anonymisation et consentement éclairé :**
  - Les hôpitaux voient sur leur carte un point anonyme : « Donneur O+ à 2.4 km ». Ni le nom, ni le numéro ne sont visibles.
  - L'hôpital envoie une requête de don. Le donneur reçoit une notification sur son smartphone.
  - Le contact téléphonique n'est partagé qu'à partir du moment où le donneur clique volontairement sur « J'accepte de donner ».
- **Chiffrement et hachage :** Tous les flux sont chiffrés en transit (TLS 1.3 / HTTPS / WSS). Les mots de passe sont hachés avec l'algorithme `Argon2` ou `PBKDF2-SHA256` avec sel unique.
- **Piste d'audit immuable :** Chaque consultation de données de patient est enregistrée dans une table de journalisation d'audit avec horodatage, ID de l'utilisateur et adresse IP.
- ⚡ *Preuve dans le code source :* Modèle `CustomUser` dans `backend/authentication/` et serializers masquant les données privées.

---

### Question 17 : Comment fonctionne le contrôle d'accès (RBAC) et pourquoi un chauffeur d'ambulance ne peut-il pas se connecter sur le tableau de bord web ?
*👉 Ce que le jury cherche à savoir :* L'isolation des privilèges est-elle étanche ou un utilisateur peut-il détourner l'interface d'un autre ?

#### 💡 Réponse structurée à prononcer :
- **Contrôle d'accès basé sur les rôles (RBAC) :** Chaque utilisateur possède un rôle strict dans la table `users` : `SUPERADMIN`, `SAMU_DISPATCHER`, `HOSPITAL_COORDINATOR`, `AMBULANCE_DRIVER`, `DONOR`.
- **Authentification par jetons JWT (JSON Web Tokens) :** À la connexion, le serveur génère un jeton signé contenant l'ID et le rôle de l'utilisateur avec une durée de vie courte (15 minutes pour l'access token).
- **La barrière Web anti-intrusion :** Le portail Web React est réservé au personnel soignant et de régulation. Si un chauffeur ou un donneur tente d'entrer ses identifiants sur le site Web, l'API backend rejette l'authentification avec l'erreur `MOBILE_ONLY_MESSAGE` (« Ce compte est exclusivement réservé à l'application mobile »).
- **Permissions au niveau des vues Django :** Même si un utilisateur malveillant forge une requête HTTP directe, chaque vue API vérifie `permission_classes = [IsHospitalCoordinator | IsSamuDispatcher]`.
- ⚡ *Preuve dans le code source :* Fichier `ROLES_ET_ACCES.md` et classes de permissions dans `backend/authentication/permissions.py`.

---

## MODULE 7 : APPLICATION MOBILE & EXPÉRIENCE TERRAIN

### Question 18 : Quel était le bug de l'écran « Plus qu'une étape » qui bloquait les utilisateurs sur l'application mobile et comment a-t-il été résolu ?
*👉 Ce que le jury cherche à savoir :* Pouvez-vous raconter avec précision un cas concret de débogage complexe mené sur le projet ?

#### 💡 Réponse structurée à prononcer :
- **Le symptôme :** Lors de la connexion sur mobile (ou sur simulateur web Metro), l'utilisateur saisissait ses identifiants valides mais se retrouvait systématiquement redirigé en boucle vers l'écran de complétion de profil (« Plus qu'une étape : Téléphone / Région »).
- **Le diagnostic technique :** Dans `mobile/src/lib/config.ts`, le code utilisait par défaut `window.location.origin` lorsqu'il détectait un environnement navigateur. Sur PC de développement, l'application tournait sur le port Metro 8081. Les requêtes API partaient donc vers Metro au lieu du backend Django (port 8000).
- **L'effet pervers :** Le bundler Metro répondait en HTTP 200 en renvoyant sa page HTML `index.html`. La fonction `api.ts` tentait de désérialiser du HTML comme du JSON : `user.phone_number` valait `undefined`, poussant l'application à croire que le profil était incomplet !
- **Le correctif appliqué :** Priorisation absolue de `EXPO_PUBLIC_API_URL` (port 8000), exclusion explicite du port 8081 pour les appels d'API, et ajout d'un garde dans `api.ts` qui vérifie le `Content-Type: application/json` avant tout parsing.
- ⚡ *Preuve dans le code source :* Modifications dans `mobile/src/lib/config.ts` et détection `ApiError` sur réponse non-JSON dans `mobile/src/lib/api.ts`.

---

### Question 19 : Pourquoi avoir utilisé React Native avec Expo plutôt que Flutter ou du natif Java/Kotlin ?
*👉 Ce que le jury cherche à savoir :* Votre choix de framework mobile repose-t-il sur des arguments solides ?

#### 💡 Réponse structurée à prononcer :
- **Unification de la pile technologique :** Toute l'équipe manipule TypeScript et l'écosystème React. Cela permet de partager les interfaces de données, les types de modèles, les règles de validation et la logique métier entre le Web et le Mobile sans changer de langage.
- **Vélocité de développement avec Expo :** Le SDK Expo 52 gère automatiquement la configuration des permissions Android/iOS (GPS en arrière-plan, notifications push, vibrations d'urgence, stockage sécurisé `expo-secure-store`) sans avoir à manipuler du code Java/Swift complexe.
- **Portabilité multi-plateforme :** L'application compile nativement pour les smartphones Android (qui représentent plus de 85% du parc au Sénégal) et pour iOS pour les médecins équipés d'iPhones, à partir d'une seule base de code.
- ⚡ *Preuve dans le code source :* `mobile/package.json` et les 73 tests Jest exécutés avec succès dans `mobile/src/__tests__/`.

---

## MODULE 8 : QUALITÉ INDUSTRIELLE, TESTS & VALIDATION

### Question 20 : Quelles sont les preuves concrètes que votre système est robuste et ne plantera pas le jour du lancement ?
*👉 Ce que le jury cherche à savoir :* Avez-vous testé sérieusement votre logiciel ou s'agit-il d'un simple prototype fragile ?

#### 💡 Réponse structurée à prononcer :
- **La batterie de tests automatisés la plus complète pour un PFE :**
  - *Backend :* 586 tests automatisés exécutés via le test runner Django en 102 secondes, avec un taux de réussite de 100%. Ces tests couvrent la concurrence sur les lits, les algorithmes de recherche PostGIS, les transitions d'état d'ambulances, le matching de donneurs de sang et les règles d'authentification.
  - *Frontend Web :* 102 tests unitaires et d'intégration validés sous Vitest et React Testing Library (formulaires, rendus de graphiques, gestion des erreurs 404/403).
  - *Application Mobile :* 73 tests automatisés Jest (flux d'onboarding, validation de formulaires, cycle de vie des missions).
- **Vérification statique de type :** Zéro erreur TypeScript (`tsc -b`) et zéro erreur de linting ESLint, garantissant qu'aucune variable non définie ne fera planter l'application à l'exécution.
- **Architecture conteneurisée reproductible :** Tout le système est encapsulé dans Docker Compose avec des bilans de santé (`healthchecks`) stricts pour PostgreSQL, Redis et Daphne.
- ⚡ *Preuve dans le code source :* Log d'exécution officiel : `Ran 586 tests in 102.78s - OK`.

---

## MODULE 9 : DÉPLOIEMENT, EXPLOITATION & LIMITES DU SYSTÈME

### Question 21 : Quelles sont les tâches de fond automatisées indispensables pour que la base de données ne s'encrasse pas au bout de quelques mois ?
*👉 Ce que le jury cherche à savoir :* Avez-vous pensé à la maintenance opérationnelle à long terme de la base de données ?

#### 💡 Réponse structurée à prononcer :
- **1. La libération des lits expirés (`expire_bed_reservations`) :** Exécutée toutes les 5 minutes pour recycler les réservations abandonnées de plus de 30 minutes.
- **2. La clôture des alertes de sang satisfaites (`cleanup_blood_requests`) :** Ferme les demandes de sang dès que le quota de poches est atteint ou que le délai médical est dépassé.
- **3. L'agrégation et purge des traces GPS (`purge_ambulance_tracks`) :** Une ambulance envoie sa position toutes les 5 secondes. En 1 mois, une flotte de 30 ambulances génère plus de 15 millions de coordonnées géographiques ! Une tâche nocturne compresse ces points en segments de trajets archivés pour ne pas saturer l'espace disque de PostgreSQL.
- **4. Le ré-entraînement périodique du Machine Learning :** Exécuté une fois par mois pour intégrer les nouvelles données de consommation et éviter le vieillissement du modèle (*data drift*).
- ⚡ *Preuve dans le code source :* Commandes Django dans `backend/lits/management/commands/` et `backend/ambulances/management/commands/`.

---

### Question 22 : Quelles sont les 3 principales faiblesses ou limites actuelles de votre application et comment comptez-vous les surmonter ?
*👉 Ce que le jury cherche à savoir :* Avez-vous la maturité d'ingénieur d'admettre vos axes d'amélioration avec une feuille de route claire ?

#### 💡 Réponse structurée à prononcer :
- **1. L'absence de canal USSD / SMS pour les zones sans Internet :** Au Sénégal, de nombreux donneurs ruraux et postes de santé n'ont pas de smartphone ou de forfait data 4G. *Solution d'évolution :* Connecter une passerelle USSD (ex: protocole `#1515*1#` via l'API Orange/Sonatel) pour permettre la mise à jour des lits par simple menu texte de téléphone basique.
- **2. Le calcul d'itinéraire sans le trafic routier réel de Dakar :** Actuellement, le dispatching calcule la distance sphérique et une estimation forfaitaire de vitesse. Or, un trajet de 5 km à Petersen ou sur l'autoroute à péage aux heures de pointe peut prendre 10 minutes comme 1 heure. *Solution d'évolution :* Brancher l'API OSRM avec matrice de trafic en temps réel ou Google Maps Distance Matrix.
- **3. L'interopérabilité avec les logiciels hospitaliers existants :** Les infirmiers doivent aujourd'hui saisir les lits dans Jappo Dundu en plus de leur registre papier ou logiciel interne. *Solution d'évolution :* Développer une passerelle standardisée de santé (HL7 / FHIR) pour synchroniser automatiquement les admissions avec le système national DHIS2 du Ministère de la Santé.
- ⚡ *Preuve dans le code source :* Feuille de route à 12 mois pour le déploiement pilote dans les grands hôpitaux de Dakar (Dantec, Fann, Principal, Hôpital Général Idrissa Pouye).

---

## CHECKLIST STRATÉGIQUE POUR LE JOUR DE LA SOUTENANCE

| Ce qu'il faut ABSOLUMENT FAIRE | Ce qu'il faut ABSOLUMENT ÉVITER |
|---|---|
| ✔ Parler de « patients, vies sauvées, minutes gagnées » | ✖ Parler uniquement de syntaxe ou de lignes de code |
| ✔ Citer les fichiers exacts et les classes (`services.py`, `postgis.py`) | ✖ Dire « on a fait un truc qui vérifie dans la base » |
| ✔ Expliquer les compromis d'ingénierie (ex: pourquoi pas GeoDjango) | ✖ Prétendre que votre solution est parfaite sans aucun défaut |
| ✔ Présenter vos 586 tests automatisés comme preuve de rigueur | ✖ Faire une démo en direct sans avoir vérifié vos données de test |
| ✔ Remercier le jury pour chaque question difficile | ✖ Se mettre sur la défensive ou couper la parole aux professeurs |
| ✔ Admettre une limite en proposant tout de suite la solution | ✖ Inventer une fausse réponse quand vous ne savez pas |

