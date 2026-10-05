# GIF de revisión de una hoja armada: caminar (1-2-3-4) en las 4 direcciones, teclear y leer, ampliado x6.
# Uso: python gif.py <personaje>   -> <personaje>/vista.gif
import sys
from pathlib import Path

from PIL import Image, ImageOps

W, H, ESC = 24, 44, 6
FONDO = (70, 70, 90, 255)
hoja = Image.open(Path(sys.argv[1]) / 'hoja.png').convert('RGBA')


def c(fila, col, voltear=False):
    im = hoja.crop((col * W, fila * H, col * W + W, fila * H + H))
    return ImageOps.mirror(im) if voltear else im


cuadros = []
for paso in range(8):
    k = paso % 4
    t = 4 + paso % 2
    r = 6 + (paso // 2) % 2
    fila1 = [c(0, k), c(1, k), c(2, k), c(2, k, True)]
    fila2 = [c(0, t), c(1, t), c(2, t), c(0, r), c(1, r), c(2, r)]
    lienzo = Image.new('RGBA', (6 * (W + 4) + 4, 2 * (H + 4) + 4), FONDO)
    for i, im in enumerate(fila1):
        lienzo.alpha_composite(im, (4 + i * (W + 4), 4))
    for i, im in enumerate(fila2):
        lienzo.alpha_composite(im, (4 + i * (W + 4), H + 8))
    cuadros.append(lienzo.resize((lienzo.width * ESC, lienzo.height * ESC), Image.NEAREST).convert('RGB'))
salida = Path(sys.argv[1]) / 'vista.gif'
cuadros[0].save(salida, save_all=True, append_images=cuadros[1:], duration=180, loop=0)
print(salida)
