# Pizarrón con fórmulas de gis, dibujado por código (el de PixelLab salió con puntitos y fondo).
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PIL import Image, ImageDraw  # noqa: E402

from muebles import CONTORNO, pintar  # noqa: E402

PIZARRON = [
    '................................',
    '................................',
    '.wwwwwwwwwwwwwwwwwwwwwwwwwwwwww.',
    '.wGGGGGGGGGGGGGGGGGGGGGGGGGGGGw.',
    '.wGccGcGGcccGGGGGGGGcGGGGGGGGGw.',
    '.wGcGGcGGGcGGGcGGGGcGcGGccGcGGw.',
    '.wGccGcGGGcGGcccGGGGcGGcGGGcGGw.',
    '.wGGGGGGGGGGGGcGGGGGGGGGccGGGGw.',
    '.wGGcGGGGGGGGGGGGGGGGGGGGGGGGGw.',
    '.wGcGcGGGcGGGGGccGcGGccGGcccGGw.',
    '.wGGcGGGcGcGGGcGGGcGcGGGGGcGGGw.',
    '.wGGGccccGGGGGGccGGGcGGGGcGGGGw.',
    '.wGGGGGGcGGGGGGGGGGGGGGGGcccGGw.',
    '.wGGGGGcGcGGGGGcccccccGGGGGGGGw.',
    '.wGGGGGGcGGGGGGGGGGGGGGGGGGGGGw.',
    '.wGGccGGGGcGGcGGcccGGGGcGGcGGGw.',
    '.wGcGGcGGcccGcGGGcGGGGcccGcGGGw.',
    '.wGGccGGGGcGGcGGGcGGGGGcGGcccGw.',
    '.wGGGGGGGGGGGGGGGGGGGGGGGGGGGGw.',
    '.wwwwwwwwwwwwwwwwwwwwwwwwwwwwww.',
    '....kkkk.................tt.....',
] + ['................................'] * 11
COLORES = {'w': (110, 72, 40, 255), 'G': (40, 74, 52, 255), 'c': (226, 232, 220, 255),
           'k': (238, 238, 230, 255), 't': (190, 150, 110, 255)}


def pizarron():
    return pintar(PIZARRON, COLORES)


# ── Bandera del Reino de la Ciencia (pared, 2×2 = 32×32) ─────────
# Basada en la reconstrucción de Wikimedia Commons (File:Flag_of_Kingdom_of_Science.svg): fondo crema, cohete
# café en diagonal con dos aletas y estrellas verdes picudas. Las estrellas usan coordenadas del original (540×360).
CREMA = (227, 222, 199, 255)
COHETE = (174, 159, 104, 255)
ESTRELLA = (186, 187, 131, 255)
PALO = (110, 72, 40, 255)
CUERDA = (60, 40, 24, 255)
# Cohete a mano (punta arriba a la izquierda, cola abajo a la derecha, una aleta a cada lado)
_COHETE = [
    'kkk.............',
    'krrkk...........',
    'krrrrkk.........',
    '.krrrrrkk.......',
    '..krrrrrrkk.....',
    '...kkrrrrrrk..k.',
    '.....kkrrrrrkkrk',
    '.......krrrrrrrk',
    '......krkrrrrrk.',
    '.....krrkkrrrk..',
    '.....krk..krk...',
    '......k....k....',
]
COHETE_X, COHETE_Y = 7, 8  # esquina del cohete en el lienzo
_ESTRELLAS = [(90, 15), (250, 45), (330, 15), (355, 70), (55, 130), (75, 260), (180, 325), (485, 20), (515, 85),
              (490, 215), (440, 335)]
X0, Y0, ANCHO, ALTO = 2, 5, 28, 19  # tela dentro del lienzo de 32×32


def _a_tela(x, y):
    return X0 + round(x * (ANCHO - 1) / 540), Y0 + round(y * (ALTO - 1) / 360)


def bandera():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((X0, Y0, X0 + ANCHO - 1, Y0 + ALTO - 1), fill=CREMA, outline=CONTORNO)
    for x, y in _ESTRELLAS:  # estrellita de 5 pixeles (cruz)
        cx, cy = _a_tela(x, y)
        cx = min(max(cx, X0 + 2), X0 + ANCHO - 3)
        cy = min(max(cy, Y0 + 2), Y0 + ALTO - 3)
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            d.point((cx + dx, cy + dy), fill=ESTRELLA)
    cohete = pintar(_COHETE, {'r': COHETE, 'k': CONTORNO})
    im.alpha_composite(cohete, (COHETE_X, COHETE_Y))
    d.line((0, 3, 31, 3), fill=PALO)  # palo de madera
    d.point((0, 3), fill=CONTORNO)
    d.point((31, 3), fill=CONTORNO)
    for x in (X0 + 1, X0 + ANCHO - 2):  # cuerditas
        d.line((x, 4, x, Y0), fill=CUERDA)
    return im


# ── Rueda de agua con generador (2×2 = 32×32) ────────────────────
# Las dos versiones de PixelLab salieron en diagonal y con ruido: se dibuja por código.
MADERA = (150, 98, 54, 255)
MADERA_OSC = (104, 66, 36, 255)
MADERA_CLARA = (190, 136, 82, 255)
COBRE = (214, 120, 58, 255)
COBRE_OSC = (150, 76, 36, 255)
FOCO = (255, 226, 120, 255)
FOCO_LUZ = (255, 248, 210, 255)
AGUA = (88, 150, 200, 255)
AGUA_CLARA = (160, 206, 236, 255)

RUEDA_C = (12, 12)  # centro del eje
RUEDA_R = 8  # radio interior del aro


def rueda():
    import math
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = RUEDA_C
    r = RUEDA_R
    # aro ancho hecho de tablitas (cangilones) alternando tono, con contorno por dentro y por fuera
    px = im.load()
    for y in range(32):
        for x in range(32):
            dist = math.hypot(x - cx, y - cy)
            if r - 1.5 <= dist < r - 0.5 or r + 2.5 < dist <= r + 3.5:
                px[x, y] = CONTORNO
            elif r - 0.5 <= dist <= r + 2.5:
                sector = int((math.atan2(y - cy, x - cx) + math.pi) / (2 * math.pi) * 16) % 16
                px[x, y] = MADERA_CLARA if sector % 2 else MADERA
    for k in range(4):  # rayos
        a = k * math.pi / 4
        dx, dy = round(math.cos(a) * (r - 2)), round(math.sin(a) * (r - 2))
        d.line((cx - dx, cy - dy, cx + dx, cy + dy), fill=MADERA_OSC)
    d.rectangle((cx - 1, cy - 1, cx + 1, cy + 1), fill=MADERA_CLARA, outline=CONTORNO)
    # canaleta de agua: la rueda se mete en ella por abajo
    d.rectangle((0, 24, 21, 30), fill=MADERA, outline=CONTORNO)
    d.line((1, 25, 20, 25), fill=AGUA_CLARA)
    d.line((1, 26, 20, 26), fill=AGUA)
    d.line((1, 28, 20, 28), fill=MADERA_OSC)
    # banda del eje al generador
    d.line((cx + 1, cy + 1, 24, 19), fill=CONTORNO)
    # generador: caja de madera con bobina de cobre
    d.rectangle((22, 19, 30, 30), fill=MADERA, outline=CONTORNO)
    for y in range(21, 29, 2):
        d.line((24, y, 28, y), fill=COBRE)
        d.line((24, y + 1, 28, y + 1), fill=COBRE_OSC)
    # alambre y foco encendido
    d.line((26, 18, 26, 15), fill=CONTORNO)
    d.ellipse((24, 9, 28, 14), fill=FOCO, outline=CONTORNO)
    d.point((25, 11), fill=FOCO_LUZ)
    d.point((26, 10), fill=FOCO_LUZ)
    return im


# ── Caja de botellas de cola de Senku (1×1 = 16×16) ──────────────
# La de PixelLab (16×16) salió borrosa y sin contorno: se dibuja por código.
CAJA = [
    '................',
    '................',
    '....o...o...o...',
    '...ooo.ooo.ooo..',
    '...kkk.kkk.kkk..',
    '...kgk.kgk.kgk..',
    '..kgggkgggkgggk.',
    '..kcwckcwckcwck.',
    '..kcwckcwckcwck.',
    '.kkkkkkkkkkkkkkk',
    '.kmmmmmmmmmmmmmk',
    '.kMMMMMMMMMMMMMk',
    '.kmmmmmmmmmmmmmk',
    '.kMMMMMMMMMMMMMk',
    '.kkkkkkkkkkkkkkk',
    '................',
]
COLORES_CAJA = {'k': CONTORNO, 'o': (176, 128, 80, 255), 'g': (170, 206, 196, 255), 'c': (96, 48, 26, 255),
                'w': (150, 92, 54, 255), 'm': MADERA, 'M': MADERA_OSC}


def cola():
    return pintar(CAJA, COLORES_CAJA)
