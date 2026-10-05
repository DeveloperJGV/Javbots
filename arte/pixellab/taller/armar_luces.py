# Taller, tercera tanda (2026-10-04): luces de taller y bahías. Todo por código, sin PixelLab.
#   WORK_LIGHT  reflector de obra en tripié (piso 1×2): reemplaza las lámparas de pie de sala
#   NEON_88     neón "88" (pared 1×1): parpadea y alumbra de noche (ambientFurniture.ts / lighting.ts)
#   carpet_3    línea amarilla de bahía (alfombra que se pisa; el color lo pone el plano)
# Uso: python arte/pixellab/taller/armar_luces.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import contorno, guardar  # noqa: E402

ALFOMBRAS = AQUI.parents[2] / 'webview-ui' / 'public' / 'assets' / 'carpets'


# ── Reflector de obra en tripié (16×32) ───────────────────────────
AMARILLO, AMARILLO_OSC = (246, 196, 40, 255), (196, 140, 28, 255)
VIDRIO, VIDRIO_LUZ, REJA = (255, 240, 170, 255), (255, 255, 235, 255), (70, 72, 80, 255)
METAL, METAL_LUZ, METAL_OSC = (128, 133, 143, 255), (176, 181, 190, 255), (84, 88, 98, 255)


def reflector():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((3, 6, 12, 13), fill=AMARILLO)  # carcasa
    d.line((3, 13, 12, 13), fill=AMARILLO_OSC)
    d.rectangle((5, 7, 10, 11), fill=VIDRIO)  # vidrio
    d.line((6, 8, 7, 8), fill=VIDRIO_LUZ)
    d.line((5, 9, 10, 9), fill=REJA)  # reja
    d.line((7, 7, 7, 11), fill=REJA)
    d.line((9, 7, 9, 11), fill=REJA)
    d.line((2, 9, 2, 11), fill=METAL_OSC)  # perillas del yugo
    d.line((13, 9, 13, 11), fill=METAL_OSC)
    d.rectangle((7, 14, 8, 23), fill=METAL)  # poste
    d.line((7, 14, 7, 23), fill=METAL_LUZ)
    d.rectangle((6, 21, 9, 22), fill=METAL_OSC)  # abrazadera
    d.line((7, 24, 3, 29), fill=METAL)  # patas
    d.line((8, 24, 12, 29), fill=METAL)
    d.line((7, 24, 7, 27), fill=METAL_OSC)  # la de atrás, más corta
    d.point([(3, 30), (12, 30)], fill=METAL_OSC)
    return contorno(im)


# ── Neón "88" (16×16, pared) ──────────────────────────────────────
# Colores exactos: constants.ts NEON_CORE / NEON_GLOW (y sus versiones apagadas)
NEON_CORE, NEON_GLOW = (255, 158, 230, 255), (214, 52, 160, 255)
TABLA, TABLA_LUZ, TORNILLO = (34, 28, 48, 255), (52, 44, 70, 255), (120, 124, 132, 255)
OCHO = ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.']


def neon_88():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 2, 14, 13), fill=TABLA)
    d.line((2, 3, 13, 3), fill=TABLA_LUZ)
    tubo = set()
    for x0 in (2, 9):
        for dy, fila in enumerate(OCHO):
            for dx, ch in enumerate(fila):
                if ch == '#':
                    tubo.add((x0 + dx, 5 + dy))
    for x, y in tubo:  # resplandor: el tubo se refleja abajo a la derecha en la tabla
        if (x + 1, y + 1) not in tubo:
            im.putpixel((x + 1, y + 1), NEON_GLOW)
    for p in tubo:
        im.putpixel(p, NEON_CORE)
    d.point([(2, 12), (13, 12)], fill=TORNILLO)
    return contorno(im)


# ── Alfombra "línea de bahía" ─────────────────────────────────────
def linea_bahia():
    """De carpet_0: se queda solo con su línea clara (la orilla) y lo demás transparente."""
    base = Image.open(ALFOMBRAS / 'carpet_0.png').convert('RGBA')
    px = base.load()
    claros = {px[x, y] for y in range(base.height) for x in range(base.width) if px[x, y][3]}
    claro = max(claros, key=lambda c: c[0] + c[1] + c[2])
    out = Image.new('RGBA', base.size, (0, 0, 0, 0))
    for y in range(base.height):
        for x in range(base.width):
            if px[x, y] == claro:
                out.putpixel((x, y), (255, 255, 255, 255))
    return out


guardar('WORK_LIGHT', 'Reflector de taller', reflector(), 1, 2, category='decor', backgroundTiles=1)
guardar('NEON_88', 'Neón 88', neon_88(), 1, 1, category='wall', canPlaceOnWalls=True)
linea_bahia().save(ALFOMBRAS / 'carpet_3.png')
print('ok carpet_3')

# Vista previa ampliada
hoja = Image.new('RGBA', (16 * 2 + 4 + 64, 64), (60, 62, 70, 255))
hoja.paste(reflector(), (0, 0), reflector())
hoja.paste(neon_88(), (18, 0), neon_88())
hoja.paste(linea_bahia(), (36, 0), linea_bahia())
hoja.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(AQUI / 'luces_x8.png')
