# Hoja de revision: todos los cuadros de animacion de un personaje bajado con bajar.py, ampliados x8,
# una fila por animacion/direccion, con la caja ocupada de cada cuadro impresa en consola.
#
# Uso: python ver_anim.py <carpeta_del_personaje>   (ej. doc/base)
import sys
from pathlib import Path

from PIL import Image

base = Path(sys.argv[1]) / 'zip' / 'Idle' / 'animations'
filas = []
for anim in sorted(base.iterdir()):
    for d in sorted(anim.iterdir()):
        cuadros = [Image.open(f).convert('RGBA') for f in sorted(d.glob('frame_*.png'))]
        print(anim.name, d.name, [c.getbbox() for c in cuadros])
        filas.append(cuadros)
w, h = filas[0][0].size
cols = max(len(f) for f in filas)
hoja = Image.new('RGBA', (cols * (w + 2), len(filas) * (h + 2)), (70, 70, 90, 255))
for r, f in enumerate(filas):
    for c, im in enumerate(f):
        hoja.alpha_composite(im, (c * (w + 2), r * (h + 2)))
hoja.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(Path(sys.argv[1]) / 'animaciones_x8.png')
