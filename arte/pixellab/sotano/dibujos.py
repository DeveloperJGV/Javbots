# Trampilla del sótano, dibujada por código (pieza plana vista desde arriba).
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import CONTORNO, pintar  # noqa: E402

TRAMPILLA = [
    '................................',
    '................................',
    '................................',
    '..oooooooooooooooooooooooooooo..',
    '..oMMMMMMMMMMMMMMMMMMMMMMMMMMo..',
    '..oMWWWWWWdWWWWWWWdWWWWWWWWWMo..',
    '..oMWiiWWWdWWWWWWWdWWWWWWiiWMo..',
    '..oMWiiWWWdWWWWWWWdWWWWWWiiWMo..',
    '..oMWWWWWWdWWWWWWWdWWWWWWWWWMo..',
    '..oMwwwwwwdwwwwwwwdwwwwwwwwwMo..',
    '..oMWWWWWWdWWWWWWWdWWWWWWWWWMo..',
    '..oMWWWWWWdWWWrrrWdWWWWWWWWWMo..',
    '..oMWWWWWWdWWrWWWrWWWWWWWWWWMo..',
    '..oMWWWWWWdWWrWWWrWWWWWWWWWWMo..',
    '..oMWWWWWWdWWWrrrWdWWWWWWWWWMo..',
    '..oMwwwwwwdwwwwwwwdwwwwwwwwwMo..',
    '..oMWWWWWWdWWWWWWWdWWWWWWWWWMo..',
    '..oMWiiWWWdWWWWWWWdWWWWWWiiWMo..',
    '..oMWiiWWWdWWWWWWWdWWWWWWiiWMo..',
    '..oMWWWWWWdWWWWWWWdWWWWWWWWWMo..',
    '..oMMMMMMMMMMMMMMMMMMMMMMMMMMo..',
    '..oooooooooooooooooooooooooooo..',
] + ['................................'] * 10
COLORES = {'o': CONTORNO, 'M': (70, 66, 64, 255), 'W': (112, 76, 46, 255), 'w': (92, 60, 36, 255),
           'd': (70, 46, 28, 255), 'i': (60, 60, 66, 255), 'r': (150, 150, 158, 255)}


def trampilla():
    return pintar(TRAMPILLA, COLORES)


# ── Monedas y llave sueltas (piso, 1×1, caminable) ───────────────
# Un centavo dorado, otro de canto y una llave gris, como recién soltados por una roca.
MONEDAS = [
    '................',
    '................',
    '................',
    '................',
    '..........ooo...',
    '.........oGGGo..',
    '.........oGyGo..',
    '...oooo..oGGGo..',
    '..oGGGGo..ooo...',
    '..oGyGGo........',
    '..oGGGDo..ooooo.',
    '..oGGDDo.oKKKKKo',
    '...oooo..oKoKooo',
    '..........oo.o..',
    '................',
    '................',
]
MONEDAS_COL = {'o': CONTORNO, 'G': (232, 184, 56, 255), 'y': (255, 236, 140, 255), 'D': (176, 124, 30, 255),
               'K': (168, 170, 180, 255)}

# ── Manchas de lágrimas (piso, 1×1, caminable) ───────────────────
# Charquitos oscuros con brillo azul: el rastro del agente que bajó llorando.
LAGRIMAS = [
    '................',
    '................',
    '................',
    '..wwww..........',
    '.wwbbww.........',
    '.wwwwww.....ww..',
    '..wwww.....wbww.',
    '...........wwww.',
    '......www...ww..',
    '.....wwbww......',
    '....wwwwwww.....',
    '.....wwwww......',
    '.ww.............',
    '.www.......ww...',
    '...........ww...',
    '................',
]
LAGRIMAS_COL = {'w': (70, 110, 150, 120), 'b': (150, 200, 240, 170)}


def monedas():
    return pintar(MONEDAS, MONEDAS_COL)


def lagrimas():
    return pintar(LAGRIMAS, LAGRIMAS_COL)


# ── Retoques de lo generado ──────────────────────────────────────
def rellenar_hueco(im, x, y, color):
    """Rellena (flood fill) el hueco transparente encerrado que empieza en (x, y)."""
    out = im.copy()
    px = out.load()
    pila = [(x, y)]
    while pila:
        cx, cy = pila.pop()
        if not (0 <= cx < out.width and 0 <= cy < out.height) or px[cx, cy][3]:
            continue
        px[cx, cy] = color
        pila += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
    return out


def entibiar_piedra(im, tono=(126, 120, 112)):
    """Pasa a gris tibio los píxeles azulados (piedra) y deja los demás (madera, fierro) igual."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and b > r + 12:
                f = 0.3 + 0.95 * (r * 299 + g * 587 + b * 114) / 1000 / 255
                px[x, y] = tuple(min(255, int(c * f)) for c in tono) + (a,)
    return out


def marcar_roca(im):
    """Roca 'marcada' (las que sueltan premio): una X azul clara en la cara."""
    out = im.copy()
    for d in range(4):
        for x, y in ((6 + d, 7 + d), (9 - d, 7 + d)):
            out.putpixel((x, y), (150, 205, 235, 255))
    return out
