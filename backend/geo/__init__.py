"""
Moteur de recherche géographique de Jappo Dundu.

Trouve les objets les plus proches d'un point (donneurs, établissements,
ambulances) à partir de deux colonnes ``latitude``/``longitude`` (WGS 84).

- PostgreSQL : requête PostGIS (``geography``, ``ST_DWithin``, tri KNN
  ``<->``) appuyée sur un index GiST d'expression, créé par migration
  (voir ``geo.operations``).
- Autres bases (SQLite en développement et en test) : pré-filtre SQL par
  boîte englobante, puis distance exacte par la formule de Haversine.

Les deux moteurs utilisent la même sphère (rayon moyen WGS 84) : ils
renvoient les mêmes objets, dans le même ordre, avec les mêmes distances.

Auteur : Ibrahima Khalilou Diallo
"""
