# Photos de la page d'accueil

Images générées pour Jappo Dundu. Les originaux haute définition sont dans
`design-sources/landing/` à la racine du dépôt ; ici, des versions web
(1920 px, WebP + JPEG de repli) produites avec :

```sh
ffmpeg -i source.jpg -vf scale=1920:-2 -c:v libwebp -quality 78 nom.webp
ffmpeg -i source.jpg -vf scale=1920:-2 -q:v 4 nom.jpg
```

| Fichier | Sujet | Utilisation |
|---|---|---|
| `hero-blood-donation` | Infirmière contrôlant une poche de sang | Hero de l'accueil |
| `jappo-sang` | Poche de sang tenue en laboratoire | Carte Jappo Sang |
| `jappo-lits` | Salle d'hospitalisation, lits prêts | Carte Jappo Lits |
| `jappo-ambulances` | Ambulance dans une rue de quartier | Carte Jappo Ambulance |
| `senegal-map` | Carte du Sénégal en réseau (1200 px) | Section « Pourquoi Jappo Dundu ? » |
| `doctor-security` | Médecin dans le hall d'un hôpital | Bande « Confiance & sécurité » |
| `dakar-coast` | Corniche de Dakar au coucher du soleil | Appel final |
| `dashboard-background` | Médecin devant un tableau de bord | Volet photo de la connexion |

`alert` et `urgence` (photos Unsplash / série précédente) ne sont plus utilisées par le site.
