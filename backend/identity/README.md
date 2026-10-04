# Identité — mot de passe oublié et connexion sociale

Responsable du domaine : Pape Alioune Sene (application mobile)

## Mot de passe oublié (code à 6 chiffres)

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/auth/password-reset/` | `{"identifier"}` : numéro, identifiant ou e-mail | **202**, même message que le compte existe ou non |
| `POST /api/auth/password-reset/confirm/` | `{"identifier", "code", "new_password"}` | 200 + `access`/`refresh` (session ouverte) ; 400 `code` ou `new_password` |

- Code envoyé par **SMS** au numéro du compte, et par **e-mail** si le compte en a un.
- 15 minutes de validité, 5 essais, usage unique ; un nouveau code annule le précédent ;
  3 codes au plus par compte et par heure ; seule l'empreinte HMAC est stockée.
- Le nouveau mot de passe passe les validateurs Django ; toutes les sessions
  existantes sont fermées (refresh tokens révoqués).
- Limites par adresse IP : `THROTTLE_PASSWORD_RESET_RATE` (5/heure),
  `THROTTLE_PASSWORD_RESET_CONFIRM_RATE` (20/heure).

### Envoi des SMS (`SMS_BACKEND`)

- `console` (défaut) : en mode `DEBUG` uniquement, le SMS est écrit dans le journal de
  `manage.py runserver` (numéro masqué) — c'est là qu'on lit le code en développement.
  Hors `DEBUG`, rien n'est écrit : un code ne doit jamais traîner dans des journaux.
- `orange` : API SMS d'Orange Sénégal (developer.orange.com, offre « SMS Sénégal »).
  Renseigner `SMS_ORANGE_CLIENT_ID`, `SMS_ORANGE_CLIENT_SECRET`, `SMS_ORANGE_SENDER`
  (numéro expéditeur du contrat, ex. `+2210000`).

## Connexion Google, Facebook, Apple

`POST /api/auth/social/<google|facebook|apple>/`

| Fournisseur | Corps | Vérification serveur |
|---|---|---|
| Google | `{"id_token"}` | signature (clés publiques Google), émetteur, audience ∈ `GOOGLE_CLIENT_IDS`, expiration |
| Apple | `{"identity_token", "first_name"?, "last_name"?}` | signature (clés Apple), émetteur, audience ∈ `APPLE_AUDIENCES` |
| Facebook | `{"access_token"}` | `debug_token` de l'API Graph avec `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`, puis profil |

Réponse : `access`, `refresh`, `created` (compte créé), `profile_complete`
(téléphone et région renseignés ; sinon l'application les demande). 503 si le
fournisseur n'est pas configuré, 400 si le jeton est refusé.

Rattachement des comptes :
1. même fournisseur et même identifiant → même compte ;
2. sinon, compte **donneur** ayant la même adresse e-mail **vérifiée** → rattaché ;
3. sinon, nouveau compte donneur (sans mot de passe utilisable ; il pourra en créer
   un avec « mot de passe oublié » une fois son numéro renseigné).

Un compte professionnel (admin, personnel, ambulancier) n'est jamais rattaché
automatiquement (403) : il garde sa connexion par mot de passe.

Tests : `python manage.py test identity` (aucun appel réel aux fournisseurs).
