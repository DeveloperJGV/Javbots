# Correo: piezas CORREO_* (buzón con bandera, pantalla de bandeja de entrada, banda de cartas, charola de importantes).
#
#   originales/buzon_1.png    create_image_pixen 32x32, view=side (v1 de 2): buzón de poste visto de frente, sin
#                             bandera. Recorte a 16x32; la bandera (arriba / abajo) se dibuja por código.
#   originales/bandeja_1.png  48x32: monitor de pared con sobre azul en el marco; pantalla, filas y horas por código.
#   originales/charola_1.png  20x20: charola roja con sobres; la etiqueta de "importante" por código.
#   CORREO_BELT*, CORREO_LETTER: 100 % por código (banda_1, 48x32, salió isométrica: descarte).
#   buzon_2 (de perfil, 31 px de ancho): descarte.
#
# Uso:  python arte/pixellab/correo/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la hoja de escala
# vista_x4.png. No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return _abrir(AQUI, nombre)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def dibujar(px, forma, x0, y0, colores):
    for dy, fila in enumerate(forma):
        for dx, ch in enumerate(fila):
            if ch in colores:
                px[x0 + dx, y0 + dy] = colores[ch]


ORILLA = rgb('#14101a')
BANDERA = rgb('#e23b3b')
BANDERA_SOMBRA = rgb('#a3242b')
POSTE = rgb('#6b7280')

# ── Buzón ─────────────────────────────────────────────────────────────────────────────────────────────────────
# Coordenadas del recorte 16x32 ANTES de bajarlo al piso; al_piso baja todo BUZON_BAJA filas.
BANDERA_ARRIBA = [  # columnas 11-15, filas 0-9: bandera levantada en su poste (lado derecho del buzón)
    'KKKKK',
    'KRRRK',
    'KrrRK',
    'KKKKK',
    '...KP',
    '...KP',
    '...KP',
    '...KP',
    '....P',
    '....P',
]
BANDERA_ABAJO = [  # columna 15, filas 9-13: bandera bajada, pegada al costado (de frente se ve de canto)
    'K',
    'R',
    'R',
    'r',
    'K',
]


def buzon(arriba):
    im = limpiar(abrir('buzon_1.png')).crop((8, 0, 24, 32))
    px = im.load()
    colores = {'K': ORILLA, 'R': BANDERA, 'r': BANDERA_SOMBRA, 'P': POSTE}
    if arriba:
        dibujar(px, BANDERA_ARRIBA, 11, 0, colores)
    else:
        dibujar(px, BANDERA_ABAJO, 15, 9, colores)
    return al_piso(im, 31)


# ── Pantalla de bandeja de entrada (pared 3x2) ────────────────────────────────────────────────────────────────
PANTALLA = rgb('#0b1a2b')
ENCABEZADO = rgb('#2563eb')
SOBRE = rgb('#e5eefc')
REMITENTE = rgb('#e5eefc')
ASUNTO = rgb('#7d97b8')
HORA = rgb('#7d97b8')
NO_LEIDO = rgb('#22d3ee')
SEPARADOR = rgb('#16324a')
BANDEJA_PANTALLA = (10, 5, 37, 24)        # x0, y0, x1, y1 inclusive
BANDEJA_FILAS = [9, 13, 17, 21]           # y del remitente de cada fila (asunto en y+1, separador en y+3)
FILAS_EJEMPLO = [(True, 12, 9), (True, 9, 12), (False, 14, 8), (False, 10, 11)]  # (no leído, remitente, asunto)


def bandeja():
    im = limpiar(abrir('bandeja_1.png'))
    px = im.load()
    x0, y0, x1, y1 = BANDEJA_PANTALLA
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = PANTALLA
    for y in range(y0, y0 + 3):               # encabezado azul con un sobre
        for x in range(x0, x1 + 1):
            px[x, y] = ENCABEZADO
    for x in range(x0 + 6, x0 + 14):          # título (el sobre ya viene en el marco)
        px[x, y0 + 1] = SOBRE
    for (no_leido, rem, asu), y in zip(FILAS_EJEMPLO, BANDEJA_FILAS):
        if no_leido:
            px[x0 + 1, y] = NO_LEIDO
        for x in range(x0 + 3, x0 + 3 + rem):
            px[x, y] = REMITENTE
        for x in range(x0 + 3, x0 + 3 + asu):
            px[x, y + 1] = ASUNTO
        for x in (x1 - 5, x1 - 4, x1 - 2, x1 - 1):   # hora "##:##" de 1 px de alto
            px[x, y] = HORA
        if y + 3 <= y1:
            for x in range(x0, x1 + 1):
                px[x, y + 3] = SEPARADOR
    return im


# ── Banda de cartas (suelo 3x1) y carta suelta ────────────────────────────────────────────────────────────────
BANDA = rgb('#3a3d45')            # hule de la banda (arriba, dos tonos alternados para animar con `cycle`)
BANDA_B = rgb('#2a2c33')
MARCO = rgb('#9aa3ad')
MARCO_SOMBRA = rgb('#6b7480')
RAYA_AMARILLA = rgb('#f5c518')
RAYA_NEGRA = rgb('#23252b')
RODILLO = rgb('#c9ced6')
RODILLO_EJE = rgb('#4b5563')
PATA = rgb('#4b5563')
CARTA = rgb('#f2efe6')
CARTA_SOLAPA = rgb('#b9b4a8')
TIMBRE = rgb('#e04848')
CARTA_FORMA = [  # 7x5; esquina arriba-izquierda = posición de la carta
    'KKKKKKK',
    'KvwwwvK',
    'KwvwvtK',
    'KwwvwwK',
    'KKKKKKK',
]
CARTA_COLORES = {'K': ORILLA, 'w': CARTA, 'v': CARTA_SOLAPA, 't': TIMBRE}
BANDA_Y = 6                         # fila de arriba del hule (las cartas se apoyan encima: y = BANDA_Y - 5)
BANDA_X0, BANDA_X1 = 4, 43          # tramo del hule que se ve
CARTAS_EJEMPLO = [7, 20, 33]        # x de las cartas en CORREO_BELT_LOADED


def banda(cartas=()):
    im = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    px = im.load()
    # patas y pies
    for lx in (9, 37):
        for y in range(11, 15):
            px[lx, y] = ORILLA
            px[lx + 1, y] = PATA
            px[lx + 2, y] = ORILLA
        for x in range(lx - 1, lx + 4):
            px[x, 15] = ORILLA
    # costado del marco con rayas de peligro (filas 8-10)
    for x in range(3, 45):
        px[x, 7] = ORILLA
        px[x, 11] = ORILLA
        px[x, 8] = MARCO
        px[x, 10] = MARCO_SOMBRA
        px[x, 9] = RAYA_AMARILLA if (x // 2) % 2 == 0 else RAYA_NEGRA
    # hule de arriba: dos tonos alternados de 2 px (la página los rota para que avance)
    for x in range(BANDA_X0, BANDA_X1 + 1):
        px[x, BANDA_Y - 1] = ORILLA
        px[x, BANDA_Y] = BANDA if (x // 2) % 2 == 0 else BANDA_B
    # rodillos en las puntas (5x5)
    rodillo = ['.KKK.', 'KccoK', 'KcecK', 'KocoK', '.KKK.']
    for rx in (0, 43):
        dibujar(px, rodillo, rx, 5, {'K': ORILLA, 'c': RODILLO, 'e': RODILLO_EJE, 'o': MARCO_SOMBRA})
    for cx in cartas:
        dibujar(px, CARTA_FORMA, cx, BANDA_Y - 5, CARTA_COLORES)
    return im


def carta():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    dibujar(im.load(), CARTA_FORMA, 4, 11, CARTA_COLORES)
    return im


# ── Charola de importantes (mesa 1x1) ─────────────────────────────────────────────────────────────────────────
ETIQUETA = rgb('#fde047')
ETIQUETA_MARCA = rgb('#c81e1e')
ETIQUETA_POS = (5, 11)  # esquina de la etiqueta 5x3 (en el PNG final 16x16)
ETIQUETA_FORMA = ['YYYYY', 'YrrrY', 'YYYYY']  # renglón rojo = "texto" que la página puede repintar


def charola():
    im = al_piso(limpiar(abrir('charola_1.png')).crop((2, 0, 18, 16)), 15)
    dibujar(im.load(), ETIQUETA_FORMA, *ETIQUETA_POS, {'Y': ETIQUETA, 'r': ETIQUETA_MARCA})
    return im


# ── Lista ─────────────────────────────────────────────────────────────────────────────────────────────────────
MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)


def piezas():
    return [
        ('CORREO_MAILBOX_FLAG_UP', 'Buzón (bandera arriba)', buzon(True), 1, 2, dict(category='decor', backgroundTiles=1)),
        ('CORREO_MAILBOX_FLAG_DOWN', 'Buzón (bandera abajo)', buzon(False), 1, 2,
         dict(category='decor', backgroundTiles=1)),
        ('CORREO_INBOX_SCREEN', 'Pantalla de bandeja de entrada', bandeja(), 3, 2, dict(PARED, category='wall')),
        ('CORREO_BELT', 'Banda de cartas', banda(), 3, 1, dict(category='misc')),
        ('CORREO_BELT_LOADED', 'Banda de cartas (con cartas)', banda(CARTAS_EJEMPLO), 3, 1, dict(category='misc')),
        ('CORREO_LETTER', 'Carta', carta(), 1, 1, MESA),
        ('CORREO_IMPORTANT_TRAY', 'Charola de importantes', charola(), 1, 1, MESA),
    ]


def hoja(hechas, destino, k=4):
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    fila = [agente.crop((0, 0, 24, 44))] + hechas
    alto = max(i.height for i in fila) * k + 16
    ancho = sum(i.width * k + 8 for i in fila) + 8
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in fila:
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    destino.parent.mkdir(parents=True, exist_ok=True)
    out.save(destino)
    print('hoja:', destino)


def main():
    hechas = []
    for id_, nombre, im, fw, fh, extra in piezas():
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
