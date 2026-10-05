# Totoro petrificado, segunda versión (2026-10-06). La primera (gris con a_piedra) parecía peluche: Totoro ya es gris.
# Ahora: piedra arenosa verdosa (como los petrificados de Dr. Stone), textura, grietas marcadas en cara y panza,
# musgo y base de piedra como la de Goku. 2×3 = 32×48 (la figura no se reduce: se le agrega la base abajo).
# Uso: python arte/pixellab/senku/totoro_piedra.py
import random
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import CONTORNO, abrir, guardar  # noqa: E402

# Rampa de piedra cálida-verdosa, de sombra a luz
RAMPA = [(74, 76, 62, 255), (104, 106, 86, 255), (134, 134, 110, 255), (162, 160, 132, 255), (190, 186, 156, 255)]
GRIETA, ORILLA = (46, 46, 38, 255), (214, 210, 180, 255)
MUSGO, MUSGO_LUZ = (78, 112, 56, 255), (110, 146, 70, 255)
BASE = 9  # alto de la base en pixeles


def luz(p):
    return (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000


def a_piedra(im, rnd):
    out = im.copy()
    px = out.load()
    vals = sorted(luz(px[x, y]) for y in range(im.height) for x in range(im.width) if px[x, y][3] and luz(px[x, y]) > 60)
    cortes = [vals[int(len(vals) * f)] for f in (0.15, 0.4, 0.65, 0.85)]
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if not p[3]:
                continue
            l = luz(p)
            if l <= 60:  # contorno y rasgos oscuros
                px[x, y] = CONTORNO if l < 40 else RAMPA[0]
                continue
            k = sum(l > c for c in cortes)
            if rnd.random() < 0.08:  # textura de piedra
                k = max(0, min(4, k + rnd.choice((-1, 1))))
            px[x, y] = RAMPA[k]
    return out


def grieta(px, puntos):
    for x, y in puntos:
        if px[x, y][3] and px[x, y] != CONTORNO:
            px[x, y] = GRIETA
            if px[x + 1, y][3] and px[x + 1, y] not in (CONTORNO, GRIETA):
                px[x + 1, y] = ORILLA  # canto astillado


def totoro():
    rnd = random.Random(5)
    fig = a_piedra(abrir(AQUI, 'estatua_totoro.png'), rnd)
    px = fig.load()
    # Grietas estilo Dr. Stone: una baja por la frente y la mejilla, otra cruza la panza, otra en la oreja
    grieta(px, [(15, 3), (15, 4), (14, 5), (14, 6), (13, 7), (13, 8), (12, 9), (12, 10)])
    grieta(px, [(20, 16), (19, 17), (18, 18), (18, 19), (17, 20), (16, 21), (16, 22), (15, 23)])
    grieta(px, [(25, 2), (24, 3), (24, 4)])
    grieta(px, [(7, 18), (8, 19), (8, 20), (9, 21)])
    for x, y in [(10, 3), (11, 3), (12, 3), (11, 2), (20, 3), (21, 3), (5, 27), (6, 27), (25, 28), (26, 27)]:
        if px[x, y][3] and px[x, y] != CONTORNO:
            px[x, y] = MUSGO if (x + y) % 2 else MUSGO_LUZ
    im = Image.new('RGBA', (32, 48), (0, 0, 0, 0))
    _, _, _, y1 = fig.getbbox()
    im.alpha_composite(fig, (0, 48 - BASE - y1 + 1))
    # Base de piedra
    for y in range(48 - BASE, 48):
        for x in range(3, 29):
            borde = x in (3, 28) or y in (48 - BASE, 47)
            im.putpixel((x, y), CONTORNO if borde else (RAMPA[3] if y == 48 - BASE + 1 else RAMPA[1]))
    for x, y in [(8, 43), (9, 44), (20, 42), (21, 43), (22, 43)]:
        im.putpixel((x, y), GRIETA)
    return im


im = totoro()
guardar('STATUE_TOTORO', 'Estatua del espíritu del bosque', im, 2, 3, backgroundTiles=1)
im.resize((320, 480), Image.NEAREST).save(AQUI / 'totoro_x10.png')
