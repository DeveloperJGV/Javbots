# Piezas del taller dibujadas por código (sin PixelLab): planas y simples salen más limpias así.
# Se importa desde armar.py. Cada dibujo es un mapa de letras -> colores.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import CONTORNO, pintar  # noqa: E402,F401


# ── Hoverboard rosa colgado (pared, 2×1 = 32×16) ─────────────────
HOVERBOARD = [
    '................................',
    '................................',
    '........g..............g........',
    '........g..............g........',
    '...ooooooooooooooooooooooooo....',
    '..oPPPPPPPPPPPPPPPPPPPPPPPPPPo..',
    '.oyyPpPPPPPPPPPPPPPPPPPPPPpPGGo.',
    '.oyyPPPGGGGGGGGGGGGGGGGGGPPPGGo.',
    '.oyyPPPPPPPPPPPPPPPPPPPPPPPPGGo.',
    '..oDDDDDDDDDDDDDDDDDDDDDDDDDDo..',
    '...oooooooooooooooooooooooooo...',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
]
HOVERBOARD_COL = {
    'o': CONTORNO, 'P': (240, 88, 170, 255), 'p': (255, 170, 215, 255), 'D': (170, 50, 120, 255),
    'G': (120, 220, 90, 255), 'y': (250, 220, 60, 255), 'g': (130, 135, 145, 255),
}

# ── Caja de plutonio (piso, 1×1 = 16×16) ─────────────────────────
PLUTONIO = [
    '................',
    '................',
    '................',
    '..oooooooooooo..',
    '..oLLLLLLLLLLo..',
    '..oLLLLhhLLLLo..',
    '..oooooooooooo..',
    '..oMMMMMMMMMMo..',
    '..oMYYYYYYYYMo..',
    '..oMYkYkkYkYMo..',
    '..oMYYkkkkYYMo..',
    '..oMYYYkkYYYMo..',
    '..oMYYkYYkYYMo..',
    '..oMYYYYYYYYMo..',
    '..oooooooooooo..',
    '................',
]
PLUTONIO_COL = {
    'o': CONTORNO, 'L': (190, 196, 205, 255), 'h': (90, 95, 105, 255), 'M': (150, 156, 166, 255),
    'Y': (250, 205, 40, 255), 'k': (30, 30, 30, 255),
}

# ── Llantas apiladas (piso, 1×2 = 16×32) ─────────────────────────
_LLANTA = [  # una llanta de frente: banda redondeada con dibujo
    '..oooooooooooo..',
    '.oggggggggggggo.',
    'oRtRRtRRtRRtRRRo',
    'oRRRRRRRRRRRRRRo',
    'oRtRRtRRtRRtRRRo',
    '.oRRRRRRRRRRRRo.',
    '..oooooooooooo..',
]
_TAPA = [  # la de arriba se ve también por encima, con el hueco del rin
    '...oooooooooo...',
    '..oRRRRRRRRRRo..',
    '.oRRRoooooooRRo.',
    '.oRRohhhhhhoRRo.',
    '.oRRRoooooooRRo.',
]
LLANTAS = ['................'] * 11 + _TAPA + _LLANTA[1:] + _LLANTA[1:] + _LLANTA[1:4] + ['................'] * 0
LLANTAS = (LLANTAS + ['................'] * 32)[:32]
LLANTAS_COL = {'o': CONTORNO, 'g': (84, 87, 95, 255), 'R': (52, 54, 60, 255), 't': (32, 33, 38, 255), 'h': (120, 124, 132, 255)}

# ── Letrero de la tienda de tofu, con "とうふ" (pared, 2×1 = 32×16) ──
_TO = ['..#....', '..#....', '..#.##.', '..##...', '.#.....', '.#.....', '..####.']
_U = ['..###..', '.......', '.####..', '.....#.', '.....#.', '....#..', '..##...']
_FU = ['...#...', '....#..', '...#...', '.#..#..', '#...#.#', '...#...', '..#....']


def letrero_tofu():
    filas = ['wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww', 'wccccccccccccccccccccccccccccccw']
    for y in range(7):
        texto = _TO[y] + '..' + _U[y] + '..' + _FU[y]
        filas.append('wcc' + texto.replace('.', 'c').replace('#', 'k') + 'cccw')
    filas += ['wccccccccccccccccccccccccccccccw'] * 5 + ['wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww']
    filas += ['................................'] * (16 - len(filas))
    return pintar(filas, {'w': (110, 70, 40, 255), 'c': (238, 230, 205, 255), 'k': (25, 25, 25, 255)})


# ── Letras de la puerta del AE86 (sugeridas: a este tamaño no se leen) ──
_SIGNOS = [['#.', '##'], ['##', '.#'], ['#.', '.#'], ['##', '#.'], ['.#', '##'], ['#.', '##']]
PUERTA_X, PUERTA_Y = 33, 30  # esquina de arriba a la izquierda del letrero en ae86.png
LETRA = (70, 72, 74, 255)  # gris oscuro: letra chica y delgada como la calcomanía


def letras_puerta(ae86):
    im = ae86.copy()
    x = PUERTA_X
    for signo in _SIGNOS:
        for dy, fila in enumerate(signo):
            for dx, ch in enumerate(fila):
                if ch == '#':
                    im.putpixel((x + dx, PUERTA_Y + dy), LETRA)
        x += 3
    return im


def hoverboard():
    return pintar(HOVERBOARD, HOVERBOARD_COL)


def plutonio():
    return pintar(PLUTONIO, PLUTONIO_COL)


def llantas():
    return pintar(LLANTAS, LLANTAS_COL)


# ── Gato hidráulico de patín (piso, 2×1 = 32×16) ─────────────────
GATO = [
    '...........................kk...',
    '..........................kk....',
    '.........................kk.....',
    '........................kk......',
    '.......................kk.......',
    '......................kk........',
    '.....oooooooooooooooookk........',
    '....oRRRRRRRRRRRRRRRRok.........',
    '..ooRRrrRRRRRRRRRRRRRo..........',
    '.oSSoRRRRRRRRRRRRRRRRo..........',
    '.oSSoooooooooooooooooo..........',
    '..oo...ww.........ww............',
    '.......ww.........ww............',
    '................................',
    '................................',
    '................................',
]
GATO_COL = {'o': CONTORNO, 'R': (200, 40, 40, 255), 'r': (240, 110, 100, 255), 'S': (150, 156, 166, 255),
            'k': (60, 62, 70, 255), 'w': (40, 40, 46, 255)}


def gato():
    return pintar(GATO, GATO_COL)
