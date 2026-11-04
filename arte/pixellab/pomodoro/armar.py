# Rincón pomodoro (núcleo de la oficina, genérico): temporizadores, reloj de arena, tapete, botella, pesas, letrero
# DESCANSO y lámpara de enfoque. Originales de PixelLab en originales/ (lista en trabajos.txt); create_image_pixen,
# view=side, plantilla de muebles de frente.
#
#   jitomate_pared_1.png  32x32 (v1 de 2): jitomate-reloj grande de pared, tal cual (limpio).
#   jitomate_1/2.png      20x20: la franja blanca con rayas negras se lee como dientes -> el de mesa va POR CÓDIGO.
#   reloj_arena_1.png     20x20 (12x18 dibujado): se quitan 2 filas repetidas para que quepa en 1x1.
#   reloj_arena_2.png     28x28 (17x24): se quita 1 columna casi repetida -> 1x2 de piso.
#   botella_1.png         20x20: se quita la orilla verde-amarilla (halo) pasándola a azul.
#   pesas_1.png           20x20: una mancuerna (una segunda encimada detrás se veía revuelta).
#   tapete_1.png          32x32: tapete enrollado (2x2, se puede pisar la fila de arriba).
#   lampara_1/2.png       20x20: de lado y sucias -> la lámpara de enfoque (tipo banquero) va POR CÓDIGO, _ON y _OFF.
#   Letrero DESCANSO y tapete extendido: 100 % por código.
#
# Uso:  python arte/pixellab/pomodoro/armar.py
# Escribe webview-ui/public/assets/furniture/POMODORO_*/ (PNG + manifest.json) y vista_x4.png. No gasta.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar, pintar  # noqa: E402
from digital import jitomate_digital  # noqa: E402

CONTORNO = (27, 27, 34, 255)
T = (0, 0, 0, 0)


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def en_lienzo(im, w, h, abajo=0):
    """Lo dibujado, abajo al centro de un lienzo w x h (dejando `abajo` filas libres)."""
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), T)
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - abajo - pieza.height))
    return out


def sin_filas(im, filas):
    keep = [y for y in range(im.height) if y not in filas]
    out = Image.new('RGBA', (im.width, len(keep)), T)
    for ny, y in enumerate(keep):
        out.paste(im.crop((0, y, im.width, y + 1)), (0, ny))
    return out


def sin_columnas_parecidas(im, n):
    """Quita las `n` columnas más parecidas a su vecina (de adentro del dibujo): angosta sin reducir."""
    for _ in range(n):
        x0, _, x1, _ = im.getbbox()
        px = im.load()
        dif = lambda x: sum(px[x, y] != px[x - 1, y] for y in range(im.height))  # noqa: E731
        x = min(range(x0 + 2, x1 - 2), key=dif)
        out = Image.new('RGBA', (im.width - 1, im.height), T)
        out.paste(im.crop((0, 0, x, im.height)), (0, 0))
        out.paste(im.crop((x + 1, 0, im.width, im.height)), (x, 0))
        im = out
    return im


# ── Jitomate de mesa (por código) ────────────────────────────────────────────────────────────────────────────────
# Mismos rojos y verdes que el de pared para que se vean de la misma familia.
JIT = {
    'o': (58, 12, 20, 255),     # contorno
    'R': (214, 38, 40, 255),    # rojo
    'r': (156, 20, 30, 255),    # rojo sombra
    'h': (255, 150, 120, 255),  # brillo
    'G': (86, 178, 62, 255),    # hoja
    'g': (44, 112, 48, 255),    # hoja sombra
    'W': (246, 242, 222, 255),  # franja del dial (lisa: con marcas se lee como dientes)
    'w': (196, 190, 172, 255),  # franja sombra
    'k': (40, 30, 34, 255),     # flecha
}
JITOMATE = [
    '......og......',
    '....ooGgoo....',
    '..ooGGgGGgoo..',
    '.orRgRRRRgRho.',
    'orRRRRRRRRRhRo',
    'orRRRRRkRRRRRo',
    'oWWWWWWWWWWWWo',
    'owwwwwwwwwwwwo',
    'orRRRRRRRRRRRo',
    'orrRRRRRRRRRro',
    '.orrRRRRRRRro.',
    '..oorrrrrroo..',
    '....oooooo....',
]


def jitomate_mesa():
    return en_lienzo(pintar(JITOMATE, JIT), 16, 16, abajo=1)


# ── Lámpara de enfoque (tipo banquero, por código) ───────────────────────────────────────────────────────────────
LUZ_ON = (255, 236, 150, 255)
LAM = {
    'o': (34, 30, 30, 255),
    'G': (52, 128, 84, 255),    # pantalla verde
    'h': (120, 200, 150, 255),  # brillo de la pantalla
    'g': (28, 82, 54, 255),     # pantalla sombra
    'B': (214, 170, 72, 255),   # latón
    'b': (150, 108, 40, 255),   # latón sombra
}
LAMPARA = [
    '..oooooooooo..',
    '.oGhhGGGGGGGo.',
    'oGhGGGGGGGGGGo',
    'oggggggggggggo',
    'oLLLLLLLLLLLLo',
    '.ooooooBooooBo',
    '.....oBbo...b.',
    '.....oBbo.....',
    '.....oBbo.....',
    '.....oBbo.....',
    '...ooBBbboo...',
    '..oBBBBBBbbo..',
    '..obbbbbbbbo..',
    '...oooooooo...',
]


def lampara(prendida):
    col = dict(LAM, L=LUZ_ON if prendida else (60, 58, 52, 255))
    im = pintar(LAMPARA, col)
    if prendida:  # base iluminada (el resplandor de noche lo pone la página)
        px = im.load()
        for x in range(3, 9):
            if px[x, 11] == LAM['B']:
                px[x, 11] = (246, 214, 120, 255)
    return en_lienzo(im, 16, 16, abajo=1)


# ── Letrero DESCANSO (neón por código, 3x1 de pared) ─────────────────────────────────────────────────────────────
NEON_TABLA = (24, 30, 36, 255)
NEON = {  # tubo, brillo, resplandor
    True: ((110, 245, 170, 255), (210, 255, 230, 255), (30, 105, 70, 255)),
    False: ((70, 96, 88, 255), (88, 116, 106, 255), None),
}
MARCO = {True: (255, 196, 110, 255), False: (92, 84, 72, 255)}
LETRAS = {
    'D': ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    'S': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
    'C': ['XXX', 'X..', 'X..', 'X..', 'XXX'],
    'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    'N': ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],  # 4 de ancho: en 3 se lee M
    'O': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
}


def letrero(prendido=True):
    tubo, brillo, halo = NEON[prendido]
    im = Image.new('RGBA', (48, 16), T)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 2, 47, 13], fill=CONTORNO)
    d.rectangle([1, 3, 46, 12], fill=NEON_TABLA)
    for x, y in ((0, 2), (47, 2), (0, 13), (47, 13)):
        im.putpixel((x, y), T)
    d.rectangle([2, 3, 45, 12], outline=MARCO[prendido])
    for x, y in ((2, 3), (45, 3), (2, 12), (45, 12)):
        im.putpixel((x, y), NEON_TABLA)
    px = im.load()
    texto = 'DESCANSO'
    ancho = sum(len(LETRAS[c][0]) for c in texto) + len(texto) - 1
    x, y0 = (48 - ancho) // 2, 5
    puntos = set()
    for c in texto:
        for dy, fila in enumerate(LETRAS[c]):
            for dx, ch in enumerate(fila):
                if ch == 'X':
                    puntos.add((x + dx, y0 + dy))
        x += len(LETRAS[c][0]) + 1
    if halo:  # resplandor solo bajo la base de las letras (§14)
        for x, y in puntos:
            if y == y0 + 4 and px[x, y + 1] == NEON_TABLA:
                px[x, y + 1] = halo
    for x, y in puntos:
        px[x, y] = brillo if (x, y - 1) not in puntos else tubo
    return im


# ── Tapete extendido (por código, 1x2 visto desde arriba como las alfombras) ─────────────────────────────────────
def tapete_extendido():
    im = Image.new('RGBA', (16, 32), T)
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, 14, 30], fill=(22, 70, 72, 255))          # contorno teal oscuro
    d.rectangle([2, 2, 13, 29], fill=(40, 150, 140, 255))        # tapete
    d.rectangle([2, 27, 13, 29], fill=(30, 118, 112, 255))       # sombra del borde de abajo
    for y in range(5, 27, 4):                                     # textura de rayas suaves
        d.line([3, y, 12, y], fill=(52, 168, 156, 255))
    return im


# ── Piezas de PixelLab ──────────────────────────────────────────────────────────────────────────────────────────
def reloj_arena_mesa():
    im = abrir('reloj_arena_1.png')
    return en_lienzo(sin_filas(im, {7, 14}), 16, 16)


def reloj_arena_piso():
    im = sin_columnas_parecidas(abrir('reloj_arena_2.png'), 1)
    return en_lienzo(im, 16, 32)


def botella():
    im = abrir('botella_1.png')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and g > b + 10:  # verde-amarillo de la orilla -> azul sombra del plástico
                px[x, y] = (70, 130, 190, a)
    return en_lienzo(im, 16, 16)


def pesas():
    una = abrir('pesas_1.png')
    px = una.load()
    for y in range(una.height):
        for x in range(una.width):
            r, g, b, a = px[x, y]
            if a and g > r and g > b:  # canto verdoso -> morado oscuro
                px[x, y] = (72, 36, 70, a)
    return en_lienzo(una, 16, 16, abajo=1)


def tapete_enrollado():
    im = abrir('tapete_1.png')
    return al_piso(im, 31)


def jitomate_pared():
    return jitomate_digital(abrir('jitomate_pared_1.png'))  # carátula de manecillas -> pantalla digital


MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)
PIEZAS = [
    ('POMODORO_TIMER', 'Temporizador de jitomate', jitomate_mesa, 1, 1, MESA),
    ('POMODORO_TIMER_WALL', 'Reloj de jitomate (pared)', jitomate_pared, 2, 2, PARED),
    ('POMODORO_HOURGLASS', 'Reloj de arena', reloj_arena_mesa, 1, 1, MESA),
    ('POMODORO_HOURGLASS_BIG', 'Reloj de arena grande', reloj_arena_piso, 1, 2,
     dict(category='decor', backgroundTiles=1)),
    ('POMODORO_WATER_BOTTLE', 'Botella de agua', botella, 1, 1, MESA),
    ('POMODORO_DUMBBELLS', 'Mancuernas', pesas, 1, 1, dict(category='misc')),
    ('POMODORO_YOGA_MAT_ROLLED', 'Tapete de yoga enrollado', tapete_enrollado, 2, 2,
     dict(category='misc', backgroundTiles=1)),
    ('POMODORO_YOGA_MAT', 'Tapete de yoga extendido', tapete_extendido, 1, 2,
     dict(category='misc', backgroundTiles=2)),
    ('POMODORO_BREAK_SIGN', 'Letrero DESCANSO (prendido)', lambda: letrero(True), 3, 1, PARED),
    ('POMODORO_BREAK_SIGN_OFF', 'Letrero DESCANSO (apagado)', lambda: letrero(False), 3, 1, PARED),
    ('POMODORO_FOCUS_LAMP_ON', 'Lámpara de enfoque (prendida)', lambda: lampara(True), 1, 1, MESA),
    ('POMODORO_FOCUS_LAMP_OFF', 'Lámpara de enfoque (apagada)', lambda: lampara(False), 1, 1, MESA),
]


def hoja(hechas, salida, k=4):
    """Hoja de escala: un agente (char_0, cuadro 0,0,24,44) a la izquierda y las piezas, todo x k sobre el piso."""
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    ims = [agente.crop((0, 0, 24, 44))] + hechas
    ancho = sum(i.width * k + 16 for i in ims) + 16
    alto = max(i.height for i in ims) * k + 32
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    d = ImageDraw.Draw(out)
    x = 16
    for n, i in enumerate(ims):
        y0 = alto - 16 - i.height * k
        if n:  # cuadrícula de 16 px detrás de cada pieza (no del agente)
            for gx in range(0, i.width, 16):
                for gy in range(0, i.height, 16):
                    d.rectangle([x + gx * k, y0 + gy * k, x + (gx + 16) * k - 1, y0 + (gy + 16) * k - 1],
                                outline=(95, 95, 118, 255))
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, y0))
        x += i.width * k + 16
    out.save(salida)
    print('vista:', salida)


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
