# Arma el mueble USAGE_METER (tablero de uso) desde el original de PixelLab (tablero_a, pixen 32x32).
# Uso: python features/usage/arte/armar.py
# Al original le cambiamos la perilla del centro por un tercer tubo (copia del izquierdo).
# Las barras de 5 h, semana y Fable las pinta la página por código dentro de los tres tubos (USAGE_METER_BARS).
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
DESTINO = AQUI.parent / 'assets' / 'furniture' / 'USAGE_METER'
DESTINO.mkdir(parents=True, exist_ok=True)
im = Image.open(AQUI / 'originales' / 'tablero_a.png').convert('RGBA')
px = im.load()
FONDO = px[12, 8]
for y in range(5, 24):  # borra la perilla
    for x in range(12, 20):
        px[x, y] = FONDO
for y in range(5, 24):  # tubo del centro = tubo izquierdo (x 5-10) movido a x 13-18
    for x in range(5, 11):
        px[x + 8, y] = px[x, y]
im.save(DESTINO / 'USAGE_METER.png')
manifest = {
    'id': 'USAGE_METER',
    'name': 'Tablero de uso de Claude',
    'category': 'wall',
    'type': 'asset',
    'canPlaceOnWalls': True,
    'canPlaceOnSurfaces': False,
    'backgroundTiles': 0,
    'width': 32,
    'height': 32,
    'footprintW': 2,
    'footprintH': 2,
}
(DESTINO / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', newline='\n', encoding='utf-8')
print('listo', DESTINO)
