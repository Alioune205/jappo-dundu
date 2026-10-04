# Jappo Dundu — application mobile des donneurs

Application **Expo / React Native** des citoyens donneurs de sang : alertes des
hôpitaux proches compatibles avec leur groupe, réponse en un geste, historique
des dons.

Responsable du domaine : **Pape Alioune Sene** (application mobile).

| | |
|---|---|
| Expo SDK 57, React Native 0.86, React 19 | `expo-router` (routes typées, dossier `src/app`) |
| Reanimated 4 + Worklets | animations sur le thread UI |
| TanStack Query | cache, rafraîchissement, mises à jour optimistes |
| AsyncStorage | cache hors ligne, onboarding vu |
| SecureStore | jeton de rafraîchissement (Keychain / Keystore) |
| expo-location | position au premier plan uniquement |
| expo-notifications | push Expo → FCM (Android) / APNs (iOS) |

## Démarrer

```bash
cd mobile
npm install
cp .env.example .env        # puis renseigner EXPO_PUBLIC_API_URL
npx expo start              # QR code → Expo Go, ou touche « a » / « i » / « w »
```

`EXPO_PUBLIC_API_URL` est l'adresse du backend **vue depuis le téléphone** :
l'IP locale du PC (`http://192.168.1.20:8000`), `http://10.0.2.2:8000` depuis
l'émulateur Android. Le backend doit alors écouter sur toutes les interfaces et
accepter cette adresse :

```bash
# backend/.env : ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.20
python manage.py runserver 0.0.0.0:8000
```

La variable est lue **à la compilation** : après l'avoir changée, relancer
`npx expo start --clear`.

Compte de démonstration (`seed_demo_data.py`) : `awa.ndiaye` / `Password123!`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm test` | tests Jest (jest-expo + Testing Library) |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (config Expo, règles React Compiler) |
| `npx expo export --platform web` | version web statique (prévisualisation) |

## Parcours

1. **Splash → Onboarding** (premier lancement) : l'histoire d'un don en quatre
   photos réelles (urgence, alerte, don, impact — crédits dans
   `assets/onboarding/CREDITS.md`), avec zoom lent, parallaxe au balayage et
   l'interface de l'application animée par-dessus (stock qui fond, notification,
   « On vous attend », compteur de vies). Le logo du splash se pose dans la barre
   du haut ; « Commencer » s'agrandit jusqu'à devenir l'écran d'inscription.
2. **Auth** : connexion par **numéro de téléphone** (ou identifiant), par Google,
   Facebook ou Apple (iOS) ; **mot de passe oublié** par code SMS à 6 chiffres ;
   inscription en une étape (`POST /api/users/register/`, l'identifiant technique
   est le numéro), conditions et confidentialité expliquées en clair. Après une
   première connexion sociale, téléphone et région sont demandés (`/complete-profile`).
3. **Profil donneur** (`/donor-setup`, étape 2 sur 2) : groupe sanguin, sexe, dates, disponibilité ;
   position et alertes push demandées en contexte. Obligatoire avant l'espace
   donneur, modifiable ensuite depuis Profil.
4. **Onglets** :
   - **Alertes** : demandes compatibles autour du donneur (`GET /api/sang/requests/nearby/`),
     en temps réel ; « Je viens donner » / « Pas cette fois » / désistement
     (`POST /api/sang/requests/<id>/respond/`), itinéraire et appel une fois engagé ;
   - **Historique** : dons et réponses par mois, délai avant le prochain don ;
   - **Profil** : disponibilité, position, alertes push, déconnexion.

## Temps réel, push et hors ligne

- **Flux WebSocket** `/ws/alerts/` ouvert avec un ticket à usage unique
  (`POST /api/realtime/ticket/`, le JWT ne passe jamais dans l'URL). Une alerte
  relance la lecture de la liste. Reconnexion 1 s → 30 s, coupure en arrière-plan,
  sondage d'une minute tant que le flux est coupé.
- **Push** : à la création d'une demande, le backend notifie les donneurs
  compatibles à portée (`backend/push/`). Le téléphone enregistre son jeton
  Expo (`POST /api/push/devices/`) et le désactive à la déconnexion. Toucher la
  notification ouvre la demande.
- **Hors ligne** : profil, alertes et historique sont gardés dans AsyncStorage
  (7 jours au plus, effacés à la déconnexion ou au changement de compte). Sans
  réseau au démarrage, une session valide ouvre l'application sur ces données.

## Mot de passe oublié

Le code part par SMS (`backend/identity/README.md`). En développement, le
backend écrit le SMS dans sa console (`manage.py runserver`) : on y lit le code.
En production : `SMS_BACKEND=orange` et les identifiants de l'API SMS d'Orange Sénégal.

## Connexion Google, Facebook, Apple : mise en place

Le téléphone obtient un jeton auprès du fournisseur ; le backend le vérifie
(`backend/identity/social.py`). Il faut créer les identifiants chez chaque
fournisseur, puis les renseigner des deux côtés :

| Fournisseur | Console | Mobile (`mobile/.env`) | Backend (`backend/.env`) |
|---|---|---|---|
| Google | Google Cloud → API et services → Identifiants : un client OAuth **Android** (package `sn.jappodundu.donneurs` + empreinte SHA-1 du build), **iOS** (bundle `sn.jappodundu.donneurs`) et **Web** | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `…_IOS_…`, `…_WEB_…` | `GOOGLE_CLIENT_IDS` = les trois, séparés par des virgules |
| Facebook | Meta for Developers → application « Consumer » → Facebook Login, plateformes Android et iOS | `EXPO_PUBLIC_FACEBOOK_APP_ID` (le schéma `fb<id>` est ajouté par `app.config.ts`) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| Apple (iOS) | Apple Developer → identifiant `sn.jappodundu.donneurs` avec « Sign in with Apple » | rien (`usesAppleSignIn` déjà dans `app.json`) | `APPLE_AUDIENCES` (défaut : le bundle ; ajouter `host.exp.Exponent` pour Expo Go) |

Comme les push, Google et Facebook exigent un *development build* sur
téléphone. Sans identifiants, les boutons restent visibles en développement
(un message explique quoi configurer) et disparaissent des versions publiées.

## Notifications push (FCM) : mise en place

Les push ne fonctionnent ni sur le web ni dans **Expo Go sur Android** : il faut
un *development build*.

1. Compte Expo et projet EAS : `npm i -g eas-cli && eas login && eas init`
   (ajoute `extra.eas.projectId` dans `app.json`, requis pour obtenir un jeton).
2. Firebase : créer un projet, une application Android `sn.jappodundu.donneurs`,
   télécharger `google-services.json` dans `mobile/` (ignoré par git) et ajouter
   dans `app.json` → `android.googleServicesFile: "./google-services.json"`.
3. Clé FCM v1 : Firebase → Paramètres → Comptes de service → nouvelle clé
   privée, puis `eas credentials` → Android → *Google Service Account Key for
   FCM V1* (la clé reste chez Expo, jamais dans le dépôt).
4. iOS : `eas credentials` génère la clé APNs (compte Apple Developer requis).
5. Build : `eas build --profile development --platform android`, ou
   `npx expo run:android` avec le SDK Android installé.

Côté backend : variables `PUSH_*` dans `backend/.env.example`.

## Organisation du code

```
src/
  app/                 routes expo-router
    (auth)/            connexion, inscription
    (app)/             espace connecté : donor-setup, (tabs)/alerts|history|profile
  components/          AuthShell, ScreenHeader, TabBar, SplashHandoff, ui/ (Button, Text, Sheet…)
  context/             AuthContext (session, cache), OnboardingContext
  features/            onboarding/, donor/, alerts/, history/
  lib/                 api, session, queries (QK), persist, location, push, realtime, dates, validation
  theme/               jetons (couleurs, typographie, espacements, mouvement)
  __tests__/           tests Jest
```

Conventions :

- couleurs et typographie : uniquement via `src/theme` (mêmes valeurs que le web) ;
- clés TanStack Query : uniquement via `QK` (`src/lib/queries.ts`) ;
- valeurs partagées Reanimated : écriture JS par `.set()`, lecture de `.value`
  directement dans le worklet de style ;
- animations d'entrée web : prédéfinies uniquement (voir `enter()` dans
  `AuthShell.tsx`, Reanimated web gère mal les valeurs initiales personnalisées) ;
- confidentialité : position arrondie à ~100 m avant tout envoi, jamais montrée
  aux hôpitaux ; jeton de rafraîchissement dans SecureStore, jamais dans AsyncStorage.
