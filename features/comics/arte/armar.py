# Arma el mueble de cómics y manga (features/comics), dibujado por código (sin PixelLab).
# Uso: python features/comics/arte/armar.py
#   COMICS_SHELF  estante de piso 2x2 (la fila de arriba es fondo): arriba, colecciones de manga (tomos chicos del
#                 mismo color, cada uno con su franja blanca arriba, como una serie en orden); en medio, un cómic de
#                 frente recargado y una pila de grapas; abajo, tomos grandes y un hueco (lo que falta). Encima, un
#                 cómic abierto con globos de diálogo. Clic en él abre el panel de cómics y manga.
# Portadas genéricas: colores lisos, nada de personajes ni logos.
# Escribe features/comics/assets/furniture/COMICS_SHELF/ (PNG + manifest.json) y la vista vista_x8.png.
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
W, H = 32, 32


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


T = (0, 0, 0, 0)
# Madera pintada de rojo oscuro, como un mueble de tienda de cómics
CONTORNO = rgb('#24141a')
MUEBLE = rgb('#8a2a32')
MUEBLE_CLARO = rgb('#b8424a')
MUEBLE_BRILLO = rgb('#d86a6a')
MUEBLE_OSCURO = rgb('#5a1820')
FONDO = rgb('#1a1016')
FONDO_LUZ = rgb('#2e1c24')
SOMBRA = rgb('#000000', 70)
BLANCO = rgb('#f2efe6')
PAPEL = rgb('#e8e0cc')
TINTA = rgb('#1b1a2a')
HUECO = rgb('#ff8a8a')

SERIES = {
    'azul': (rgb('#3a6ad8'), rgb('#22408a')),
    'verde': (rgb('#2f9a5a'), rgb('#1a5a34')),
    'naranja': (rgb('#e8843a'), rgb('#8a4a18')),
    'morado': (rgb('#7a5ad8'), rgb('#44308a')),
    'negro': (rgb('#26262e'), rgb('#101014')),
    'amarillo': (rgb('#e8c22e'), rgb('#8a7010')),
    'rojo': (rgb('#d1262f'), rgb('#7a141a')),
    'cian': (rgb('#38a8e8'), rgb('#1f6a99')),
}


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def tomo(px, x, y_abajo, alto, color):
    """A manga volume by its spine: 2 px wide, a white band on top like a series' spines in a row."""
    cara, canto = SERIES[color]
    y0 = y_abajo - alto + 1
    rect(px, x, y0, x, y_abajo, cara)
    rect(px, x + 1, y0, x + 1, y_abajo, canto)
    px[x, y0] = BLANCO
    return x + 2


def estante():
    im = Image.new('RGBA', (W, H), T)
    px = im.load()
    rect(px, 1, 30, 30, 31, SOMBRA)

    rect(px, 1, 6, 30, 30, CONTORNO)
    rect(px, 2, 7, 29, 29, MUEBLE)
    rect(px, 2, 7, 29, 7, MUEBLE_BRILLO)
    rect(px, 2, 8, 29, 8, MUEBLE_CLARO)
    rect(px, 2, 9, 2, 28, MUEBLE_CLARO)
    rect(px, 29, 9, 29, 28, MUEBLE_OSCURO)

    huecos = [(9, 15), (17, 22), (24, 28)]
    for y0, y1 in huecos:
        rect(px, 4, y0, 27, y1, CONTORNO)
        rect(px, 5, y0, 26, y1 - 1, FONDO)
        rect(px, 5, y0, 26, y0, FONDO_LUZ)
        rect(px, 4, y1, 27, y1, MUEBLE_OSCURO)
    for y in (16, 23):
        rect(px, 3, y, 28, y, MUEBLE_CLARO)

    # Arriba: tres series de manga en orden (cada una de un color), con un hueco en la segunda
    x = 5
    for color, n in [('azul', 3), ('naranja', 2)]:
        for _ in range(n):
            x = tomo(px, x, 14, 5, color)
    x += 2  # el que falta: un hueco punteado
    px[x - 2, 10] = HUECO
    px[x - 2, 12] = HUECO
    px[x - 2, 14] = HUECO
    for _ in range(2):
        x = tomo(px, x, 14, 5, 'naranja')
    for _ in range(3):
        x = tomo(px, x, 14, 5, 'verde')  # termina en la columna 26, dentro del hueco

    # En medio: un cómic de frente recargado (portada con un globo) y una pila de grapas acostadas
    rect(px, 5, 18, 11, 21, CONTORNO)
    rect(px, 6, 18, 10, 21, SERIES['amarillo'][0])
    rect(px, 6, 18, 10, 18, SERIES['rojo'][0])  # cabezal del título
    rect(px, 8, 19, 10, 20, BLANCO)  # globo
    px[8, 21] = BLANCO
    x = 13
    for color in ['morado', 'morado', 'cian', 'cian', 'negro']:
        x = tomo(px, x, 21, 4, color)
    for i, color in enumerate(['rojo', 'cian', 'amarillo']):
        y = 21 - i
        cara, canto = SERIES[color]
        rect(px, 20, y, 25, y, cara)
        px[25, y] = PAPEL

    # Abajo: tomos grandes (integrales) de lomo ancho
    x = 5
    for color in ['negro', 'rojo', 'azul', 'verde', 'morado', 'amarillo']:
        cara, canto = SERIES[color]
        rect(px, x, 24, x + 1, 27, cara)
        rect(px, x + 2, 24, x + 2, 27, canto)
        px[x, 24] = BLANCO
        x += 3
    rect(px, 3, 29, 28, 29, MUEBLE_OSCURO)

    # Encima: un cómic abierto con dos globos de diálogo
    rect(px, 7, 3, 24, 6, CONTORNO)
    rect(px, 8, 3, 15, 5, PAPEL)
    rect(px, 16, 3, 23, 5, PAPEL)
    rect(px, 15, 3, 16, 5, rgb('#c8b890'))  # el lomo, al centro
    rect(px, 9, 3, 11, 4, BLANCO)
    px[10, 5] = TINTA
    rect(px, 18, 3, 21, 4, BLANCO)
    px[19, 5] = TINTA
    rect(px, 12, 4, 14, 5, SERIES['cian'][0])  # viñetas de color
    rect(px, 21, 5, 23, 5, SERIES['rojo'][0])
    return im


def escribir(carpeta, im, manifest):
    d = MUEBLES / carpeta
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{carpeta}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    print('listo', carpeta, im.size)


if __name__ == '__main__':
    mueble = estante()
    escribir('COMICS_SHELF', mueble, {
        'id': 'COMICS_SHELF',
        'name': 'Cómics y manga',
        'category': 'storage',
        'canPlaceOnWalls': False,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': 1,
        'type': 'asset',
        'width': W,
        'height': H,
        'footprintW': 2,
        'footprintH': 2,
    })
    fondo = Image.new('RGBA', (W + 4, H + 4), rgb('#6b4a32'))
    fondo.alpha_composite(mueble, (2, 2))
    fondo.resize((fondo.width * 8, fondo.height * 8), Image.NEAREST).save(AQUI / 'vista_x8.png')
    print('vista', AQUI / 'vista_x8.png')
