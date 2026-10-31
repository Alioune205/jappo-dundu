# Images de la page d'accueil : prompts de génération

La page (`src/pages/Landing.tsx`) cherche chaque image sous
`public/images/landing/<nom>.webp`, puis `<nom>.jpg`. Tant qu'aucun fichier
n'existe, un fond bleu nuit avec un pictogramme prend sa place.

`impact` (bloc « Pourquoi Jappo Dundu ») est conservée : ne pas la remplacer.

## Style commun

À ajouter à la fin de chaque prompt pour que les six images forment une série :

> documentary photography, natural light, warm and hopeful mood, realistic
> Senegalese people and setting, shallow depth of field, shot on 35mm,
> muted colors with touches of deep red (#C8102E) and navy blue (#0B1F3A),
> no text, no logos, no watermark

À éviter (prompt négatif, si l'outil le permet) : texte, logos, croix rouge,
sang visible en grande quantité, blessures, visages déformés, mains à six
doigts, style illustration ou 3D.

## Les six images

| Fichier | Où | Format | Taille conseillée |
|---|---|---|---|
| `hero` | Haut de page | 5:4 | 1600 × 1280 |
| `module-sang` | Carte Jappo Sang | 16:10 | 1200 × 750 |
| `module-lits` | Carte Jappo Lits | 16:10 | 1200 × 750 |
| `module-ambulance` | Carte Jappo Ambulance | 16:10 | 1200 × 750 |
| `urgence` | Section Fonctionnement | 4:3 | 1600 × 1200 |
| `don` | Section Don de sang | 16:10 | 1600 × 1000 |

### `hero` : l'équipe de secours

Le bas-gauche de l'image est couvert par une carte « Ambulance en route » :
garder le sujet principal au centre ou à droite.

> A Senegalese emergency medical team of two paramedics, a woman and a man in
> navy blue uniforms, calmly helping a patient on a stretcher next to a white
> ambulance with its rear doors open, in a street of Dakar at golden hour,
> subjects centered and slightly to the right, confident and caring
> expressions

### `module-sang` : la banque de sang

> A Senegalese nurse in a white coat and gloves carefully placing labeled
> blood bags into a medical refrigerator in a clean, modern blood bank,
> close-up at mid-distance, soft clinical light with warm accents

### `module-lits` : le lit d'hôpital

> A Senegalese nurse in light blue scrubs preparing a clean hospital bed with
> fresh white sheets in a bright, modern hospital room in Dakar, large window
> with daylight, calm and orderly atmosphere

### `module-ambulance` : l'ambulance en mission

> A white ambulance with emergency lights on driving along a wide avenue in
> Dakar at dusk, slight motion blur on the background, city lights and palm
> trees, cinematic wide shot

### `urgence` : la régulation du SAMU

> A Senegalese emergency dispatcher wearing a headset, focused, working at a
> desk with several screens showing a city map and a list of missions, in a
> dim modern control room lit by the screens, seen from the side

### `don` : le don de sang

Image recadrée en largeur : garder le visage et le bras dans le tiers central.

> A smiling young Senegalese woman donating blood, sitting in a comfortable
> donation chair, a nurse beside her checking the collection bag, bright and
> friendly donation center, reassuring atmosphere, subject in the central third

## Après génération

Déposer les fichiers (PNG ou JPG) dans ce dossier avec le nom du tableau, puis
les convertir en WebP et JPEG compressés (~150 Ko chacun). Indiquer l'outil
utilisé dans `CREDITS.md`.
