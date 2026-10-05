# GIF con todos los personajes aprobados, lado a lado, caminando de frente/lado/espaldas y luego teclear y leer.
# Uso: python juntos.py <personaje> [...]   -> juntos.gif
import sys
from pathlib import Path

from PIL import Image, ImageOps

W, H, ESC = 24, 44, 4
FONDO = (70, 70, 90, 255)
hojas = [Image.open(Path(n) / 'hoja.png').convert('RGBA') for n in sys.argv[1:]]


def c(h, fila, col, voltear=False):
    im = h.crop((col * W, fila * H, col * W + W, fila * H + H))
    return ImageOps.mirror(im) if voltear else im


cuadros = []
for t in range(32):
    fase = t // 8  # 0 frente, 1 lado, 2 espaldas, 3 sentado
    lienzo = Image.new('RGBA', (len(hojas) * (W + 4) + 4, H + 8), FONDO)
    for i, h in enumerate(hojas):
        if fase < 3:
            im = c(h, [0, 2, 1][fase], t % 4)
        else:
            im = c(h, 0, 4 + t % 2) if t % 8 < 4 else c(h, 0, 6 + (t // 2) % 2)
        lienzo.alpha_composite(im, (4 + i * (W + 4), 4))
    cuadros.append(lienzo.resize((lienzo.width * ESC, lienzo.height * ESC), Image.NEAREST).convert('RGB'))
cuadros[0].save('juntos.gif', save_all=True, append_images=cuadros[1:], duration=170, loop=0)
