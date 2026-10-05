# Opciones de piso para el Sótano (Isaac), en grises para que el plano los coloree. Por código, sin PixelLab.
#   python arte/pixellab/sotano/pisos.py            -> hoja de vista previa (pisos_x4.png)
#   python arte/pixellab/sotano/pisos.py <a|b|c>    -> guarda esa opción como floors/floor_10.png (TileType 11)
import colorsys
import random
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
PISOS = AQUI.parents[2] / 'webview-ui' / 'public' / 'assets' / 'floors'


def gris(v):
    return (v, v, v, 255)


def losas():
    """a) Losas de piedra irregulares con junta oscura (como el piso del sótano del juego)."""
    im = Image.new('RGBA', (16, 16), gris(140))
    junta = [(x, 15) for x in range(16)] + [(15, y) for y in range(16)]
    junta += [(7, y) for y in range(0, 8)] + [(x, 7) for x in range(16)] + [(11, y) for y in range(8, 16)]
    for p in junta:
        im.putpixel(p, gris(72))
    for x, y in [(0, 0), (1, 0), (0, 1), (8, 0), (9, 0), (8, 1), (0, 8), (1, 8), (12, 8), (13, 8), (12, 9)]:
        im.putpixel((x, y), gris(162))  # orilla clara de cada losa
    for x, y in [(4, 4), (11, 3), (5, 11), (9, 13), (13, 12)]:
        im.putpixel((x, y), gris(118))  # desgaste
    return im


def tierra():
    """b) Tierra apisonada con piedritas."""
    random.seed(7)
    im = Image.new('RGBA', (16, 16), gris(122))
    for x, y in [(2, 2), (9, 4), (13, 10), (4, 12), (7, 8)]:
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            im.putpixel(((x + dx) % 16, (y + dy) % 16), gris(108))
    for x, y in [(5, 5), (12, 2), (2, 9), (10, 13), (14, 7)]:
        im.putpixel((x, y), gris(158))
        im.putpixel((x, (y + 1) % 16), gris(88))
    return im


def ladrillos():
    """c) Ladrillo viejo de sótano, hiladas encontradas."""
    im = Image.new('RGBA', (16, 16), gris(132))
    for y in (3, 7, 11, 15):
        for x in range(16):
            im.putpixel((x, y), gris(76))
    for fila, y0 in enumerate((0, 4, 8, 12)):
        corte = 7 if fila % 2 == 0 else 3
        for y in range(y0, y0 + 3):
            im.putpixel((corte, y), gris(76))
            im.putpixel(((corte + 8) % 16, y), gris(76))
        for x in range(16):
            if im.getpixel((x, y0))[0] != 76:
                im.putpixel((x, y0), gris(150))
    return im


OPCIONES = {'a': losas, 'b': tierra, 'c': ladrillos}


def colorear(im, h, s, b, c):
    """Igual que colorizeSprite de la página (modo Colorize)."""
    out = im.copy()
    for y in range(im.height):
        for x in range(im.width):
            r, g, bb, a = im.getpixel((x, y))
            l = (0.299 * r + 0.587 * g + 0.114 * bb) / 255
            l = 0.5 + (l - 0.5) * (100 + c) / 100
            l = max(0, min(1, l + b / 200))
            rr, gg, b2 = colorsys.hls_to_rgb(h / 360, l, s / 100)
            out.putpixel((x, y), (int(rr * 255), int(gg * 255), int(b2 * 255), a))
    return out


COLOR = (26, 26, -30, -10)  # café de sótano, propuesto

if len(sys.argv) > 1:
    OPCIONES[sys.argv[1]]().save(PISOS / 'floor_10.png')
    print('ok floor_10.png =', sys.argv[1])
else:
    hoja = Image.new('RGBA', (3 * 6 * 16 + 2 * 8, 6 * 16), (20, 20, 26, 255))
    for i, f in enumerate(OPCIONES.values()):
        t = colorear(f(), *COLOR)
        for ty in range(6):
            for tx in range(6):
                hoja.paste(t, (i * (96 + 8) + tx * 16, ty * 16))
    hoja.resize((hoja.width * 4, hoja.height * 4), Image.NEAREST).save(AQUI / 'pisos_x4.png')
    print('ok pisos_x4.png')
