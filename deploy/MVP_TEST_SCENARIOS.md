# Scénarios de test du MVP — Jappo Dundu

Responsable : El Hadji Massogui Diop

Ces scénarios servent à vérifier le système global avant la présentation. Les
scénarios S01 à S15 sont automatisés par `deploy/smoke_test.py` ; la partie
« Démonstration » décrit le déroulé à suivre devant le jury.

## Exécution automatique

```bash
pip install -r deploy/requirements-smoke.txt
python deploy/smoke_test.py --base-url https://<domaine> \
    --username <admin> --password '<mot de passe>' \
    --cors-origin http://localhost:3000 --check-frontend
```

Le script affiche `[PASS]`, `[FAIL]` ou `[SKIP]` pour chaque scénario et se
termine avec le code 1 en cas d'échec. Il crée des prédictions (S09), ce qui est
le comportement normal de l'application. Il doit s'exécuter au plus une fois par
minute : la connexion est limitée à 10 tentatives par minute et par adresse IP.

## Scénarios

| # | Scénario | Étapes | Résultat attendu |
|---|---|---|---|
| S01 | Sonde de vivacité | `GET /api/health/` | 200, `status: healthy` |
| S02 | En-têtes de sécurité | `GET` sur une route de l'API | `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `X-Request-ID` |
| S03 | Route protégée | `GET /api/ml/predictions/` sans token | 401 |
| S04 | Mauvais mot de passe | `POST /api/auth/token/` | 401 |
| S05 | Connexion admin | `POST /api/auth/token/` | 200, tokens `access`/`refresh`, rôle `admin` |
| S06 | Dépendances | `GET /api/status/` (admin) | 200, base et channel layer `up` |
| S07 | Modèle ML | `GET /api/ml/model-info/` | 200, version et métriques du modèle actif |
| S08 | WebSocket anonyme | connexion à `/ws/alerts/` sans token | fermeture avec le code 4401 |
| S09 | Prédiction diffusée en temps réel | connexion à `/ws/dashboard/?token=…`, `ping`, puis `POST /api/ml/predict/` | `pong`, puis message `prediction_update` reçu en moins de 15 s |
| S11 | Consultation | `GET /api/ml/predictions/` et `/summary/` | le nombre listé correspond au nombre généré |
| S12 | Rotation du refresh | rafraîchir, puis rejouer l'ancien refresh | 200, puis 401 |
| S13 | Déconnexion | `POST /api/auth/logout/`, puis réutiliser le refresh | 200, puis 401 |
| S14 | CORS | requête de pré-vérification depuis l'origine autorisée, puis depuis une origine inconnue | en-tête `Access-Control-Allow-Origin` présent, puis absent |
| S15 | Frontend | `GET /` et un lien profond (`/tableau-de-bord/stocks`) | 200 HTML dans les deux cas (routage de l'application monopage) |

Dernière exécution : 28/09/2026, stack de production locale (Caddy, Daphne,
PostGIS, Redis) : **14/14 réussis**.

## Tests unitaires et d'intégration du backend

```bash
cd backend && python manage.py test security realtime ml
```

139 tests couvrent :
- les rôles, les permissions, les JWT (rotation, révocation), la limitation de
  débit, le middleware et CORS ;
- le WebSocket : authentification, autorisation, protocole, diffusion ;
- le ML : absence de fuite de données, entraînement, prédiction, API, import
  CSV et commandes.

Ils passent sur PostgreSQL et sur SQLite.

## Démonstration (déroulé proposé, environ 5 minutes)

1. **Sécurité** : se connecter avec un compte donneur, tenter d'ouvrir le tableau
   de bord des prédictions → accès refusé (403). Se connecter avec un compte du
   personnel hospitalier → accès accordé.
2. **Temps réel** : ouvrir le tableau de bord web, connecté à `/ws/dashboard/`.
3. **Prédiction** : lancer une prédiction depuis l'interface (`POST /api/ml/predict/`).
   Le tableau de bord se met à jour sans rechargement (`prediction_update`), et
   les régions menacées de pénurie reçoivent une alerte `blood_alert` sur
   `/ws/alerts/?region=<région>` (application mobile des donneurs).
4. **Modèle** : montrer `/api/ml/model-info/`. Le modèle est comparé à la baseline
   « le stock ne change pas » sur une période de test postérieure à
   l'entraînement : erreur plus faible et davantage de pénuries détectées.

## Hors périmètre à ce jour

Les modules `sang`, `lits`, `ambulances` et `users` ne contiennent pas encore de
fonctionnalités. Leurs scénarios seront ajoutés ici quand ils exposeront des
routes. Pour publier une alerte depuis ces modules, voir `backend/realtime/README.md`.
