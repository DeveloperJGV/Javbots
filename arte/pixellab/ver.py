# Descarga un resultado de PixelLab y crea una vista ampliada para revisarlo.
#
# Uso:  python arte/pixellab/ver.py <job_id> <nombre> [<carpeta>]
#   -> <carpeta>/<nombre>.png (original) y <nombre>_x10.png (ampliado sobre fondo gris azulado)
# La carpeta por omisión es la actual. Imprime tamaño, caja ocupada (bbox) y número de colores.
import sys
import urllib.request
from pathlib import Path

from PIL import Image

job, nombre = sys.argv[1], sys.argv[2]
carpeta = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('.')
carpeta.mkdir(parents=True, exist_ok=True)
original = carpeta / f'{nombre}.png'
urllib.request.urlretrieve(f'https://api.pixellab.ai/mcp/images/{job}/download', original)

im = Image.open(original).convert('RGBA')
colores = {im.getpixel((x, y)) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3]}
print(nombre, im.size, 'bbox', im.getbbox(), 'colores', len(colores))
fondo = Image.new('RGBA', im.size, (70, 70, 90, 255))
fondo.alpha_composite(im)
escala = max(1, 400 // max(im.size))
fondo.resize((im.width * escala, im.height * escala), Image.NEAREST).save(carpeta / f'{nombre}_x10.png')
