# Notifications push — guide d'intégration

Responsable du domaine : Pape Alioune Sene (application mobile)

Prévient les donneurs **application fermée** quand un établissement crée une
demande de sang. Envoi par le service push d'Expo, qui relaie vers FCM
(Android) et APNs (iOS) : le backend ne détient ni clé Firebase ni certificat
Apple (configuration côté mobile : `mobile/README.md`).

## Routes (utilisateur connecté)

| Route | Description |
|---|---|
| `POST /api/push/devices/` | `{"token": "ExponentPushToken[…]", "platform": "android" \| "ios"}` ; 201 (nouveau) ou 200 (réactivé). Un jeton déjà connu change de propriétaire : même téléphone, autre compte |
| `POST /api/push/devices/unregister/` | `{"token"}` ; 204. Désactive le jeton de l'utilisateur (à la déconnexion) |

## Envoi

- Déclenché par `sang.notifications.notify_request` à la **création** d'une
  demande, après validation de la transaction.
- Destinataires : la même sélection que l'appariement
  (`sang.services.find_matching_donors`) — donneurs disponibles, éligibles,
  de groupe compatible, dans le rayon de la demande, les plus proches d'abord,
  `PUSH_MAX_DONORS` au plus.
- Contenu : gravité, groupe, établissement, poches restantes. Ni donnée
  personnelle ni précision clinique. Données : `{"type": "blood_request",
  "request_id": <id>}` (le toucher ouvre la demande dans l'application).
- Lots de 100 messages, appel HTTP dans un thread : une lenteur d'Expo ne
  retarde jamais l'API. Un jeton `DeviceNotRegistered` est désactivé.

## Réglages (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `PUSH_ENABLED` | `True` | `False` : aucun envoi |
| `PUSH_ASYNC` | `True` | `False` : envoi dans la requête (tests, débogage) |
| `PUSH_EXPO_ACCESS_TOKEN` | vide | jeton d'accès si la sécurité push est activée sur le projet Expo |
| `PUSH_MAX_DONORS` | `50` | donneurs notifiés au plus par demande |

Tests : `python manage.py test push`.
