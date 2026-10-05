# Moto de Kaneda (Akira), de perfil hacia la derecha (piso 3×2 = 48×32).
# Base: originales/moto_b.png (create_image_pixen 48x32, view=side; salió como moto deportiva). Retoque por código:
# el motor y el cuadro negros entre las llantas se rellenan de rojo (carrocería cerrada, como la de Kaneda) y se le
# ponen calcomanías blancas. moto_a (deportiva) y moto_c (salió coche) no se usan. 3 generaciones gastadas.
# Uso: python arte/pixellab/taller/moto_kaneda.py
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, guardar  # noqa: E402

ROJO, ROJO_OSC = (214, 38, 42, 255), (158, 24, 32, 255)
BLANCO = (240, 240, 232, 255)


def es_rojo(p):
    return p[3] and p[0] > p[1] + 60


def moto():
    im = abrir(AQUI, 'moto_b.png')
    px = im.load()
    src = im.copy().load()
    for y in range(11, 23):
        for x in range(14, 35):
            p = src[x, y]
            if not p[3] or es_rojo(p):
                continue
            borde = any(not src[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if borde or (y == 22):  # se queda el contorno de afuera y la línea de abajo
                continue
            px[x, y] = ROJO_OSC if y >= 19 else ROJO
    for _ in range(2):  # manchitas oscuras sueltas dentro de lo rojo (no toca el parabrisas ni las llantas)
        src = im.copy().load()
        for y in range(9, 22):
            for x in range(10, 45):
                p = src[x, y]
                if not p[3] or es_rojo(p):
                    continue
                rojos = [src[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if es_rojo(src[x + dx, y + dy])]
                if len(rojos) >= 3:
                    px[x, y] = rojos[0]
    for x, y in ((18, 14), (19, 14), (21, 15), (26, 17), (27, 17), (29, 16)):  # calcomanías
        px[x, y] = BLANCO
    return im


im = moto()
guardar('KANEDA_BIKE', 'Moto de Kaneda', im, 3, 2, backgroundTiles=1)
im.resize((480, 320), Image.NEAREST).save(AQUI / 'moto_kaneda_x10.png')
