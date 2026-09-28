# Prédiction des pénuries de sang — guide

Responsable : El Hadji Massogui Diop

## Ce que fait le modèle

Pour chaque centre de transfusion et chaque groupe sanguin, il prévoit le stock
des 1 à 30 prochains jours. Chaque prévision comprend :
- un intervalle P10–P90 (la valeur réelle a 80 % de chances d'y tomber) ;
- le nombre de **jours de stock** : stock prévu / consommation moyenne des 30 derniers jours ;
- un niveau de risque, calculé en jours de stock pour s'adapter à la taille de
  chaque banque : `CRITICAL` sous 2 jours, `WARNING` sous 5 jours (seuils
  réglables par `ML_SHORTAGE_CRITICAL_DAYS` et `ML_SHORTAGE_WARNING_DAYS`, à
  valider avec le CNTS) ;
- une confiance : la probabilité estimée que ce niveau de risque soit le bon.

## Méthode

- **Prévision directe multi-horizon.** À une date t, avec uniquement
  l'information connue à t, le modèle prédit la variation du stock entre t et t + h.
  Un test garantit que modifier des données futures ne change aucune donnée d'entrée.
- **Variables d'entrée** : niveau et tendance du stock, dons et utilisations
  moyens sur 7 et 30 jours, jours de stock, calendrier de la date cible, part de
  Ramadan et de grands événements (Tabaski, Grand Magal) dans la fenêtre, région
  et groupe sanguin.
- **Normalisation** : la variation est divisée par √(échelle × h), ce qui
  stabilise la variance de flux de type Poisson ; un même modèle convient ainsi
  à O+ à Dakar comme à AB- à Kédougou.
- **Trois modèles `HistGradientBoostingRegressor`** : la prévision centrale et
  les quantiles 10 % et 90 %.
- **Évaluation honnête** : la période de test (les 20 % les plus récents) suit
  strictement la période d'entraînement. Le modèle est comparé à la baseline
  « le stock ne change pas » (persistance), puis ré-entraîné sur tout l'historique.

## Performances (données simulées, 128 séries sur 2 ans, test à partir du 06/05/2026)

| Mesure | Modèle | Baseline persistance |
|---|---|---|
| Erreur absolue moyenne (poches) | **2,91** | 3,89 (−25 %) |
| … à 1–3 jours | **1,26** | 1,29 |
| … à 15–30 jours | **3,61** | 5,15 |
| Pénuries réelles signalées (rappel) | **87,9 %** | 85,9 % |
| Alertes critiques fondées (précision) | 97,5 % | — |
| Couverture de l'intervalle P10–P90 (cible 80 %) | 76,1 % | — |
| Niveau de risque exact | 70,6 % | 72,0 % |

Lecture : le modèle prévoit mieux le stock à tous les horizons et détecte
davantage de pénuries. La persistance reste légèrement meilleure pour deviner
la classe de risque exacte à très court terme, car un stock varie peu en 1 à
3 jours. Ces chiffres portent sur des données simulées : il faut les recalculer
sur l'historique réel du CNTS dès qu'il est disponible.

## Données

Faute d'historique réel, `generate_training_data` simule deux ans de stocks
pour les 14 régions. Ses hypothèses sont documentées dans
`services/data_generator.py` :
- comptabilité cohérente : stock(j) = stock(j−1) + dons − utilisations − péremptions ;
- hivernage, vacances scolaires et paludisme ;
- Ramadan, Tabaski et Grand Magal, datés par le calendrier hégirien ;
- campagnes d'appel au don quand le stock est bas ;
- péremption des poches.

Chaque ligne indique sa source (`synthetic`, `import`, `manual`). Pour importer
l'historique réel, utilisez un CSV UTF-8 (export Excel accepté) :

```
center_name;region;blood_group;date;units_available;units_donated;units_used;units_expired
CNTS Dakar;Dakar;O+;2026-09-01;84;12;10;0
CTS Thiès;Thiès;AB-;02/09/2026;3;;;
```

- Séparateur `;`, `,` ou tabulation ; dates au format AAAA-MM-JJ ou JJ/MM/AAAA.
- Les régions sont acceptées avec ou sans accents.
- Les colonnes de flux sont facultatives.
- L'import est tout ou rien : la moindre erreur l'annule et les erreurs sont
  listées avec leur numéro de ligne. Une ligne déjà présente est mise à jour.

## Commandes

```bash
python manage.py generate_training_data [--days 730] [--clear]   # --clear ne supprime que le simulé
python manage.py import_stock_data stocks.csv [--dry-run]
python manage.py train_model [--source import] [--model-version 1.0.0]
python manage.py predict_shortages [--days-ahead 7] [--region dakar]
```

`train_model` affiche les métriques et active le nouveau modèle ; l'ancien reste
dans le registre (admin Django) et peut être réactivé.

## API (rôles `admin` et `hospital_staff`)

| Route | Description |
|---|---|
| `GET /api/ml/predictions/` | Prédictions à venir. Filtres : `region`, `blood_group`, `risk_level`, `center`, `include_past=true` (400 si une valeur est invalide) |
| `GET /api/ml/predictions/summary/` | Nombre de risques par région, la plus critique en premier |
| `POST /api/ml/predict/` | `{"region", "blood_group", "days_ahead"}` (tous facultatifs) ; limité à 30 appels par heure ; 503 si aucun modèle n'est actif |
| `GET /api/ml/model-info/` | Modèle actif et métriques détaillées |
| `GET /api/ml/stocks/` | Historique des stocks (`days` de 1 à 365, `region`, `blood_group`, `center`) |

Chaque prédiction enregistrée remplace la précédente pour le même périmètre, puis :
- le tableau de bord reçoit un `prediction_update` ;
- chaque région menacée reçoit un `blood_alert` (voir `realtime/README.md`).
