# Light Labs v3 (2026-10-06): cabezas estilo 1-UP de Mega Man y Proto Man, y Rush de pie, de perfil.
# Los cascos vacíos de frente se veían "de Hey Arnold" y Rush feo. Dibujados por código como homenaje,
# mirando las referencias del juego (caras de MMKB y el sprite de Rush), sin copiarlas pixel por pixel.
#   HELMET_TABLE: mesa blanca (originales/mesa_casco.png) con la cabeza de Mega Man encima
#   PROTO_CASE:   vitrina (vitrina_proto.py) con la cabeza de Proto Man y su bufanda amarilla
#   RUSH:         1×1, de pie, de perfil
# Uso: python arte/pixellab/lightlabs/cabezas.py  [--vista]  (con --vista solo hace la hoja ampliada)
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import CONTORNO, abrir, guardar, pintar  # noqa: E402

PIEL, PIEL_OSC = (252, 196, 170, 255), (220, 140, 116, 255)
BLANCO, NEGRO = (248, 248, 248, 255), (16, 16, 24, 255)

MEGA = [
    '....oooooooo....',
    '..ooBBBCCBBBoo..',
    '.oBBBBBCCBBBBBo.',
    '.oBBBBBCCBBBBBo.',
    'oBBBBooooooBBBBo',
    'oBBBoSSSSSSoBBBo',
    'oCCoWWWSSWWWoCCo',
    'oCCoWWKSSKWWoCCo',
    'oCCoWWKSSKWWoCCo',
    'oBBoSSSSSSSSoBBo',
    '.oBoSSSSSSSSoBo.',
    '.oBBoSSsSSSoBBo.',
    '..ooBoSSSSoBoo..',
    '....ooooooo.....',
]
MEGA_COL = {'o': CONTORNO, 'B': (0, 120, 248, 255), 'C': (60, 188, 252, 255), 'S': PIEL, 's': PIEL_OSC,
            'W': BLANCO, 'K': NEGRO}

PROTO = [
    '....oooooooo....',
    '..ooRRRWWRRRoo..',
    '.oRRRRWWWWRRRRo.',
    '.oRRRWWWWWWRRRo.',
    'oRRRWWWWWWWWRRRo',
    'oRRoWWWWWWWWoRRo',
    'oWWoKKKKKKKKoWWo',
    'oWGoKKKWWKKKoGWo',
    'oWWoSSSSSSSSoWWo',
    'oRRoSSSSSSSSoRRo',
    '.oRoSSSSSSSSoRo.',
    '.oRRoSSsSSSoRRo.',
    '..ooRoSSSSoRoo..',
    '....ooooooo.....',
]
PROTO_COL = {'o': CONTORNO, 'R': (216, 32, 56, 255), 'W': BLANCO, 'K': NEGRO, 'G': (60, 200, 80, 255),
             'S': PIEL, 's': PIEL_OSC}

RUSH = [
    '................',
    '..oo...oo.......',
    '.oWRo.oWRo......',
    '.oRRooRRRo......',
    'oRRRRRRRRRo.....',
    'oRRRRRKRRRo.....',
    'oWWWRRRRRRo...oo',
    'oWWWWoRRRRo..oWo',
    '.ooooRRRRRRooRo.',
    '....oRRRRRRRRRo.',
    '....oRWRRRRWRRo.',
    '....oRRRRRRRRRo.',
    '....oRRo..oRRo..',
    '....oRo...oRo...',
    '....oWo...oWo...',
    '....ooo...ooo...',
]
RUSH_COL = {'o': CONTORNO, 'R': (224, 48, 40, 255), 'W': BLANCO, 'K': NEGRO}

AMARILLO, AMARILLO_OSC = (252, 204, 40, 255), (200, 146, 20, 255)


def mesa_mega():
    mesa = abrir(AQUI, 'mesa_casco.png')
    px = mesa.load()
    for y in range(16):  # borra lo que había encima de la mesa
        for x in range(mesa.width):
            px[x, y] = (0, 0, 0, 0)
    cabeza = pintar(MEGA, MEGA_COL)
    mesa.alpha_composite(cabeza, (8, 16 - cabeza.height + 1))
    return mesa


def vitrina_proto():
    import vitrina_proto as v  # marco, vidrio y pedestal
    im = v.vitrina_vacia()
    cabeza = pintar(PROTO, PROTO_COL)
    im.alpha_composite(cabeza, (8, 7))
    im.alpha_composite(v.bufanda())
    return im


sys.path.insert(0, str(AQUI))
piezas = [mesa_mega(), vitrina_proto(), pintar(RUSH, RUSH_COL)]
hoja = Image.new('RGBA', (32 + 32 + 16 + 8, 32), (40, 60, 110, 255))
x = 0
for p in piezas:
    hoja.alpha_composite(p, (x, 32 - p.height))
    x += p.width + 4
hoja.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(AQUI / 'cabezas_x8.png')
if '--vista' not in sys.argv:
    guardar('HELMET_TABLE', 'Mesa con la cabeza de Mega Man', piezas[0], 2, 2, backgroundTiles=1)
    guardar('PROTO_CASE', 'Vitrina de Proto Man', piezas[1], 2, 2, backgroundTiles=1)
    guardar('RUSH', 'Rush', piezas[2], 1, 1)
