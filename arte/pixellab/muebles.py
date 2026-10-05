# Común a los armar.py de cada zona: escribe un mueble de la oficina (PNG + manifest.json).
import json
from pathlib import Path

from PIL import Image

MUEBLES = Path(__file__).resolve().parents[2] / 'webview-ui' / 'public' / 'assets' / 'furniture'


def guardar(id_, nombre, im, fw, fh, category='misc', canPlaceOnWalls=False, backgroundTiles=0, **extra):
    """extra: más campos del manifest (ej. isDesk=True para mesas; los asientos van con category='chairs')."""
    assert im.size == (fw * 16, fh * 16), f'{id_}: {im.size} no mide {fw}x{fh} cuadros'
    carpeta = MUEBLES / id_
    carpeta.mkdir(exist_ok=True)
    im.save(carpeta / f'{id_}.png')
    manifest = {
        'id': id_,
        'name': nombre,
        'category': category,
        'type': 'asset',
        'canPlaceOnWalls': canPlaceOnWalls,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': backgroundTiles,
        'width': im.width,
        'height': im.height,
        'footprintW': fw,
        'footprintH': fh,
        **extra,
    }
    (carpeta / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('ok', id_, im.size)


def abrir(carpeta, nombre):
    return Image.open(Path(carpeta) / 'originales' / nombre).convert('RGBA')


def recortar_ancho(im, ancho):
    """Recorta a lo ancho centrando lo dibujado (recortar no es reducir: el pixel art no se deforma)."""
    x0, _, x1, _ = im.getbbox()
    izq = max(0, min(im.width - ancho, (x0 + x1 - ancho) // 2))
    return im.crop((izq, 0, izq + ancho, im.height))


def a_piedra(im, tono=(128, 128, 124)):
    """Pasa una figura a piedra gris: conserva las luces y sombras, quita el color."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                f = 0.35 + 0.9 * (r * 299 + g * 587 + b * 114) / 1000 / 255
                px[x, y] = tuple(min(255, int(c * f)) for c in tono) + (a,)
    return out


CONTORNO = (27, 27, 34, 255)


def pintar(filas, colores):
    """Convierte filas de texto en imagen; '.' = transparente."""
    h, w = len(filas), max(len(f) for f in filas)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch != '.':
                im.putpixel((x, y), colores[ch])
    return im


def contorno(im):
    """Contorno oscuro de 1 px alrededor de lo dibujado (estilo de los muebles de la oficina)."""
    out = im.copy()
    px, src = out.load(), im.load()
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y][3]:
                continue
            vecinos = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            if any(0 <= vx < im.width and 0 <= vy < im.height and src[vx, vy][3] for vx, vy in vecinos):
                px[x, y] = CONTORNO
    return out
