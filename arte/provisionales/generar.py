"""Muebles provisionales de la Fase 3 (hasta que llegue el arte de la Fase 4).

Genera, en webview-ui/public/assets/furniture/:
  - ZONE_SIGN_<ZONA>: un letrero de pared por zona, con un icono sencillo.
  - ZONE_POST_<ZONA>: el mismo letrero sobre un poste, para el piso (las paredes
    de los lados se dibujan de canto y ahí un letrero de pared no se ve).
  - MOONSTONES: piedras lunares de 6 colores (homenaje a Skies of Arcadia).

Uso (desde la raíz del repo):  python arte/provisionales/generar.py
"""

import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FURNITURE = os.path.join(ROOT, 'webview-ui', 'public', 'assets', 'furniture')

WOOD_DARK = (74, 46, 28, 255)
WOOD = (122, 78, 44, 255)
NAIL = (200, 200, 190, 255)

# Cada icono: lista de filas de 10 caracteres; la leyenda dice qué color es cada letra.
ICONS = {
    'CODE': ('Código', (36, 52, 44), [
        '..........',
        '.########.',
        '.#gggggg#.',
        '.#g.....#.',
        '.#.g....#.',
        '.#g.ggg.#.',
        '.########.',
        '...#..#...',
        '..######..',
        '..........',
    ], {'#': (190, 186, 170), 'g': (80, 255, 110)}),
    'LIBRARY': ('Biblioteca', (58, 46, 88), [
        '..........',
        '.r.b.gy...',
        '.r.b.gy.p.',
        '.rrbbggyp.',
        '.rrbbggypp',
        '.rrbbggypp',
        '.rrbbggypp',
        '.rrbbggypp',
        '##########',
        '..........',
    ], {'r': (200, 70, 60), 'b': (70, 110, 210), 'g': (80, 170, 90), 'y': (230, 190, 70),
        'p': (150, 90, 200), '#': (150, 110, 70)}),
    'COMMANDS': ('Comandos', (40, 40, 60), [
        '.....yy...',
        '....yy....',
        '...yy.....',
        '..yyyyyy..',
        '.....yy...',
        '....yy....',
        '...yy.....',
        '..yy......',
        '..o...o...',
        '..o...o...',
    ], {'y': (255, 230, 90), 'o': (255, 120, 40)}),
    'WEB': ('Internet', (30, 48, 80), [
        '.......s..',
        '.#....s.s.',
        '.##.......',
        '.#.#......',
        '..#.#.....',
        '...#.##...',
        '....###...',
        '.....#....',
        '....###...',
        '...#####..',
    ], {'#': (220, 224, 230), 's': (120, 220, 255)}),
    'TESTS': ('Pruebas', (232, 234, 236), [
        '...####...',
        '....##....',
        '....##....',
        '...#..#...',
        '..#....#..',
        '..#bbbb#..',
        '.#bbbbbb#.',
        '.#bbbbbb#.',
        '..######..',
        '..........',
    ], {'#': (90, 96, 104), 'b': (60, 160, 255)}),
    'COMMIT': ('Commit', (50, 34, 30), [
        '..........',
        '...gggg...',
        '..gg..gg..',
        '.gg....gg.',
        '.g......g.',
        '.g......g.',
        '.gg....gg.',
        '..gg..gg..',
        '...gggg...',
        '..........',
    ], {'g': (245, 200, 60)}),
    'PERMISSION': ('Permiso', (36, 60, 44), [
        '....##....',
        '....##....',
        '...#gg#...',
        '..#gggg#..',
        '.#gg*ggg#.',
        '.#gggg*g#.',
        '.#g*gggg#.',
        '..#gggg#..',
        '...####...',
        '..........',
    ], {'#': (210, 230, 220), 'g': (90, 230, 120), '*': (255, 255, 255)}),
    'INTERNS': ('Becarios', (70, 56, 40), [
        '..........',
        '.oo.oo.oo.',
        '.oo.oo.oo.',
        '..........',
        '.bb.bb.bb.',
        'bbbbbbbbbb',
        'bbbbbbbbbb',
        '.b..b..b..',
        '.b..b..b..',
        '..........',
    ], {'o': (240, 200, 160), 'b': (240, 130, 40)}),
    'ERROR': ('Error', (54, 40, 36), [
        '..######..',
        '.#ffffff#.',
        '#ffffffff#',
        '#fkkffkkf#',
        '#fkkffkkf#',
        '#fbffffbf#',
        '#fbfmmfbf#',
        '.#bmffmb#.',
        '..######..',
        '..b....b..',
    ], {'#': (150, 110, 105), 'f': (245, 222, 212), 'k': (30, 24, 24), 'b': (95, 175, 255),
        'm': (120, 60, 60)}),
}


def sign(board_rgb, rows, legend):
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = im.load()
    top, bottom, left, right = 11, 24, 1, 14
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            edge = y in (top, bottom) or x in (left, right)
            px[x, y] = WOOD_DARK if edge else WOOD
    for y in range(top + 2, bottom - 1):
        for x in range(left + 2, right - 1):
            px[x, y] = board_rgb + (255,)
    # Icon (10x10) fills the board's inside
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch != '.':
                px[left + 2 + dx, top + 2 + dy] = legend[ch] + (255,)
    px[left + 1, top + 1] = NAIL
    px[right - 1, top + 1] = NAIL
    return im


POST = (92, 60, 36, 255)
POST_DARK = (60, 38, 22, 255)


def post_sign(board_rgb, rows, legend):
    """Letrero de pie: el tablero arriba (fila de fondo, se puede pasar detrás) y el poste abajo."""
    wall = sign(board_rgb, rows, legend)
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    im.paste(wall.crop((0, 11, 16, 25)), (0, 3))  # tablero en las filas 3-16
    px = im.load()
    for y in range(17, 29):
        px[7, y] = POST
        px[8, y] = POST_DARK
    for x in range(5, 11):
        px[x, 29] = POST_DARK
    return im


def write_asset(asset_id, name, category, image, extra):
    folder = os.path.join(FURNITURE, asset_id)
    os.makedirs(folder, exist_ok=True)
    image.save(os.path.join(folder, asset_id + '.png'))
    manifest = {
        'id': asset_id,
        'name': name,
        'category': category,
        'type': 'asset',
        'canPlaceOnWalls': False,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': 0,
        'width': image.width,
        'height': image.height,
        'footprintW': image.width // 16,
        'footprintH': image.height // 16,
    }
    manifest.update(extra)
    with open(os.path.join(folder, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')


def moonstones():
    """Seis cristales en una base de piedra: rojo, verde, azul, amarillo, morado y plata."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    colors = [
        ((150, 30, 40), (240, 80, 80)),
        ((30, 120, 50), (110, 230, 120)),
        ((30, 60, 160), (110, 170, 255)),
        ((170, 130, 20), (255, 225, 90)),
        ((90, 40, 140), (200, 130, 255)),
        ((120, 130, 140), (235, 240, 245)),
    ]
    heights = [5, 7, 4, 6, 5, 7]
    base_y = 13
    for x in range(1, 15):
        px[x, base_y] = (110, 104, 96, 255)
        px[x, base_y + 1] = (78, 72, 66, 255)
    for i, ((dark, light), h) in enumerate(zip(colors, heights)):
        x0 = 2 + i * 2
        for k in range(h):
            y = base_y - 1 - k
            px[x0, y] = light + (255,)
            if k < h - 1:
                px[x0 + 1, y] = dark + (255,)
        px[x0, base_y - h] = (255, 255, 255, 255)  # brillo en la punta
    return im


def main():
    for key, (label, board, rows, legend) in ICONS.items():
        write_asset(
            'ZONE_SIGN_' + key,
            'Letrero ' + label,
            'wall',
            sign(board, rows, legend),
            {'canPlaceOnWalls': True},
        )
        write_asset(
            'ZONE_POST_' + key,
            'Letrero de pie ' + label,
            'decor',
            post_sign(board, rows, legend),
            {'backgroundTiles': 1},
        )
    write_asset('MOONSTONES', 'Piedras lunares', 'decor', moonstones(), {'canPlaceOnSurfaces': True})
    print('listo:', len(ICONS), 'letreros de pared,', len(ICONS), 'de pie + MOONSTONES')


if __name__ == '__main__':
    main()
