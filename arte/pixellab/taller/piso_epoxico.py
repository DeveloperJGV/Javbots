# Piso epóxico del taller (2026-10-04): patrón de piso nuevo floor_9.png (TileType 10), en grises para que el plano
# lo coloree (modo Colorize). Liso con chispitas oscuras y claras, sin juntas, para que no se note la repetición.
# Uso: python arte/pixellab/taller/piso_epoxico.py
from pathlib import Path

from PIL import Image

PISOS = Path(__file__).resolve().parents[3] / 'webview-ui' / 'public' / 'assets' / 'floors'
BASE, OSCURO, CLARO = 128, 112, 146
OSCUROS = [(2, 3), (9, 1), (13, 6), (5, 9), (11, 12), (1, 14), (7, 13)]
CLAROS = [(6, 2), (14, 10), (3, 7), (10, 5), (8, 15)]

im = Image.new('RGBA', (16, 16), (BASE, BASE, BASE, 255))
for x, y in OSCUROS:
    im.putpixel((x, y), (OSCURO, OSCURO, OSCURO, 255))
for x, y in CLAROS:
    im.putpixel((x, y), (CLARO, CLARO, CLARO, 255))
im.save(PISOS / 'floor_9.png')
print('ok floor_9.png')
