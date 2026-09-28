# Déploiement de Jappo Dundu

Responsable : El Hadji Massogui Diop (ML, DevOps & Sécurité)

Ce dossier contient tout ce qu'il faut pour mettre en production l'API, la base
de données, le temps réel et l'hébergement du frontend web sur un seul serveur.

## Architecture

```
Internet ──► Caddy (ports 80/443, certificat HTTPS automatique)
              ├── /api/*, /admin/*, /ws/*  ──► web : Daphne (API REST + WebSockets)
              ├── /static/*                ──► fichiers statiques Django (admin)
              └── /*                       ──► build du frontend React
             web ──► db : PostgreSQL 16 + PostGIS
             web ──► redis : Channels (temps réel) + cache (limitation de débit)
```

- Seul Caddy est exposé. La base, Redis et l'API restent sur le réseau Docker interne.
- Le frontend et l'API partagent le même domaine : aucun réglage CORS n'est
  nécessaire en production. Le frontend appelle `/api/...` et `wss://<domaine>/ws/...`.
- Caddy obtient et renouvelle seul le certificat Let's Encrypt.

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | Stack de production (db, redis, web, caddy) |
| `Caddyfile` | Reverse proxy, HTTPS, fichiers statiques, frontend |
| `.env.example` | Variables à renseigner (copier en `.env`) |
| `smoke_test.py` | Scénarios de vérification MVP de bout en bout |
| `MVP_TEST_SCENARIOS.md` | Description des scénarios et du déroulé de démonstration |

## Prérequis serveur

- Un VPS Linux (Ubuntu 22.04/24.04), 2 vCPU et 4 Go de RAM au minimum
  (l'entraînement du modèle ML prend environ 1 minute).
- Docker Engine avec le plugin Compose v2.
- Un nom de domaine dont l'enregistrement DNS `A` pointe vers le serveur.
- Les ports 80 et 443 ouverts.

## Mise en production

```bash
git clone https://github.com/Alioune205/jappo-dundu.git && cd jappo-dundu

# 1. Frontend : produire le build (dossier frontend/dist par défaut)
cd frontend && npm ci && npm run build && cd ..

# 2. Configuration
cd deploy
cp .env.example .env
nano .env          # SITE_ADDRESS, ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, SECRET_KEY, DB_PASSWORD
```

Générer les secrets :

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # DB_PASSWORD
```

```bash
# 3. Démarrage : au lancement, le conteneur web applique les migrations,
#    collecte les fichiers statiques et crée les groupes de rôles.
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # tous les services "healthy"

# 4. Compte administrateur (interactif)
docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser

# 5. Données et modèle ML
docker compose -f docker-compose.prod.yml exec web python manage.py import_stock_data /chemin/stocks.csv
#   (ou, faute de données réelles : ... exec web python manage.py generate_training_data)
docker compose -f docker-compose.prod.yml exec web python manage.py train_model
docker compose -f docker-compose.prod.yml exec web python manage.py predict_shortages

# 6. Vérification de bout en bout (depuis n'importe quel poste)
pip install -r requirements-smoke.txt
python smoke_test.py --base-url https://<domaine> --username <admin> --password '<mot de passe>' --check-frontend
```

Pour importer un fichier situé sur le serveur, il faut d'abord le copier dans le conteneur :
`docker compose -f docker-compose.prod.yml cp stocks.csv web:/tmp/stocks.csv`.

## Exploitation

| Besoin | Commande (depuis `deploy/`, préfixe `docker compose -f docker-compose.prod.yml`) |
|---|---|
| Journaux de l'API | `logs -f web` |
| État détaillé (admin) | `GET /api/status/` avec un token admin |
| Mise à jour du code | `git pull` puis `up -d --build` |
| Prédictions quotidiennes | cron du serveur : `0 6 * * * cd /opt/jappo-dundu/deploy && docker compose -f docker-compose.prod.yml exec -T web python manage.py predict_shortages` |
| Ré-entraînement mensuel | `exec web python manage.py train_model` |
| Sauvegarde de la base | `exec -T db pg_dump -U jappo -Fc jappo_db > sauvegarde_$(date +%F).dump` |
| Restauration | `exec -T db pg_restore -U jappo -d jappo_db --clean < sauvegarde.dump` |

Chaque requête HTTP est journalisée avec un identifiant `X-Request-ID`, renvoyé au
client et utilisable pour retrouver une erreur dans les journaux.

## Sécurité en production

- `DEBUG=False` est imposé ; l'application refuse de démarrer sans `SECRET_KEY`.
- HTTPS est obligatoire : redirection, cookies `Secure` et HSTS d'un an.
- `python manage.py check --deploy` ne signale plus que `security.W021`
  (préchargement HSTS). Il est laissé désactivé volontairement, car
  l'inscription d'un domaine sur la liste des navigateurs est quasi irréversible.
  Si `EMAIL_HOST` est vide, il signale aussi `mail.E001` : les e-mails sont alors
  seulement écrits dans les journaux. Il faut renseigner les variables `EMAIL_*`
  avant d'activer une fonctionnalité qui envoie des e-mails.
- Le throttling s'appuie sur l'adresse transmise par Caddy (`NUM_PROXIES=1`) :
  un en-tête `X-Forwarded-For` forgé ne permet plus de le contourner.

## Test local de la stack de production

Pour tester en HTTP sur un poste de développement, dans `deploy/.env` :
`SITE_ADDRESS=:80`, `HTTPS_ENABLED=False`, `ALLOWED_HOSTS=localhost,127.0.0.1`,
`HTTP_PORT=8080` et `HTTPS_PORT=8443`. L'application est alors servie sur
`http://localhost:8080`. Supprimez ce `.env` de test après usage.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `docker build` échoue avec `invalid file request ...` sous Windows | Le projet est dans un dossier OneDrive : BuildKit ne sait pas lire les fichiers gérés par OneDrive. Déplacez le dépôt hors de OneDrive (ex. `C:\dev\jappo-dundu`). Contournement ponctuel depuis `backend/` : `tar --exclude=./venv --exclude=__pycache__ -cf - . \| docker build -t jappo-dundu-backend:latest -` |
| `ImproperlyConfigured: SECRET_KEY doit être définie` | `SECRET_KEY` est vide dans `deploy/.env`. |
| Page 404 sur `/` | Le build du frontend est absent : vérifiez `FRONTEND_DIST_DIR`. |
| Certificat HTTPS non obtenu | Le DNS ne pointe pas encore vers le serveur, ou les ports 80/443 sont fermés : `logs caddy`. |
| `/api/ml/predict/` renvoie 503 | Aucun modèle actif : lancez `train_model`. |
| WebSocket fermé avec le code 4401 | Token absent ou expiré : rafraîchir le token puis se reconnecter. |
