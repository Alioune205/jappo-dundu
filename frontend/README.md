# Jappo Dundu — Frontend Web Institutionnel 🩸🏥🚑

Application Web SPA (Single Page Application) haute performance dédiée aux établissements de santé, centres de transfusion sanguine (CNTS) et régulateurs des urgences médicales du Sénégal.

---

## 🛠️ Stack Technique

- **Framework & Runtime** : [React 19](https://react.dev/) + [TypeScript 5.9](https://www.typescriptlang.org/) (mode strict)
- **Bundler & Build Tool** : [Vite 6](https://vite.dev/) avec chunking automatique et lazy loading dynamique des routes
- **Styles & Design System** : [Tailwind CSS v4](https://tailwindcss.com/) avec thème dark mode ultra-contrasté (`ink-950` à `ink-100`, accents `brand-500` bordeaux médical, surfaces en verre frosted glassmorphism)
- **Cartographie Spatiale** : [Leaflet 1.9](https://leafletjs.com/) + [React-Leaflet 5](https://react-leaflet.js.org/) avec fond de carte CartoDB Dark Matter et marqueurs SVG animés
- **Visualisations & Graphiques** : [Recharts 2.15](https://recharts.org/) pour les jauges de capacité hospitalière et prédictions de pénuries
- **Gestion d'État Serveur & Requêtes** : [@tanstack/react-query v5](https://tanstack.com/query/latest) avec invalidation de cache ciblée
- **Temps Réel & WebSockets** : Django Channels (`/ws/alerts/` et `/ws/dashboard/`) avec reconnexion automatique exponentielle et synchronisation d'état
- **Icônes** : [Lucide React](https://lucide.dev/)
- **Tests** : [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) avec environnement jsdom

---

## 📂 Architecture des Dossiers

```text
frontend/
├── public/
│   └── favicon.svg               # Favicon officiel Jappo Dundu
├── src/
│   ├── components/
│   │   ├── layout/               # Header, Sidebar, AppLayout
│   │   ├── map/                  # MapView (CartoDB Dark Matter + SVG pulse markers)
│   │   └── ui/                   # Button, Card, Badge, Input, Modal, StatCard, Alert, Tabs, Skeleton
│   ├── context/
│   │   ├── AuthContext.tsx       # Gestion JWT, profil utilisateur et contrôle d'accès (RBAC)
│   │   └── RealtimeContext.tsx   # Gestionnaire WebSocket bi-canal, alertes temps réel
│   ├── lib/
│   │   ├── api.ts                # Client fetch avec intercepteur 401 et renouvellement JWT automatique
│   │   ├── constants.ts          # Énumérations (14 régions, groupes sanguins, statuts lits/ambulances)
│   │   ├── format.ts             # Formateurs localisés Sénégal (FCFA, km, dates Dakar, numéros +221)
│   │   └── session.ts            # Gestion sécurisée des tokens (access en mémoire, refresh en sessionStorage)
│   ├── pages/
│   │   ├── Login.tsx             # Authentification JWT
│   │   ├── Dashboard.tsx         # Tableau de bord décisionnel (KPIs, carte nationale, alertes)
│   │   ├── BloodManagement.tsx   # Demandes de sang, matching PostGIS donneurs, dons spontanés
│   │   ├── BedsManagement.tsx    # Occupation des lits par service, admission/décharge atomique
│   │   ├── AmbulancesManagement.tsx # Flotte d'ambulances, dispatch d'urgence, régulation
│   │   ├── MLPredictions.tsx     # Prévisions de pénuries (HistGradientBoosting / CQR 80%)
│   │   ├── FacilitiesManagement.tsx # Administration des structures sanitaires et des rôles
│   │   ├── Profile.tsx           # Profil utilisateur, changement mot de passe et révocation de session
│   │   └── NotFound.tsx          # Page 404
│   ├── test/
│   │   └── setup.ts              # Configuration Vitest et matchers jest-dom
│   ├── types/
│   │   └── api.ts                # Typage strict aligné 1:1 avec les serializers Django REST
│   ├── App.tsx                   # Fournisseurs globaux (QueryClient, Auth, Realtime)
│   ├── index.css                 # Configuration Tailwind v4 et design tokens
│   ├── main.tsx                  # Point d'entrée de l'application
│   └── routes.tsx                # Définition des routes et code-splitting (Suspense)
├── vite.config.ts                # Configuration Vite avec proxys dev (/api, /ws)
├── vitest.config.ts              # Configuration Vitest (jsdom, globals)
└── tsconfig.json                 # Configuration TypeScript
```

---

## 🚀 Démarrage Rapide

### Prérequis
- Node.js 20+ ou 22+
- Backend Django démarré sur `http://127.0.0.1:8000` (ou environnement Docker actif)

### Installation
```bash
cd frontend
npm install
```

### Développement
```bash
npm run dev
```
L'interface sera accessible sur `http://localhost:3000`. Le serveur de dev redirige automatiquement :
- `/api/*` ➔ `http://127.0.0.1:8000/api/*`
- `/ws/*` ➔ `ws://127.0.0.1:8000/ws/*`

### Tests unitaires et d'intégration (Vitest)
```bash
npm test
```
Règles métier (`pages/domainRules.test.ts`), temps réel (socket, regroupement des
rafraîchissements, mode dégradé), barrières d'erreur, et pages complètes
(tableau de bord, lits, sang) avec l'API simulée.

### Tests de bout en bout (Playwright)
Sur la vraie pile : Django/Daphne + PostgreSQL/PostGIS + Redis + Vite.
Prérequis : conteneurs `db` et `redis` démarrés (`backend/docker-compose.yml`) et
l'environnement Python du backend installé (`backend/venv`).

```bash
npx playwright install chromium        # une fois (ou PLAYWRIGHT_CHANNEL=msedge / chrome)
npm run test:e2e
```
Playwright démarre lui-même un backend sur le port 8010 (`backend/scripts/e2e_server.py`)
et Vite sur le port 3100. La base `jappo_e2e` est **recréée à chaque campagne** à partir
des données de démonstration : la base de développement n'est jamais touchée.

Scénarios couverts (`e2e/regulation.spec.ts`) : connexion et flux temps réel par ticket
(aucun JWT dans l'URL), mission SAMU avec affectation automatique de l'ambulance la plus
proche puis cycle de vie, admission dans un service visible en temps réel chez un second
régulateur, page inconnue.

### Vérification de Types
```bash
npm run typecheck
```

### Build Production
```bash
npm run build
```
Les fichiers statiques minifiés et découpés en chunks optimisés sont générés dans `dist/`.

---

## 🔒 Sécurité & Bonnes Pratiques

1. **Tokens JWT & Rotation** :
   - Le jeton d'accès (`access`) est conservé exclusivement en mémoire JavaScript (`session.ts`), éliminant les risques de vol par script cross-site (XSS).
   - Le jeton de rafraîchissement (`refresh`) est stocké en `sessionStorage` (par onglet).
   - Un intercepteur single-flight capture les erreurs 401 et régénère le token de façon transparente sans déconnecter l'utilisateur.

2. **WebSockets Sécurisés** :
   - Le JWT ne figure jamais dans l'URL : chaque (re)connexion échange le jeton d'accès contre un ticket à usage unique valable 30 s (`POST /api/realtime/ticket/`, puis `?ticket=…`).
   - Reconnexion automatique avec attente exponentielle (1 s → 30 s), arrêt définitif sur refus d'autorisation.
   - Flux coupé : l'en-tête l'indique (« Flux interrompu depuis HH:MM ») et les données affichées sont relues toutes les 30 s par l'API REST.
   - Les événements reçus sont regroupés par fenêtre d'une seconde avant tout rechargement ; les positions GPS sont appliquées au cache sans requête.

3. **Protection des Données Personnelles** :
   - Formatage conforme des coordonnées de donneurs et masquage selon les privilèges du rôle connecté (`hospital_staff` vs `admin`).
