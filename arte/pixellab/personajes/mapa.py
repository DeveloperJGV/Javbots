# Imprime un cuadro como mapa de letras (una por color) para ubicar a ojo filas de piernas, manos y barbilla.
# Uso: python mapa.py <png> [<png> ...]
import sys

from PIL import Image

for ruta in sys.argv[1:]:
    im = Image.open(ruta).convert('RGBA')
    x0, y0, x1, y1 = im.getbbox()
    letras = {}
    print(ruta, 'bbox', (x0, y0, x1, y1))
    for y in range(y0, y1):
        fila = ''
        for x in range(x0 - 1, x1 + 1):
            p = im.getpixel((x, y))
            if not p[3]:
                fila += '.'
                continue
            if p[:3] not in letras:
                n = len(letras)
                letras[p[:3]] = chr(97 + n) if n < 26 else chr(65 + n - 26)
            fila += letras[p[:3]]
        print(f'{y:2d} {fila}')
    print({v: k for k, v in letras.items()})
