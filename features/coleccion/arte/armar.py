# Arma el mueble de la colección de juegos (features/coleccion), dibujado por código (sin PixelLab).
# Uso: python features/coleccion/arte/armar.py
#   COLECCION_SHELF  estante de piso 2x2 (la fila de arriba es fondo), para ir junto a la tele del tiempo libre:
#                    mueble de madera con tres repisas (arriba lomos delgados de cajas de disco de muchos colores,
#                    en medio más lomos y una pila acostada, abajo cartuchos parados) y encima un control y una
#                    consola chica. Clic en él abre el panel de la colección.
# Cajas y cartuchos genéricos: colores lisos, nada de logos ni portadas.
# Escribe features/coleccion/assets/furniture/COLECCION_SHELF/ (PNG + manifest.json) y la vista vista_x8.png.
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
# Madera: la misma paleta que BOOKSHELF / DECKS_SHELF
CONTORNO = rgb('#301c1c')
MADERA = rgb('#885c47')
MADERA_CLARA = rgb('#b38857')
MADERA_BRILLO = rgb('#cfa86d')
MADERA_OSCURA = rgb('#5e3b2e')
FONDO = rgb('#24161a')  # fondo del hueco, detrás de las cajas
FONDO_LUZ = rgb('#3a2528')
SOMBRA = rgb('#000000', 70)

# Lomos de cajas de disco: (lomo, canto oscuro, franja de arriba)
LOMOS = {
    'verde': (rgb('#3c9a2f'), rgb('#22601a'), rgb('#e8e8ec')),
    'azul': (rgb('#2b5aa8'), rgb('#18346a'), rgb('#e8e8ec')),
    'blanco': (rgb('#e8e8ec'), rgb('#9a9db0'), rgb('#9aa0a8')),
    'negro': (rgb('#2a2a33'), rgb('#141418'), rgb('#6a6f78')),
    'rojo': (rgb('#d1262f'), rgb('#7a1a20'), rgb('#f2f2f2')),
    'morado': (rgb('#6a5acd'), rgb('#3b2f80'), rgb('#e8e8ec')),
    'celeste': (rgb('#38a8e8'), rgb('#1f6a99'), rgb('#e8e8ec')),
    'gris': (rgb('#6a6f78'), rgb('#3a3d44'), rgb('#c9ccd2')),
}
# Cartuchos: (plástico, canto, etiqueta)
CARTUCHOS = [
    (rgb('#9b9b9b'), rgb('#5e5e62'), rgb('#c8312e')),
    (rgb('#b9b5ae'), rgb('#77736c'), rgb('#7a68b8')),
    (rgb('#4a4a50'), rgb('#26262a'), rgb('#e0aa3e')),
    (rgb('#9b9b9b'), rgb('#5e5e62'), rgb('#2b8a3e')),
]
CONTROL = rgb('#d8dae3')
CONTROL_SOMBRA = rgb('#9a9db0')
CRUZ = rgb('#2a2a33')
BOTON_A = rgb('#3c9a2f')
BOTON_B = rgb('#d14249')
CONSOLA = rgb('#2a2a33')
CONSOLA_LUZ = rgb('#4a4a55')
LED = rgb('#5ccf3c')


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def lomo(px, x, y_abajo, alto, color):
    """A disc case standing, seen by its spine: 2 px wide (spine + dark edge), `alto` tall, standing on y_abajo."""
    cara, canto, franja = LOMOS[color]
    y0 = y_abajo - alto + 1
    rect(px, x, y0, x, y_abajo, cara)
    rect(px, x + 1, y0, x + 1, y_abajo, canto)
    px[x, y0] = franja


def cartucho(px, x, y_abajo, colores):
    """A cartridge standing from the front: 4 wide x 4 tall (it fills the bottom hole), label on top."""
    plastico, canto, etiqueta = colores
    y0 = y_abajo - 3
    rect(px, x, y0, x + 3, y_abajo, plastico)
    rect(px, x + 3, y0, x + 3, y_abajo, canto)
    rect(px, x + 1, y0, x + 2, y0 + 1, etiqueta)
    px[x + 1, y_abajo] = canto  # ranuras de abajo


def estante():
    im = Image.new('RGBA', (W, H), T)
    px = im.load()

    # Sombra en el piso
    rect(px, 1, 30, 30, 31, SOMBRA)

    # Cuerpo del mueble
    rect(px, 1, 6, 30, 30, CONTORNO)
    rect(px, 2, 7, 29, 29, MADERA)
    rect(px, 2, 7, 29, 7, MADERA_BRILLO)
    rect(px, 2, 8, 29, 8, MADERA_CLARA)
    rect(px, 2, 9, 2, 28, MADERA_CLARA)
    rect(px, 29, 9, 29, 28, MADERA_OSCURA)

    # Tres huecos: (y arriba, y de la repisa)
    huecos = [(9, 15), (17, 22), (24, 28)]
    for y0, y1 in huecos:
        rect(px, 4, y0, 27, y1, CONTORNO)
        rect(px, 5, y0, 26, y1 - 1, FONDO)
        rect(px, 5, y0, 26, y0, FONDO_LUZ)
        rect(px, 4, y1, 27, y1, MADERA_OSCURA)  # repisa
    for y in (16, 23):  # travesaños
        rect(px, 3, y, 28, y, MADERA_CLARA)

    # Arriba: una fila de lomos de muchos colores y alturas (como las consolas de la repisa del panel)
    fila = [('verde', 6), ('verde', 6), ('azul', 5), ('azul', 5), ('negro', 6), ('blanco', 6), ('rojo', 5),
            ('rojo', 5), ('morado', 5), ('celeste', 6)]
    x = 5
    for color, alto in fila:
        lomo(px, x, 14, alto, color)
        x += 2
    # uno ladeado al final, recargado en la pared del hueco
    px[25, 13] = LOMOS['gris'][0]
    px[26, 12] = LOMOS['gris'][0]
    px[25, 14] = LOMOS['gris'][1]
    px[26, 13] = LOMOS['gris'][1]
    px[26, 14] = LOMOS['gris'][1]

    # En medio: lomos a la izquierda y una pila de cajas acostadas a la derecha
    x = 5
    for color, alto in [('negro', 5), ('negro', 5), ('azul', 4), ('blanco', 5), ('verde', 5), ('morado', 4),
                        ('gris', 5)]:
        lomo(px, x, 21, alto, color)
        x += 2
    for i, color in enumerate(['rojo', 'celeste', 'verde']):
        y = 21 - i
        cara, canto, franja = LOMOS[color]
        rect(px, 20, y, 25, y, cara)
        px[25, y] = canto
        px[20, y] = franja

    # Abajo: cartuchos parados
    for i, colores in enumerate(CARTUCHOS):
        cartucho(px, 6 + i * 5, 27, colores)

    # Zoclo con jaladera
    rect(px, 3, 29, 28, 29, MADERA_OSCURA)
    rect(px, 14, 29, 17, 29, MADERA_CLARA)

    # Encima: una consola chica (izquierda) y un control (derecha)
    rect(px, 4, 2, 12, 6, CONTORNO)
    rect(px, 5, 3, 11, 5, CONSOLA)
    rect(px, 5, 3, 11, 3, CONSOLA_LUZ)
    px[6, 5] = LED
    rect(px, 8, 4, 10, 4, CONTORNO)  # ranura
    rect(px, 18, 3, 26, 6, CONTORNO)
    rect(px, 19, 4, 25, 5, CONTROL)
    px[19, 6] = CONTORNO
    rect(px, 19, 5, 25, 5, CONTROL_SOMBRA)
    px[20, 4] = CRUZ  # cruceta
    px[21, 5] = CRUZ
    px[20, 5] = CRUZ
    px[23, 4] = BOTON_A
    px[24, 5] = BOTON_B
    # el cable cuelga por la orilla
    px[26, 7] = CONTORNO
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
    escribir('COLECCION_SHELF', mueble, {
        'id': 'COLECCION_SHELF',
        'name': 'Colección de juegos',
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
