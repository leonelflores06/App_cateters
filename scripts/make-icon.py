"""Genera los íconos de Stock Catéteres en la carpeta indicada: una cánula IV en diagonal + cruz médica.

Uso: python3 scripts/make-icon.py assets   (requiere Pillow)
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
SS = 4  # supersampling para bordes suaves
BLUE_TOP = (16, 150, 196)
BLUE_BOTTOM = (8, 92, 126)
WHITE = (255, 255, 255, 255)
HUB = (255, 143, 163, 255)  # rosa: color del conector de un 20G
SHADOW = (0, 40, 60, 90)


def gradient(size):
    im = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(BLUE_TOP[i] * (1 - t) + BLUE_BOTTOM[i] * t) for i in range(3)) + (255,)
        d.line([(0, y), (size, y)], fill=c)
    return im


def cannula_layer(w, mono=False):
    """Cánula horizontal (punta a la derecha) en una capa transparente de w x w/2."""
    h = w // 2
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cy = h // 2
    u = w / 100.0  # unidad
    white = WHITE
    hub = WHITE if mono else HUB

    # tapón trasero
    d.rounded_rectangle([4 * u, cy - 7 * u, 16 * u, cy + 7 * u], radius=3 * u, fill=white)
    # cámara (flashback) con ventana
    d.rounded_rectangle([15 * u, cy - 5.5 * u, 36 * u, cy + 5.5 * u], radius=2.5 * u, fill=white)
    if not mono:
        d.rounded_rectangle([19 * u, cy - 2.5 * u, 32 * u, cy + 2.5 * u], radius=1.5 * u, fill=(255, 107, 107, 255))
    # conector (hub) con aletas
    d.polygon([(40 * u, cy - 6 * u), (52 * u, cy - 6 * u), (49 * u, cy - 21 * u), (43 * u, cy - 21 * u)], fill=hub)
    d.polygon([(40 * u, cy + 6 * u), (52 * u, cy + 6 * u), (49 * u, cy + 21 * u), (43 * u, cy + 21 * u)], fill=hub)
    d.rounded_rectangle([35 * u, cy - 7.5 * u, 58 * u, cy + 7.5 * u], radius=3 * u, fill=hub)
    # catéter (tubo flexible)
    d.polygon([(58 * u, cy - 4 * u), (80 * u, cy - 2.6 * u), (80 * u, cy + 2.6 * u), (58 * u, cy + 4 * u)], fill=white)
    # aguja con bisel
    d.rectangle([79 * u, cy - 1.4 * u, 90 * u, cy + 1.4 * u], fill=white)
    d.polygon([(90 * u, cy - 1.4 * u), (97 * u, cy + 1.4 * u), (90 * u, cy + 1.4 * u)], fill=white)
    return im


def cross(size, color):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    a = size * 0.34
    r = size * 0.08
    d.rounded_rectangle([a, 0, size - a, size], radius=r, fill=color)
    d.rounded_rectangle([0, a, size, size - a], radius=r, fill=color)
    return im


def glyph(size, mono=False, shadow=True):
    """Dibujo completo (cánula diagonal + cruz) sobre transparente, ocupando todo `size`."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    can = cannula_layer(int(S * 1.0), mono).rotate(40, expand=True, resample=Image.BICUBIC)
    x = (S - can.width) // 2 + int(S * 0.04)
    y = (S - can.height) // 2 + int(S * 0.06)
    if shadow and not mono:
        sh = Image.new('RGBA', can.size, (0, 0, 0, 0))
        sh.paste(SHADOW, mask=can.split()[3])
        sh = sh.filter(ImageFilter.GaussianBlur(S * 0.012))
        im.alpha_composite(sh, (x + int(S * 0.012), y + int(S * 0.02)))
    im.alpha_composite(can, (x, y))
    cs = int(S * 0.24)
    im.alpha_composite(cross(cs, WHITE), (int(S * 0.15), int(S * 0.15)))
    return im.resize((size, size), Image.LANCZOS)


def place(canvas, g, scale):
    n = int(canvas.width * scale)
    gg = g.resize((n, n), Image.LANCZOS)
    o = (canvas.width - n) // 2
    canvas.alpha_composite(gg, (o, o))
    return canvas


big = glyph(1024)
mono = glyph(1024, mono=True, shadow=False)


def extent(g):
    """Distancia máxima (fracción del lado) desde el centro a un píxel visible."""
    a = g.split()[3].point(lambda v: 255 if v > 40 else 0)
    px = a.load()
    n = g.width
    best = 0
    for y in range(0, n, 4):
        for x in range(0, n, 4):
            if px[x, y]:
                d = ((x - n / 2) ** 2 + (y - n / 2) ** 2) ** 0.5
                best = max(best, d)
    return best / n


R = extent(big)
SAFE = 0.31  # radio de la zona segura de Android (66 dp de 108 dp de diámetro), con un poco de margen
FG = SAFE / R
print('extent', round(R, 3), 'fg scale', round(FG, 3))

# Ícono clásico (cuadrado completo, Android lo recorta)
icon = place(gradient(1024), big, min(0.86, 0.45 / R))
icon.convert('RGB').save(f'{OUT}/icon.png')

# Adaptativo: el dibujo dentro de la zona segura (~61% central)
fg = place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), big, FG)
fg.save(f'{OUT}/android-icon-foreground.png')
gradient(1024).save(f'{OUT}/android-icon-background.png')
place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), mono, FG).save(f'{OUT}/android-icon-monochrome.png')

# Splash y favicon
place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), big, 0.9).save(f'{OUT}/splash-icon.png')
icon.resize((48, 48), Image.LANCZOS).save(f'{OUT}/favicon.png')

# Vista previa: ícono, recorte circular (como en el celular) y monocromo sobre gris
prev = Image.new('RGBA', (1024 * 3 + 80, 1064), (240, 240, 240, 255))
prev.alpha_composite(icon, (20, 20))
circ = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
m = Image.new('L', (1024, 1024), 0)
ImageDraw.Draw(m).ellipse([0, 0, 1023, 1023], fill=255)
full = place(gradient(1024), big, FG)
vis = full.crop((171, 171, 853, 853)).resize((1024, 1024), Image.LANCZOS)  # Android muestra 72 de 108 dp
circ.paste(vis, mask=m)
prev.alpha_composite(circ, (1064, 20))
gray = Image.new('RGBA', (1024, 1024), (60, 60, 60, 255))
monofull = place(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), mono, FG).crop((171, 171, 853, 853)).resize((1024, 1024), Image.LANCZOS)
gray.alpha_composite(monofull)
prev.alpha_composite(gray, (2108, 20))
prev.convert('RGB').resize((prev.width // 2, prev.height // 2), Image.LANCZOS).save(f'{OUT}/preview.png')
print('ok')
