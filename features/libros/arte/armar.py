# Arma el mueble del librero (features/libros), dibujado por código (sin PixelLab).
# Uso: python features/libros/arte/armar.py
#   LIBROS_SHELF  librero de piso 2x2 (la fila de arriba es fondo): mueble de madera con tres repisas de libros
#                 parados de muchos colores y alturas (con lomos de pasta dura con franjas doradas), una pila
#                 acostada, un libro ladeado y un sujetalibros; encima una lámpara de lectura verde y dos libros
#                 acostados. Clic en él abre el panel del librero.
# Libros genéricos: colores lisos, nada de títulos ni portadas.
# Escribe features/libros/assets/furniture/LIBROS_SHELF/ (PNG + manifest.json) y la vista vista_x8.png.
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
# Madera: la misma paleta que BOOKSHELF / COLECCION_SHELF, un poco más oscura (nogal)
CONTORNO = rgb('#2a1814')
MADERA = rgb('#7a4f3a')
MADERA_CLARA = rgb('#a8784c')
MADERA_BRILLO = rgb('#c89a64')
MADERA_OSCURA = rgb('#523428')
FONDO = rgb('#1e1210')
FONDO_LUZ = rgb('#33201a')
SOMBRA = rgb('#000000', 70)
DORADO = rgb('#d4a24c')

# Lomos: (tela, canto oscuro)
TELAS = {
    'vino': (rgb('#7a1f24'), rgb('#4a1014')),
    'marino': (rgb('#1f3a6a'), rgb('#122444')),
    'bosque': (rgb('#245a35'), rgb('#143820')),
    'mostaza': (rgb('#c89a2e'), rgb('#8a6a18')),
    'crema': (rgb('#e9dfc8'), rgb('#a89c84')),
    'negro': (rgb('#1d1d22'), rgb('#0c0c10')),
    'turquesa': (rgb('#1e6a6a'), rgb('#104444')),
    'cafe': (rgb('#5a3424'), rgb('#3a2014')),
    'ciruela': (rgb('#5a2a5e'), rgb('#3a183e')),
    'naranja': (rgb('#d86a2a'), rgb('#8a4018')),
    'azul': (rgb('#3a6ad8'), rgb('#22408a')),
    'rojo': (rgb('#b8323a'), rgb('#7a1a20')),
}
LAMPARA = rgb('#2f7a46')
LAMPARA_LUZ = rgb('#4fae6a')
LAMPARA_OSCURA = rgb('#1c4a2a')
LATON = rgb('#c8a040')
LATON_OSCURO = rgb('#8a6a28')
FOCO = rgb('#fff3b0')


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def libro(px, x, y_abajo, alto, color, ancho=2, dura=False):
    """A book standing, seen by its spine: `ancho` wide (the last column is its dark edge), `alto` tall."""
    tela, canto = TELAS[color]
    y0 = y_abajo - alto + 1
    rect(px, x, y0, x + ancho - 2, y_abajo, tela)
    rect(px, x + ancho - 1, y0, x + ancho - 1, y_abajo, canto)
    if dura and alto >= 5:
        # Pasta dura: una franja dorada arriba y otra abajo
        rect(px, x, y0 + 1, x + ancho - 2, y0 + 1, DORADO)
        rect(px, x, y_abajo - 1, x + ancho - 2, y_abajo - 1, DORADO)
    return x + ancho


def acostado(px, x0, x1, y, color):
    """A book lying flat (one pixel tall), its pages on the right end."""
    tela, canto = TELAS[color]
    rect(px, x0, y, x1, y, tela)
    px[x1, y] = rgb('#e8e0cc')
    px[x0, y] = canto


def librero():
    im = Image.new('RGBA', (W, H), T)
    px = im.load()

    # Sombra en el piso
    rect(px, 1, 30, 30, 31, SOMBRA)

    # Cuerpo del mueble (más alto que el de juegos: un librero)
    rect(px, 1, 5, 30, 30, CONTORNO)
    rect(px, 2, 6, 29, 29, MADERA)
    rect(px, 2, 6, 29, 6, MADERA_BRILLO)
    rect(px, 2, 7, 29, 7, MADERA_CLARA)
    rect(px, 2, 8, 2, 28, MADERA_CLARA)
    rect(px, 29, 8, 29, 28, MADERA_OSCURA)

    # Tres huecos: (y arriba, y de la repisa)
    huecos = [(8, 14), (16, 21), (23, 28)]
    for y0, y1 in huecos:
        rect(px, 4, y0, 27, y1, CONTORNO)
        rect(px, 5, y0, 26, y1 - 1, FONDO)
        rect(px, 5, y0, 26, y0, FONDO_LUZ)
        rect(px, 4, y1, 27, y1, MADERA_OSCURA)  # repisa
    for y in (15, 22):  # travesaños
        rect(px, 3, y, 28, y, MADERA_CLARA)

    # Arriba: novelas de pasta dura y blanda, de alturas distintas, y una ladeada al final
    x = 5
    for color, alto, ancho, dura in [('vino', 6, 2, True), ('marino', 6, 3, True), ('crema', 5, 2, False),
                                     ('bosque', 6, 2, True), ('mostaza', 5, 2, False), ('negro', 6, 3, True),
                                     ('turquesa', 4, 2, False), ('cafe', 6, 2, True), ('ciruela', 5, 2, False)]:
        x = libro(px, x, 13, alto, color, ancho, dura)
    # ladeado, recargado en el último
    tela, canto = TELAS['rojo']
    for i in range(4):
        px[x + i, 13 - i] = tela
        px[x + i + 1, 13 - i] = canto
    px[x, 12] = tela

    # En medio: una fila de libros y una pila acostada a la derecha
    x = 5
    for color, alto, ancho in [('azul', 5, 2), ('azul', 5, 2), ('azul', 5, 2), ('naranja', 4, 2),
                               ('crema', 5, 3), ('vino', 4, 2)]:
        x = libro(px, x, 20, alto, color, ancho, dura=color == 'azul')
    for i, color in enumerate(['negro', 'mostaza', 'bosque', 'crema']):
        acostado(px, 19, 25 - (i % 2), 20 - i, color)

    # Abajo: libros grandes (de arte, de cocina) y un sujetalibros de latón
    x = 5
    for color, alto, ancho in [('cafe', 5, 3), ('marino', 4, 3), ('rojo', 5, 2), ('turquesa', 5, 3),
                               ('crema', 3, 3), ('ciruela', 4, 2)]:
        x = libro(px, x, 27, alto, color, ancho, dura=alto >= 5)
    rect(px, x + 1, 24, x + 1, 27, LATON)  # sujetalibros: placa parada y su base
    rect(px, x + 1, 27, x + 3, 27, LATON_OSCURO)

    # Zoclo
    rect(px, 3, 29, 28, 29, MADERA_OSCURA)

    # Encima: una lámpara de lectura verde (izquierda) y dos libros acostados (derecha)
    rect(px, 4, 1, 11, 3, CONTORNO)  # pantalla
    rect(px, 5, 1, 10, 2, LAMPARA)
    rect(px, 5, 1, 10, 1, LAMPARA_LUZ)
    rect(px, 5, 3, 10, 3, LAMPARA_OSCURA)
    px[6, 4] = FOCO
    px[9, 4] = FOCO
    rect(px, 7, 4, 8, 4, LATON)  # brazo
    rect(px, 5, 5, 10, 5, LATON_OSCURO)  # base sobre el mueble
    rect(px, 18, 3, 26, 4, CONTORNO)
    rect(px, 19, 3, 25, 3, TELAS['vino'][0])
    px[25, 3] = rgb('#e8e0cc')
    rect(px, 18, 4, 26, 4, TELAS['marino'][0])
    px[26, 4] = rgb('#e8e0cc')
    return im


def escribir(carpeta, im, manifest):
    d = MUEBLES / carpeta
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{carpeta}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    print('listo', carpeta, im.size)


if __name__ == '__main__':
    mueble = librero()
    escribir('LIBROS_SHELF', mueble, {
        'id': 'LIBROS_SHELF',
        'name': 'Librero',
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
    # Vista ampliada x8 sobre un piso de muestra
    fondo = Image.new('RGBA', (W + 4, H + 4), rgb('#6b4a32'))
    fondo.alpha_composite(mueble, (2, 2))
    fondo.resize((fondo.width * 8, fondo.height * 8), Image.NEAREST).save(AQUI / 'vista_x8.png')
    print('vista', AQUI / 'vista_x8.png')
