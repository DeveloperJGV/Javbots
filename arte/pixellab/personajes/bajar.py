# Baja las 4 rotaciones (y el zip completo) de un personaje de PixelLab y mide su caja ocupada.
#
# Uso: python bajar.py <character_id> <carpeta>
#   -> <carpeta>/{south,east,north,west}.png, <carpeta>/personaje.zip y <carpeta>/rotaciones_x8.png
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

cid, carpeta = sys.argv[1], Path(sys.argv[2])
carpeta.mkdir(parents=True, exist_ok=True)
datos = urllib.request.urlopen(f'https://api.pixellab.ai/mcp/characters/{cid}/download').read()
(carpeta / 'personaje.zip').write_bytes(datos)
z = zipfile.ZipFile(io.BytesIO(datos))
z.extractall(carpeta / 'zip')
ims = []
for d in ('south', 'east', 'north', 'west'):
    nombre = next(n for n in z.namelist() if n.endswith(f'rotations/{d}.png'))
    im = Image.open(z.open(nombre)).convert('RGBA')
    im.save(carpeta / f'{d}.png')
    bb = im.getbbox()
    print(d, im.size, 'bbox', bb, 'ancho', bb[2] - bb[0], 'alto', bb[3] - bb[1])
    ims.append(im)
w, h = ims[0].size
hoja = Image.new('RGBA', (w * 4 + 12, h), (70, 70, 90, 255))
for i, im in enumerate(ims):
    hoja.alpha_composite(im, (i * (w + 4), 0))
hoja.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(carpeta / 'rotaciones_x8.png')
