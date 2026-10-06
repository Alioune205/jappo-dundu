"""
Génère les déclinaisons du logo Jappo Dundu à partir de l'image fournie (fond blanc).
Usage : python logo_assets.py <logo.png> <racine du dépôt>
"""
import os
import sys

import numpy as np
from PIL import Image

SRC, ROOT = sys.argv[1], sys.argv[2]
WEB = os.path.join(ROOT, 'frontend', 'public')
MOB = os.path.join(ROOT, 'mobile', 'assets')

rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)

# --- Fond blanc -> transparence (« couleur vers alpha ») -----------------
# Les aplats du logo (rouge, marine) restent opaques ; seuls les bords
# anticrénelés deviennent semi-transparents. Le grain du fond (<= 8) est effacé.
alpha = np.clip((255.0 - rgb.min(axis=2) - 8.0) / 160.0, 0, 1)
safe = np.where(alpha > 0, alpha, 1)
color = (rgb - 255.0 * (1 - alpha[..., None])) / safe[..., None]
color = np.clip(color, 0, 255)
rgba = np.dstack([color, alpha * 255]).astype(np.uint8)
logo = Image.fromarray(rgba, 'RGBA')

# Couleurs de référence (moyennes des pixels pleins)
solid = alpha > 0.95
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
red_mask = solid & (r > 150) & (g < 90)
navy_mask = solid & (b > r + 30) & (r < 60)
red = rgb[red_mask].mean(axis=0)
navy = rgb[navy_mask].mean(axis=0)
hexc = lambda c: '#%02X%02X%02X' % tuple(int(round(v)) for v in c)
print('rouge', hexc(red), 'marine', hexc(navy))


def bbox(img, y0=0, y1=None):
    a = np.asarray(img)[..., 3]
    a = a[y0:y1]
    ys, xs = np.nonzero(a > 10)
    return xs.min(), ys.min() + y0, xs.max() + 1, ys.max() + 1 + y0


def pad_square(img, margin):
    w, h = img.size
    side = int(max(w, h) * (1 + 2 * margin))
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return out


def on_background(img, size, fill, scale):
    """Symbole centré sur fond plein, occupant `scale` du côté."""
    out = Image.new('RGBA', (size, size), fill)
    inner = int(size * scale)
    mark = img.copy()
    mark.thumbnail((inner, inner), Image.LANCZOS)
    out.paste(mark, ((size - mark.width) // 2, (size - mark.height) // 2), mark)
    return out


def recolor_navy(img, to):
    """Variante thème sombre : le bleu marine devient clair, le rouge reste."""
    arr = np.asarray(img).astype(np.float64).copy()
    c = arr[..., :3]
    navyish = (c[..., 2] > c[..., 0] + 20)
    arr[navyish, 0], arr[navyish, 1], arr[navyish, 2] = to
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def silhouette(img, color=(255, 255, 255)):
    a = np.asarray(img)[..., 3]
    out = np.zeros(a.shape + (4,), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = color
    out[..., 3] = a
    return Image.fromarray(out, 'RGBA')


# Bandes du logo (repérées sur l'image) : symbole 134-763, nom 796-968, devise 993-1023
full = logo.crop(bbox(logo))
mark = logo.crop(bbox(logo, 100, 780))
full_dark = recolor_navy(full, (241, 245, 249))
mark_dark = recolor_navy(mark, (241, 245, 249))

# --- Web --------------------------------------------------------------
os.makedirs(WEB, exist_ok=True)
for img, name, width in [(full, 'logo.png', 720), (full_dark, 'logo-dark.png', 720)]:
    out = img.copy()
    out.thumbnail((width, width), Image.LANCZOS)
    out.save(os.path.join(WEB, name), optimize=True)
for img, name in [(mark, 'logo-mark.png'), (mark_dark, 'logo-mark-dark.png')]:
    out = pad_square(img, 0.02)
    out.thumbnail((256, 256), Image.LANCZOS)
    out.save(os.path.join(WEB, name), optimize=True)
on_background(mark, 64, (255, 255, 255, 0), 1.0).save(os.path.join(WEB, 'favicon.png'), optimize=True)
on_background(mark, 180, (255, 255, 255, 255), 0.78).convert('RGB').save(
    os.path.join(WEB, 'apple-touch-icon.png'), optimize=True
)

# --- Mobile -----------------------------------------------------------
pad_square(mark, 0.02).resize((512, 512), Image.LANCZOS).save(os.path.join(MOB, 'logo-mark.png'), optimize=True)
pad_square(mark_dark, 0.02).resize((512, 512), Image.LANCZOS).save(
    os.path.join(MOB, 'logo-mark-dark.png'), optimize=True
)
# Icône iOS / générique : fond blanc, symbole à 72 %
on_background(mark, 1024, (255, 255, 255, 255), 0.72).convert('RGB').save(os.path.join(MOB, 'icon.png'), optimize=True)
# Android adaptatif : premier plan transparent, symbole dans la zone sûre (≈ 60 %)
on_background(mark, 1024, (0, 0, 0, 0), 0.6).save(os.path.join(MOB, 'android-icon-foreground.png'), optimize=True)
on_background(silhouette(mark), 1024, (0, 0, 0, 0), 0.6).save(
    os.path.join(MOB, 'android-icon-monochrome.png'), optimize=True
)
# Notification Android : silhouette blanche obligatoire
on_background(silhouette(mark), 96, (0, 0, 0, 0), 0.86).save(os.path.join(MOB, 'notification-icon.png'), optimize=True)
on_background(mark, 48, (0, 0, 0, 0), 1.0).save(os.path.join(MOB, 'favicon.png'), optimize=True)
# Écran de démarrage natif
pad_square(mark, 0.02).resize((576, 576), Image.LANCZOS).save(os.path.join(MOB, 'splash-mark.png'), optimize=True)
pad_square(mark_dark, 0.02).resize((576, 576), Image.LANCZOS).save(os.path.join(MOB, 'splash-mark-dark.png'), optimize=True)
print('ok')
