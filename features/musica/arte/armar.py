# Muebles de la música: tocadiscos (PixelLab) y cuadro de la carátula (por código).
#   originales/tocadiscos_b.png: create_image_pixen 32x32, view=side (la variante escogida; a y c quedaron de prueba)
# Uso: python features/musica/arte/armar.py
# Escribe features/musica/assets/furniture/<ID>/<ID>.png + manifest.json (esbuild.js los copia a dist/assets).
import json
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'


def guardar(id_, nombre, im, fw, fh, **extra):
    assert im.size == (fw * 16, fh * 16), f'{id_}: {im.size} no mide {fw}x{fh} cuadros'
    carpeta = MUEBLES / id_
    carpeta.mkdir(parents=True, exist_ok=True)
    im.save(carpeta / f'{id_}.png')
    manifest = {
        'id': id_,
        'name': nombre,
        'category': 'misc',
        'type': 'asset',
        'canPlaceOnWalls': False,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': 0,
        'width': im.width,
        'height': im.height,
        'footprintW': fw,
        'footprintH': fh,
        **extra,
    }
    (carpeta / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('ok', id_, im.size)


# Tocadiscos: la maleta abierta tal cual (llena sus 2x2 cuadros); el giro del disco va por código.
tocadiscos = Image.open(AQUI / 'originales' / 'tocadiscos_b.png').convert('RGBA')
guardar('TURNTABLE', 'Tocadiscos', tocadiscos, 2, 2, backgroundTiles=1)

# Cuadro de la carátula (pared): marco de madera oscura con un disco genérico. Cuando suena algo, la página
# pinta la carátula pixeleada en el hueco de 22x22 que empieza en (5, 5) (MUSIC_COVER_* en webview/constants.ts).
cuadro = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
d = ImageDraw.Draw(cuadro)
d.rectangle([2, 2, 29, 29], fill=(27, 27, 34))            # contorno
d.rectangle([3, 3, 28, 28], fill=(92, 58, 36))            # marco
d.rectangle([4, 4, 27, 27], fill=(64, 38, 22))            # bisel
d.rectangle([5, 5, 26, 26], fill=(36, 34, 52))            # fondo del hueco
d.ellipse([7, 7, 24, 24], fill=(18, 18, 22))              # disco
d.ellipse([10, 10, 21, 21], outline=(40, 40, 48))         # surco
d.ellipse([13, 13, 18, 18], fill=(116, 111, 255))         # etiqueta
d.point((15, 15), fill=(18, 18, 22))
d.line([(3, 3), (28, 3)], fill=(128, 84, 52))             # luz del marco
guardar('ALBUM_FRAME', 'Cuadro de la carátula', cuadro, 2, 2, category='wall', canPlaceOnWalls=True)
