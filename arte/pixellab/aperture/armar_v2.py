# Aperture, segunda vuelta (2026-10-05): portales animados y más cosas (Portal, Jurassic Park, Resident Evil).
# Por código (sin PixelLab):
#   PORTAL_BLUE / PORTAL_ORANGE  óvalo con 4 bandas de color que la página rota (kind 'cycle' en ambientFurniture.ts);
#                                los colores DEBEN ser los de PORTAL_*_BANDS en constants.ts
#   BIG_BUTTON    botón rojo gigante de piso (2×1)        CAKE         pastel con vela (1×1)
#   CHAMBER_SIGN  letrero de cámara de pruebas (pared 1×2) APERTURE_STOOL banco blanco (asiento 1×1)
#   EMBRYO_CAN    lata de crema de afeitar con embriones (Jurassic Park, 1×1)
#   GREEN_HERB    hierba verde en maceta (Resident Evil, 1×1)  VIRUS_CASE maletín con viales azules (1×1)
# De PixelLab (originales/, create_image_pixen 32x32, view=side): wheatley.png, maquina_escribir.png, ambar.png
# Uso: python arte/pixellab/aperture/armar_v2.py
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import CONTORNO, abrir, contorno, guardar, recortar_ancho  # noqa: E402


def hexa(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


BANDAS_AZUL = [hexa(c) for c in ('#1f6fd1', '#3f9cf0', '#7cccff', '#2f86e0')]
BANDAS_NARANJA = [hexa(c) for c in ('#e0520c', '#ff8a1e', '#ffbb55', '#f26e14')]


def portal(bandas, orilla):
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    cx, cy, rx, ry = 7.5, 17, 6.5, 13.5
    for y in range(32):
        for x in range(16):
            d = math.hypot((x - cx) / rx, (y - cy) / ry)
            if d > 1:
                continue
            if d > 0.86:
                im.putpixel((x, y), orilla)
            else:
                im.putpixel((x, y), bandas[int(d * 9) % 4])
    return contorno(im)


GRIS, GRIS_OSC, BLANCO = (190, 196, 204, 255), (120, 126, 136, 255), (244, 246, 248, 255)
ROJO, ROJO_LUZ, ROJO_OSC = (220, 36, 40, 255), (255, 110, 100, 255), (150, 20, 30, 255)


def boton():
    im = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((2, 6, 29, 15), fill=GRIS_OSC)  # base
    d.ellipse((2, 5, 29, 13), fill=GRIS)
    d.ellipse((7, 4, 24, 11), fill=ROJO_OSC)  # botón
    d.ellipse((7, 3, 24, 9), fill=ROJO)
    d.line((11, 4, 16, 4), fill=ROJO_LUZ)
    return contorno(im)


def pastel():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 13, 13, 14), fill=GRIS)  # plato
    d.rectangle((3, 7, 12, 12), fill=(92, 52, 34, 255))  # chocolate
    d.line((3, 10, 12, 10), fill=(240, 236, 228, 255))  # relleno
    d.rectangle((3, 6, 12, 7), fill=(240, 236, 228, 255))  # betún
    for x in (4, 7, 10):
        d.point((x, 5), fill=(200, 30, 50, 255))  # cerezas
    d.line((8, 2, 8, 5), fill=(250, 250, 250, 255))  # vela
    d.point((8, 1), fill=(255, 200, 60, 255))
    return contorno(im)


def letrero():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 4, 14, 28), fill=BLANCO)
    d.rectangle((3, 6, 12, 13), fill=(40, 44, 52, 255))  # número grande "19"
    for x, y in [(5, 7), (5, 8), (5, 9), (5, 10), (5, 11), (5, 12)]:
        d.point((x, y), fill=BLANCO)
    d.rectangle((8, 7, 10, 9), outline=BLANCO)
    d.line((10, 10, 10, 12), fill=BLANCO)
    d.line((8, 12, 10, 12), fill=BLANCO)
    d.line((3, 15, 12, 15), fill=GRIS_OSC)  # barra de avance
    d.line((3, 15, 8, 15), fill=(40, 44, 52, 255))
    for i, x in enumerate((3, 7, 11)):  # íconos: cubo, agua, torreta
        d.rectangle((x, 18, x + 2, 20), fill=(40, 44, 52, 255))
        d.rectangle((x, 23, x + 2, 25), fill=(40, 44, 52, 255) if i != 1 else (230, 120, 20, 255))
    return contorno(im)


def banco():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((7, 8, 8, 13), fill=GRIS_OSC)
    d.ellipse((3, 3, 12, 8), fill=BLANCO)
    d.line((4, 7, 11, 7), fill=GRIS)
    d.ellipse((4, 12, 11, 14), fill=GRIS)
    return contorno(im)


def lata():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((5, 4, 10, 14), fill=(232, 232, 236, 255))  # lata blanca
    d.rectangle((5, 7, 10, 10), fill=(200, 40, 40, 255))  # franja roja
    d.line((6, 8, 9, 8), fill=(40, 90, 200, 255))  # y azul
    d.rectangle((6, 2, 9, 3), fill=GRIS_OSC)  # tapa
    d.line((10, 4, 10, 14), fill=GRIS)
    return contorno(im)


def hierba():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(4, 10), (11, 10), (10, 14), (5, 14)], fill=(176, 100, 60, 255))  # maceta
    d.line((4, 10, 11, 10), fill=(204, 128, 84, 255))
    verde, claro = (60, 160, 60, 255), (120, 210, 90, 255)
    for x0, y0, x1, y1 in [(7, 9, 4, 4), (8, 9, 11, 3), (7, 9, 7, 2), (8, 9, 12, 6)]:
        d.line((x0, y0, x1, y1), fill=verde)
    for x, y in [(4, 4), (11, 3), (7, 2), (12, 6), (5, 6), (10, 5)]:
        d.point((x, y), fill=claro)
    return contorno(im)


def maletin():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 6, 14, 14), fill=(180, 186, 196, 255))  # maletín plateado abierto
    d.rectangle((2, 7, 13, 13), fill=(40, 40, 48, 255))  # hule negro
    for x in (4, 7, 10):  # viales azules brillantes
        d.rectangle((x, 8, x + 1, 12), fill=(80, 200, 255, 255))
        d.point((x, 8), fill=(220, 250, 255, 255))
    d.rectangle((1, 2, 14, 5), fill=(150, 156, 168, 255))  # tapa levantada
    return contorno(im)


guardar('PORTAL_BLUE', 'Portal azul', portal(BANDAS_AZUL, (210, 240, 255, 255)), 1, 2, category='wall',
        canPlaceOnWalls=True)
guardar('PORTAL_ORANGE', 'Portal naranja', portal(BANDAS_NARANJA, (255, 236, 196, 255)), 1, 2, category='wall',
        canPlaceOnWalls=True)
guardar('BIG_BUTTON', 'Botón rojo gigante', boton(), 2, 1)
guardar('CAKE', 'Pastel', pastel(), 1, 1)
guardar('CHAMBER_SIGN', 'Letrero de cámara de pruebas', letrero(), 1, 2, category='wall', canPlaceOnWalls=True)
guardar('APERTURE_STOOL', 'Banco de Aperture', banco(), 1, 1, category='chairs')
guardar('EMBRYO_CAN', 'Lata de embriones', lata(), 1, 1)
guardar('GREEN_HERB', 'Hierba verde', hierba(), 1, 1)
guardar('VIRUS_CASE', 'Maletín de viales', maletin(), 1, 1)

ORIGINALES = {'wheatley.png': ('WHEATLEY', 'Núcleo con ojo azul', 2, 2, dict(category='wall', canPlaceOnWalls=True)),
              'maquina_escribir.png': ('TYPEWRITER', 'Máquina de escribir', 2, 2, dict(backgroundTiles=1)),
              'ambar.png': ('AMBER_PEDESTAL', 'Mosquito en ámbar', 2, 2, dict(backgroundTiles=1))}
for archivo, (id_, nombre, fw, fh, extra) in ORIGINALES.items():
    if (AQUI / 'originales' / archivo).exists():
        im = abrir(AQUI, archivo)
        if fw == 1:
            im = recortar_ancho(im, 16)
        guardar(id_, nombre, im, fw, fh, **extra)

# Hoja de vista previa
piezas = [portal(BANDAS_AZUL, (210, 240, 255, 255)), portal(BANDAS_NARANJA, (255, 236, 196, 255)), boton(), pastel(),
          letrero(), banco(), lata(), hierba(), maletin()]
hoja = Image.new('RGBA', (sum(p.width + 3 for p in piezas), 32), (200, 204, 210, 255))
x = 0
for p in piezas:
    hoja.alpha_composite(p, (x, 32 - p.height))
    x += p.width + 3
hoja.resize((hoja.width * 6, hoja.height * 6), Image.NEAREST).save(AQUI / 'v2_x6.png')
