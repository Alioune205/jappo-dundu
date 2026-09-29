# Recherche géographique (PostGIS)

Responsable : Ibrahima Khalilou Diallo

Moteur commun aux recherches de proximité : donneurs compatibles, demandes de
sang proches, établissements avec lits libres, ambulances disponibles.

## Fonctionnement

Les positions sont stockées dans deux colonnes `latitude`/`longitude` (WGS 84),
lisibles par tous les clients. Sur PostgreSQL, la recherche s'exécute en une
seule requête PostGIS :

```sql
WHERE ST_DWithin(geography(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)), :point, :rayon, false)
ORDER BY geography(...) <-> :point      -- tri KNN appuyé sur l'index GiST
LIMIT :n
```

L'index GiST est posé sur exactement cette expression (migrations
`users/0002`, `sang/0002`, `ambulances/0002`) : PostgreSQL l'utilise pour le
filtre de distance et pour le tri. Un test le vérifie avec `EXPLAIN`.

Sur SQLite (développement rapide, tests), le moteur portable applique d'abord
un filtre SQL par boîte englobante, puis calcule la distance de Haversine. Les
deux moteurs utilisent la même sphère (rayon moyen WGS 84) : un test vérifie
sur PostgreSQL qu'ils renvoient les mêmes objets, dans le même ordre, à 1 cm
près.

## Pourquoi pas GeoDjango

GeoDjango impose les bibliothèques natives GDAL et GEOS sur chaque poste
(Windows compris), dans l'image Docker et pour SQLite (SpatiaLite). Il aurait
fallu modifier le `Dockerfile` et la configuration de déploiement, et les tests
des autres modules, qui tournent aujourd'hui sur SQLite, ne passeraient plus.
Cette solution utilise les mêmes fonctions PostGIS (`geography`, `ST_DWithin`,
KNN, index GiST) sans aucune dépendance native supplémentaire.

## Base de données

La migration `users/0002` active l'extension PostGIS (`CREATE EXTENSION IF NOT
EXISTS postgis`). Sur PostgreSQL, PostGIS est obligatoire : sans lui, la
migration échoue avec un message explicite. L'image `postgis/postgis` de
`docker-compose.yml` le fournit.

## Utilisation

```python
from geo.distance import GeoPoint
from geo.search import nearest

results = nearest(
    queryset,                          # filtres métier déjà appliqués
    GeoPoint(14.6928, -17.4467),
    radius_m=20_000,
    limit=10,
    latitude_field='facility__latitude',   # champs éventuellement joints
    longitude_field='facility__longitude',
)
results[0].distance_m
```

Pour un nouveau modèle positionné : champs `geo.fields.latitude_field()` et
`longitude_field()`, contrainte `coordinates_constraint(...)`, puis une
migration `geo.operations.AddGeographyIndex`.
