# Logo Jappo Dundu

- `logo-source.png` : logo complet fourni par l'équipe (1254 × 1254, fond blanc).
  Couleurs : rouge `#E4151E`, bleu marine `#05244A`.
- `generate_logo_assets.py` : produit toutes les déclinaisons à partir de ce fichier
  (fond rendu transparent, variante « thème sombre » où le marine devient clair).

```
python branding/generate_logo_assets.py branding/logo-source.png .
```

Fichiers produits :

| Fichier | Usage |
|---|---|
| `frontend/public/logo.png`, `logo-dark.png` | logo complet, page de connexion |
| `frontend/public/logo-mark.png`, `logo-mark-dark.png` | symbole, barre latérale |
| `frontend/public/favicon.png`, `apple-touch-icon.png` | onglet du navigateur, raccourci iOS |
| `mobile/assets/logo-mark.png`, `logo-mark-dark.png` | composant `BrandMark` |
| `mobile/assets/icon.png` | icône de l'application (iOS) |
| `mobile/assets/android-icon-foreground.png`, `android-icon-monochrome.png` | icône adaptative Android |
| `mobile/assets/notification-icon.png` | icône de notification (silhouette blanche) |
| `mobile/assets/splash-mark.png`, `splash-mark-dark.png` | écran de démarrage |

À faire : obtenir une version vectorielle (SVG) et un symbole simplifié pour les
très petites tailles (16–32 px), où le pouls et la main deviennent peu lisibles.
