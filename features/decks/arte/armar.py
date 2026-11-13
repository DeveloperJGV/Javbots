# Arma la repisa de decks (features/decks), dibujada por código (sin PixelLab).
# Uso: python features/decks/arte/armar.py
#   DECKS_SHELF     repisa de piso 2x2 (la fila de arriba es fondo): mueble de madera con dos repisas de
#                   cajas de deck paradas (arriba de frente, abajo en diagonal, una tras otra) y un mazo de cartas
#                   encima. Es el que se guarda en el plano; clic en él abre el panel de decks.
#   DECKS_SHELF_ON  la misma con una caja "salida": falta en la repisa de arriba y está parada encima del mueble, con
#                   brillo. Para cuando el panel está abierto (lo decide la página). Como OFERTAS_KIOSK_ON: un grupo de
#                   estado con un solo miembro "on", así existe en el catálogo pero no sale en la paleta del editor (y
#                   al no tener pareja "off", no se prende sola junto a un agente).
# Cajas genéricas: colores lisos y un emblema de rombo; nada de logos ni arte de cartas.
# Escribe features/decks/assets/furniture/DECKS_SHELF*/ (PNG + manifest.json) y la vista vista_x8.png.
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
# Madera: la misma paleta que BOOKSHELF / DOUBLE_BOOKSHELF
CONTORNO = rgb('#301c1c')
MADERA = rgb('#885c47')
MADERA_CLARA = rgb('#b38857')
MADERA_BRILLO = rgb('#cfa86d')
MADERA_OSCURA = rgb('#5e3b2e')
FONDO = rgb('#24161a')  # fondo del hueco, detrás de las cajas
FONDO_LUZ = rgb('#3a2528')
SOMBRA = rgb('#000000', 70)
BRILLO = rgb('#fff6c8')
BRILLO_SUAVE = rgb('#ffe27a', 150)

# Cajas: (cara, sombra/lado, luz/tapa, emblema)
CAJAS = {
    'rojo': (rgb('#b84349'), rgb('#7a2430'), rgb('#e0707a'), rgb('#f2c14e')),
    'azul': (rgb('#4f6fd0'), rgb('#2e3f86'), rgb('#86a4ef'), rgb('#e1e3e9')),
    'verde': (rgb('#4f9a55'), rgb('#2d5e36'), rgb('#86c98a'), rgb('#f2c14e')),
    'morado': (rgb('#7f3e9e'), rgb('#4b2363'), rgb('#b07ccc'), rgb('#e1e3e9')),
    'dorado': (rgb('#d39a2a'), rgb('#8a5a12'), rgb('#f2c96a'), rgb('#7a2430')),
    'negro': (rgb('#34324a'), rgb('#1c1a2a'), rgb('#5c5a78'), rgb('#c94a52')),
    'blanco': (rgb('#d8dae3'), rgb('#9a9db0'), rgb('#f4f5fa'), rgb('#4f6fd0')),
    'turquesa': (rgb('#2f9a9a'), rgb('#1b5e62'), rgb('#6cc8c4'), rgb('#f4f5fa')),
}


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def caja_frente(px, x, y, color):
    """Deck box seen from the front: 5 wide x 7 tall, top-left corner at (x, y)."""
    cara, lado, luz, emblema = CAJAS[color]
    rect(px, x, y, x + 4, y + 6, CONTORNO)
    rect(px, x + 1, y + 1, x + 3, y + 5, cara)
    rect(px, x + 1, y + 1, x + 3, y + 1, luz)  # tapa
    rect(px, x + 3, y + 2, x + 3, y + 5, lado)  # canto en sombra
    px[x + 2, y + 3] = emblema  # rombo chico: el punto y su brillo
    px[x + 2, y + 4] = lado


def caja_diagonal(px, x, y, color):
    """Deck box turned to the right, 6 wide x 7 tall: 2 px of face, then its side (darker) going back, with the lid
    slanting down. Draw them back (right) to front (left): each side covers the front edge of the box behind."""
    cara, lado, luz, emblema = CAJAS[color]
    rect(px, x, y, x + 3, y + 6, CONTORNO)
    rect(px, x + 3, y + 1, x + 5, y + 6, CONTORNO)
    rect(px, x + 1, y + 1, x + 2, y + 5, cara)
    rect(px, x + 1, y + 1, x + 2, y + 1, luz)
    rect(px, x + 3, y + 2, x + 4, y + 5, lado)
    px[x + 3, y + 2] = luz  # canto de la tapa, que baja hacia atrás
    px[x + 4, y + 2] = cara
    px[x + 1, y + 3] = emblema


def repisa(salida):
    im = Image.new('RGBA', (W, H), T)
    px = im.load()

    # Sombra en el piso
    rect(px, 1, 30, 30, 31, SOMBRA)

    # Cuerpo del mueble
    rect(px, 1, 7, 30, 30, CONTORNO)
    rect(px, 2, 8, 29, 29, MADERA)
    # Cubierta (arriba) con su orilla clara
    rect(px, 2, 8, 29, 8, MADERA_BRILLO)
    rect(px, 2, 9, 29, 9, MADERA_CLARA)
    # Postes laterales: luz a la izquierda, sombra a la derecha
    rect(px, 2, 10, 2, 28, MADERA_CLARA)
    rect(px, 29, 10, 29, 28, MADERA_OSCURA)

    # Dos huecos
    huecos = [(11, 18), (21, 27)]  # (y arriba, y abajo) del hueco
    for y0, y1 in huecos:
        rect(px, 4, y0, 27, y1, CONTORNO)
        rect(px, 5, y0, 26, y1 - 1, FONDO)
        rect(px, 5, y0, 26, y0, FONDO_LUZ)
        rect(px, 4, y1, 27, y1, MADERA_OSCURA)  # repisa
    # Travesaño entre huecos
    rect(px, 3, 19, 28, 20, MADERA)
    rect(px, 3, 19, 28, 19, MADERA_CLARA)

    # Repisa de arriba: cajas de frente
    arriba = ['rojo', 'azul', 'dorado', 'verde']
    xs = [5, 10, 15, 20]
    for i, (x, color) in enumerate(zip(xs, arriba)):
        if salida and i == 2:
            continue  # la que salió: queda el hueco
        caja_frente(px, x, 11, color)
    # una caja acostada al final, para que no se vea en fila de soldados
    rect(px, 24, 15, 26, 17, CONTORNO)
    rect(px, 25, 15, 26, 16, CAJAS['morado'][0])
    px[25, 15] = CAJAS['morado'][2]
    if salida:
        # marquita de polvo donde estaba la caja
        rect(px, 16, 17, 18, 17, FONDO_LUZ)

    # Repisa de abajo: cajas en diagonal, una tras otra (la de adelante tapa el lado de la anterior)
    # Se dibujan de atrás (derecha) hacia adelante (izquierda): el lado de cada caja tapa la orilla de la siguiente.
    abajo = ['negro', 'blanco', 'turquesa', 'rojo', 'morado']
    for i, color in reversed(list(enumerate(abajo))):
        caja_diagonal(px, 5 + i * 4, 21, color)

    # Zoclo con jaladera
    rect(px, 3, 28, 28, 28, MADERA_OSCURA)
    rect(px, 14, 29, 17, 29, MADERA_CLARA)

    # Encima del mueble
    if salida:
        # la caja que salió, parada de frente, con brillo alrededor
        caja_frente(px, 13, 1, 'dorado')
        for x, y in [(11, 2), (19, 3), (12, 6), (18, 0)]:
            px[x, y] = BRILLO_SUAVE
        for x, y in [(11, 0), (20, 6)]:
            px[x, y] = BRILLO
        px[10, 1] = BRILLO_SUAVE
        px[11, 1] = BRILLO
        px[12, 1] = BRILLO_SUAVE
        px[11, 2] = BRILLO
    # un mazo de cartas boca abajo (siempre), a la derecha
    rect(px, 22, 5, 27, 7, CONTORNO)
    rect(px, 23, 5, 26, 6, rgb('#8a5a3a'))
    rect(px, 23, 5, 26, 5, rgb('#b07a4a'))
    px[24, 6] = rgb('#5e3b2e')
    px[25, 6] = rgb('#5e3b2e')
    # y un dado a la izquierda
    rect(px, 5, 4, 8, 7, CONTORNO)
    rect(px, 6, 5, 7, 6, rgb('#f4f5fa'))
    px[6, 5] = rgb('#c94a52')
    px[7, 6] = rgb('#9a9db0')
    return im


def escribir(carpeta, im, manifest):
    d = MUEBLES / carpeta
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{carpeta}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    print('listo', carpeta, im.size)


COMUN = {
    'category': 'storage',
    'canPlaceOnWalls': False,
    'canPlaceOnSurfaces': False,
    'backgroundTiles': 1,
}
TAM = {'width': W, 'height': H, 'footprintW': 2, 'footprintH': 2}

if __name__ == '__main__':
    normal = repisa(False)
    salida = repisa(True)
    escribir('DECKS_SHELF', normal, {
        'id': 'DECKS_SHELF',
        'name': 'Repisa de decks',
        **COMUN,
        'type': 'asset',
        **TAM,
    })
    escribir('DECKS_SHELF_ON', salida, {
        'id': 'DECKS_SHELF_ON',
        'name': 'Repisa de decks (caja afuera)',
        **COMUN,
        'type': 'group',
        'groupType': 'state',
        'members': [
            {'type': 'asset', 'id': 'DECKS_SHELF_ON', 'file': 'DECKS_SHELF_ON.png', **TAM, 'state': 'on'},
        ],
    })
    # Vista ampliada x8: normal y con la caja afuera lado a lado, sobre un piso de muestra
    fondo = Image.new('RGBA', (W * 2 + 12, H + 4), rgb('#6b4a32'))
    fondo.alpha_composite(normal, (2, 2))
    fondo.alpha_composite(salida, (W + 10, 2))
    fondo.resize((fondo.width * 8, fondo.height * 8), Image.NEAREST).save(AQUI / 'vista_x8.png')
    print('vista', AQUI / 'vista_x8.png')
