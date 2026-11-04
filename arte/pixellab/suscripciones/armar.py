# Cuarto de suscripciones (SUSCRIPCIONES_*): caja fuerte, alcancía, calendario de cobros, recibos, tarjeta y pantallita.
# Originales de PixelLab en originales/ (lista en trabajos.txt; create_image_pixen, view=side, plantilla de muebles de
# frente de PIXELLAB.md §3). Lo plano (recibos, tarjeta, pantallita, casillas del calendario) va dibujado por código.
#
#   caja_fuerte_1.png (32x32) caja fuerte gris de frente -> 2x2 tal cual (30x28 dibujado), bajada al piso
#   alcancia_2.png    (20x20) alcancía de perfil -> se borra la moneda flotante y se quitan 2 columnas del lomo (16 px)
#   calendario_1.png  (32x32) calendario de pared -> se acorta el encabezado rojo, se alarga la hoja y se le quita la
#                     esquina doblada; las casillas van por código
#   Descartes: caja_fuerte_2 (verde, salió en 3/4), alcancia_1 (de frente, 18 px, parece cara), pincho_1 (6 px, ilegible),
#   pantallita_1 (rayas en X alrededor).
#
# Uso:  python arte/pixellab/suscripciones/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) e
# vista_x4.png.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, contorno, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def rect(px, x0, y0, x1, y1, c):
    """Rellena de x0..x1, y0..y1 (incluidos)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def en_lienzo(im, w, h, abajo=0):
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - abajo - pieza.height))
    return out


ORILLA = rgb('#2a1e2a')

# ── Caja fuerte 2x2 ────────────────────────────────────────────────────────────────────────────────────────────


def caja_fuerte():
    im = abrir('caja_fuerte_1.png')
    return al_piso(im, im.height - 1)


# ── Alcancía 1x1 ───────────────────────────────────────────────────────────────────────────────────────────────
RANURA = [(6, 4), (7, 4)]  # ranura de las monedas en el lomo (px del PNG final)
QUITAR_LOMO = (10, 11)  # columnas del lomo que se quitan (rosa liso) para que mida 16 de ancho


def alcancia():
    im = abrir('alcancia_2.png')
    px = im.load()
    for y in range(0, 6):  # moneda flotante (filas 0-5, x 7-12); la oreja (x 13-15) se queda
        for x in range(7, 13):
            if y < 5 or x < 12:
                px[x, y] = (0, 0, 0, 0)
    cols = [x for x in range(im.width) if x not in QUITAR_LOMO]
    out = Image.new('RGBA', (len(cols), im.height), (0, 0, 0, 0))
    for nx, x in enumerate(cols):
        out.paste(im.crop((x, 0, x + 1, im.height)), (nx, 0))
    out = en_lienzo(out, 16, 16)
    px = out.load()
    for x, y in RANURA:
        px[x, y] = rgb('#5a2038')
    return out


# ── Calendario 2x2 de pared ────────────────────────────────────────────────────────────────────────────────────
# Se arma por filas del original: arillos y encabezado (0-9), cierre del encabezado (15-17), hoja blanca (fila 20
# repetida) y orilla de abajo (30-31).
CAL_SEMANA_Y = 14  # renglón de los días de la semana (7 marcas de 3x1)
CAL_X0, CAL_Y0 = 2, 16  # primera casilla
CAL_COLUMNAS, CAL_FILAS = 7, 5
CAL_CASILLA = (3, 2)  # ancho x alto de cada casilla; paso de 4 a lo ancho y 3 a lo alto
CASILLA_VACIA = rgb('#e8dde8')
CASILLA_MARCADA = rgb('#d0283c')
CASILLA_HOY = rgb('#f0a23a')
SEMANA = rgb('#b9a6b9')


def casilla(dia):
    """Casilla del día 0..34 (fila = dia // 7): (x, y, ancho, alto) dentro del PNG de 32x32."""
    col, fila = dia % CAL_COLUMNAS, dia // CAL_COLUMNAS
    return (CAL_X0 + col * 4, CAL_Y0 + fila * 3, *CAL_CASILLA)


def calendario(marcados=(), hoy=None):
    src = _abrir(AQUI, 'calendario_1.png')
    filas = list(range(0, 10)) + [15, 16, 17] + [20] * 17 + [30, 31]
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    for ny, y in enumerate(filas):
        im.paste(src.crop((0, y, 32, y + 1)), (0, ny))
    im = limpiar(im)
    px = im.load()
    for d in range(CAL_COLUMNAS):
        x = CAL_X0 + d * 4
        rect(px, x, CAL_SEMANA_Y, x + 2, CAL_SEMANA_Y, SEMANA)
    for dia in range(CAL_COLUMNAS * CAL_FILAS):
        x, y, w, h = casilla(dia)
        c = CASILLA_MARCADA if dia in marcados else CASILLA_HOY if dia == hoy else CASILLA_VACIA
        rect(px, x, y, x + w - 1, y + h - 1, c)
    return im


# ── Recibos en un pincho 1x1 (por código) ──────────────────────────────────────────────────────────────────────
RECIBOS = [
    '.......p........',
    '.......P........',
    '.......P........',
    '.......P........',
    '....wwwPwww.....',
    '....dddPddd.....',
    '......wPwwwww...',
    '......dPddddd...',
    '...wwwwPwww.....',
    '...ddddPddd.....',
    '.....wwPwwww....',
    '.....wwPwwww....',
    '.....ddPdddd....',
    '....oooPooooo...',
    '...oNNNNNNNNNo..',
    '....ooooooooo...',
]
COLORES_RECIBOS = {
    'p': rgb('#e8ecf0'), 'P': rgb('#9aa3ae'), 'w': rgb('#f6f2e8'), 'd': rgb('#cfc6b6'),
    'o': ORILLA, 'N': rgb('#4a4252'),
}

def recibos():
    """Primero los papeles con contorno; encima el pincho y la base (si no, el contorno engorda el pincho)."""
    papeles = pintar([f.replace('P', 'w').replace('p', '.').replace('o', '.').replace('N', '.') for f in RECIBOS],
                     COLORES_RECIBOS)
    papeles = contorno(papeles)
    pincho = pintar([''.join(c if c in 'pPoN' else '.' for c in f) for f in RECIBOS], COLORES_RECIBOS)
    papeles.alpha_composite(pincho)
    return papeles


# ── Tarjeta genérica 1x1 (por código: sin marca ni números) ────────────────────────────────────────────────────
TARJETA = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.oooooooooooooo.',
    '.oaaaaaaaaaaaao.',
    '.oaggaaaaaaaaao.',
    '.oaGgaaaaaaaaao.',
    '.oaaaaaaaaaaaao.',
    '.oallaaalllaaao.',
    '.oAAAAAAAAAAAAo.',
    '.oAAAAAAAAAAAAo.',
    '.oooooooooooooo.',
    '................',
    '................',
]
COLORES_TARJETA = {
    'o': ORILLA, 'a': rgb('#4a62c8'), 'A': rgb('#3a4ea8'), 'g': rgb('#f2cf5a'), 'G': rgb('#c89a2a'),
    'l': rgb('#8a9ee8'),
}

# ── Pantallita de "próximo cobro" 1x1 de mesa (por código) ─────────────────────────────────────────────────────
PANTALLITA = (3, 6, 12, 10)  # zona de pantalla (x0, y0, x1, y1): 10x5 px; la página escribe la fecha o el monto
LCD = rgb('#1f4a3c')
LCD_CLARO = rgb('#7fe0b0')


def pantallita(muestra=False):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    rect(px, 1, 4, 14, 13, ORILLA)
    rect(px, 2, 5, 13, 12, rgb('#4a4f5c'))
    rect(px, 2, 5, 13, 5, rgb('#5e6474'))
    rect(px, 2, 12, 13, 12, rgb('#383c48'))
    x0, y0, x1, y1 = PANTALLITA
    rect(px, x0, y0, x1, y1, LCD)
    px[12, 11] = rgb('#e85a4a')  # foquito rojo: cobro cercano
    px[3, 11] = px[4, 11] = rgb('#8a90a0')  # botoncitos
    for x in (2, 3, 12, 13):  # patitas
        px[x, 14] = ORILLA
    if muestra:  # "3 d" en barras (solo para la hoja de vista)
        for x, y in ((4, 7), (5, 7), (6, 7), (6, 8), (5, 9), (6, 9), (6, 10), (4, 10), (5, 10),
                     (9, 8), (9, 9), (9, 10), (10, 7), (10, 8), (10, 9), (10, 10), (8, 9), (8, 10)):
            px[x, y] = LCD_CLARO
    return im


def pintar(filas, colores):
    im = Image.new('RGBA', (len(filas[0]), len(filas)), (0, 0, 0, 0))
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch in colores:
                im.putpixel((x, y), colores[ch])
    return im


# ── Lista ──────────────────────────────────────────────────────────────────────────────────────────────────────
MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)
MARCADOS_MUESTRA = (4, 12, 25)


def piezas():
    return [
        ('SUSCRIPCIONES_SAFE', 'Caja fuerte', caja_fuerte(), 2, 2, dict(category='storage', backgroundTiles=1)),
        ('SUSCRIPCIONES_PIGGY_BANK', 'Alcancía', alcancia(), 1, 1, MESA),
        ('SUSCRIPCIONES_CALENDAR', 'Calendario de cobros', calendario(), 2, 2, PARED),
        ('SUSCRIPCIONES_CALENDAR_MARKED', 'Calendario de cobros (marcado)', calendario(MARCADOS_MUESTRA, hoy=10), 2, 2,
         PARED),
        ('SUSCRIPCIONES_RECEIPTS', 'Recibos en pincho', recibos(), 1, 1, MESA),
        ('SUSCRIPCIONES_CARD', 'Tarjeta', pintar(TARJETA, COLORES_TARJETA), 1, 1, MESA),
        ('SUSCRIPCIONES_NEXT_CHARGE', 'Pantallita de próximo cobro', pantallita(), 1, 1, MESA),
    ]


def hoja(imagenes, ruta, k=4):
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    fila = [agente.crop((0, 0, 24, 44))] + imagenes
    alto = 48 * k + 16
    ancho = sum(i.width * k + 8 for i in fila) + 8
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in fila:
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    ruta.parent.mkdir(parents=True, exist_ok=True)
    out.save(ruta)
    print('hoja:', ruta)


def main():
    hechas = []
    for id_, nombre, im, fw, fh, extra in piezas():
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    hechas.append(pantallita(muestra=True))  # cómo se ve con datos (solo en la hoja)
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
