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


# ── Limpieza de lo que da PixelLab (freelance/ y mando/) ──

def sin_sueltos(im, minimo=4):
    """Borra grupos de píxeles (vecindad 8) de menos de `minimo` píxeles: motas sueltas que deja PixelLab."""
    w, h = im.size
    px = im.load()
    visto = set()
    for y in range(h):
        for x in range(w):
            if not px[x, y][3] or (x, y) in visto:
                continue
            grupo, pila = [], [(x, y)]
            visto.add((x, y))
            while pila:
                cx, cy = pila.pop()
                grupo.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visto and px[nx, ny][3]:
                            visto.add((nx, ny))
                            pila.append((nx, ny))
            if len(grupo) < minimo:
                for gx, gy in grupo:
                    px[gx, gy] = (0, 0, 0, 0)
    return im


def unir_parecidos(im, umbral=6):
    """Junta colores casi iguales (PixelLab da 2-3 tonos que no se distinguen) en el más usado."""
    px = im.load()
    cuenta = {}
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                cuenta[px[x, y]] = cuenta.get(px[x, y], 0) + 1
    base, mapa = [], {}
    for c, _ in sorted(cuenta.items(), key=lambda kv: -kv[1]):
        destino = next((b for b in base if max(abs(b[i] - c[i]) for i in range(4)) <= umbral), None)
        if destino is None:
            base.append(c)
            destino = c
        mapa[c] = destino
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                px[x, y] = mapa[px[x, y]]
    return im


def limpiar(im):
    return unir_parecidos(sin_sueltos(im))


def mover(im, dx, dy):
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (dx, dy))
    return out


def al_piso(im, ultima=31):
    """Baja lo dibujado para que su última fila quede en `ultima` (PixelLab deja muebles flotando)."""
    return mover(im, 0, ultima - (im.getbbox()[3] - 1))


def angosto(im, ultima=31):
    """Recorta a 16 de ancho centrando lo dibujado y lo baja al piso (muebles de 1x2 que PixelLab da en 32x32)."""
    x0, _, x1, _ = im.getbbox()
    izq = max(0, min(im.width - 16, (x0 + x1 - 16) // 2))
    return al_piso(im.crop((izq, 0, izq + 16, im.height)), ultima)


def sin_halo(im, es_halo, pasadas=2):
    """Quita los píxeles de la orilla (tocan lo transparente) que cumplen `es_halo` (halos de color de PixelLab)."""
    for _ in range(pasadas):
        px = im.load()
        quitar = []
        for y in range(im.height):
            for x in range(im.width):
                if px[x, y][3] and es_halo(px[x, y]):
                    vecinos = ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                    if any(not (0 <= vx < im.width and 0 <= vy < im.height) or not px[vx, vy][3] for vx, vy in vecinos):
                        quitar.append((x, y))
        for x, y in quitar:
            px[x, y] = (0, 0, 0, 0)
    return im
