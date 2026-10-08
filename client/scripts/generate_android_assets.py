"""Génère les icônes et écrans de démarrage Android de THAONI APP à partir du logo.

    pip install pillow
    python3 client/scripts/generate_android_assets.py

Source : client/public/assets/logoresto.png. À relancer après tout changement de logo,
puis recompiler l'APK.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public/assets/logoresto.png"
RES = ROOT / "android/app/src/main/res"
NAVY = (11, 19, 36, 255)  # fond du logo (#0B1324)

# Dessin du logo (cloche + nom) détouré : le fond bleu nuit devient transparent
logo = Image.open(LOGO).convert("RGBA")
art = logo.crop((85, 48, 438, 459))
px = art.load()
for y in range(art.height):
    for x in range(art.width):
        r, g, b, a = px[x, y]
        alpha = max(0, min(255, int((max(r, g, b) - 30) * 255 / 45)))
        px[x, y] = (r, g, b, min(a, alpha))


def placed(size: tuple[int, int], scale: float, background=NAVY) -> Image.Image:
    """Dessin centré sur un fond uni, sa plus grande dimension = scale × le plus petit côté."""
    canvas = Image.new("RGBA", size, background)
    target = int(min(size) * scale)
    ratio = target / max(art.size)
    a = art.resize((max(1, int(art.width * ratio)), max(1, int(art.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(a, ((size[0] - a.width) // 2, (size[1] - a.height) // 2))
    return canvas


def masked(img: Image.Image, shape: str) -> Image.Image:
    s = img.width
    m = Image.new("L", (s * 4, s * 4), 0)
    d = ImageDraw.Draw(m)
    if shape == "round":
        d.ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s * 4 - 1, s * 4 - 1), radius=s * 4 // 5, fill=255)
    out = img.copy()
    out.putalpha(m.resize((s, s), Image.LANCZOS))
    return out


densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, k in densities.items():
    d = RES / f"mipmap-{name}"
    legacy = int(48 * k)
    masked(placed((legacy, legacy), 0.78), "square").save(d / "ic_launcher.png", optimize=True)
    masked(placed((legacy, legacy), 0.70), "round").save(d / "ic_launcher_round.png", optimize=True)
    # Icône adaptative (Android 8+) : 108 dp, zone sûre de 66 dp au centre
    fg = int(108 * k)
    placed((fg, fg), 0.58, background=(0, 0, 0, 0)).save(d / "ic_launcher_foreground.png", optimize=True)

# Écrans de démarrage : logo centré sur le bleu nuit, mêmes dimensions que les fichiers existants
for splash in RES.glob("drawable*/splash.png"):
    size = Image.open(splash).size
    placed(size, 0.42).convert("RGB").save(splash, optimize=True)

(RES / "values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B1324</color>\n</resources>\n'
)
print("Icônes et écrans de démarrage THAONI APP générés.")
