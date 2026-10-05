"""Hoja de Wheatley (becario de Chell): esfera que flota, sin piernas. Mismo formato que armar.py (8 cuadros de 24x44
x 3 direcciones). Sale de 3 imágenes de PixelLab (frente, espalda, lado) y todo el movimiento es por código:
  - caminar: sube y baja (0, -1, -2, -1 px);
  - teclear / leer: flota quieto con un vaivén de 1 px y el ojo brilla más en un cuadro sí y en otro no.
Uso: python armar_wheatley.py   -> wheatley/hoja.png y wheatley/hoja_x8.png
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent / 'wheatley'
W, H = 24, 44
ABAJO = 30  # última fila de la esfera: flota a la altura de la cabeza de los demás
OJO_BRILLO = (170, 255, 255)
FONDO = (70, 70, 90, 255)


def es_ojo(c):
    r, g, b, a = c
    return a and b > 180 and g > 150 and r < 140


def brillar(im):
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if es_ojo(px[x, y]):
                px[x, y] = OJO_BRILLO + (255,)
    return out


def a_cuadro(im, dy):
    x0, y0, x1, y1 = im.getbbox()
    pieza = im.crop((x0, y0, x1, y1))
    cuadro = Image.new('RGBA', (W, H))
    cuadro.alpha_composite(pieza, ((W - pieza.width) // 2, ABAJO - pieza.height + dy))
    return cuadro


hoja = Image.new('RGBA', (W * 8, H * 3))
for fila, nombre in enumerate(('frente', 'espalda', 'lado')):
    im = Image.open(AQUI / f'{nombre}.png').convert('RGBA')
    cuadros = [a_cuadro(im, dy) for dy in (0, -1, -2, -1)]  # caminar
    cuadros += [a_cuadro(brillar(im), 0), a_cuadro(im, -1)]  # teclear
    cuadros += [a_cuadro(im, 0), a_cuadro(brillar(im), 0)]  # leer
    for col, c in enumerate(cuadros):
        hoja.alpha_composite(c, (col * W, fila * H))
hoja.save(AQUI / 'hoja.png')
vista = Image.new('RGBA', hoja.size, FONDO)
vista.alpha_composite(hoja)
vista.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(AQUI / 'hoja_x8.png')
print('wheatley', hoja.size)
