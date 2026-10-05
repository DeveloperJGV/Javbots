# Sala de Becarios v2 (2026-10-05): sala de descanso con sillones icónicos y rincón gamer.
# Por código: BEANBAG (puff, asiento), POSTER_INVADER / POSTER_GHOST / POSTER_TETRIS (pared 1×2), LAVA_LAMP (piso 1×2,
#   animada con kind 'cycle': colores LAVA_BANDS de constants.ts), BOAT_PAINTING (el velero sobre el sillón de Los
#   Simpson, pared 2×2), MUG_TABLE (mesita con dos tazas gigantes de cafetería, como en Friends, 2×1).
# De PixelLab (originales/, create_image_pixen, view=side): sofa_friends.png 48x32, sofa_simpson.png 48x32,
#   arcade.png 32x48, tele.png 32x32.
# Uso: python arte/pixellab/becarios/armar_v2.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, contorno, guardar, pintar  # noqa: E402


def hexa(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


LAVA = [hexa(c) for c in ('#ff5a3c', '#ff9a3c', '#b8389c', '#7a2a8a')]  # = LAVA_BANDS en constants.ts
NEGRO, MARCO = (20, 20, 28, 255), (60, 60, 72, 255)


def puff():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((1, 5, 14, 15), fill=(120, 60, 170, 255))
    d.ellipse((3, 4, 12, 10), fill=(150, 84, 200, 255))
    d.line((5, 6, 8, 5), fill=(190, 130, 235, 255))
    return contorno(im)


def poster(fondo, dibujo, colores, dx, dy):
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 4, 14, 27), fill=fondo)
    d.point([(2, 5), (13, 5)], fill=(200, 200, 210, 255))  # chinches
    im.alpha_composite(pintar(dibujo, colores), (dx, dy))
    return contorno(im)


INVASOR = ['..g.....g..', '...g...g...', '..ggggggg..', '.gg.ggg.gg.', 'ggggggggggg', 'g.ggggggg.g',
           'g.g.....g.g', '...gg.gg...']
FANTASMA = ['...rrrr...', '.rrrrrrrr.', 'rrwwrrwwrr', 'rrwbrrwbrr', 'rrrrrrrrrr', 'rrrrrrrrrr', 'rr.rr.rr.r']
TETRIS = ['..cc......', '..cc......', '..........', 'yyy....mm.', '.y....mm..', '..........', 'r.......o.',
          'rr.....oo.', '.r......o.', '..........', 'bbbb..gg..', '.......gg.', 'cbbbyyymmo', 'cccyyrrmoo']
TETRIS_COL = {'c': (80, 220, 240, 255), 'y': (250, 220, 40, 255), 'm': (200, 70, 220, 255), 'r': (230, 50, 50, 255),
              'o': (250, 150, 30, 255), 'b': (50, 90, 230, 255), 'g': (70, 210, 80, 255)}


def lampara_lava():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(5, 26), (10, 26), (12, 31), (3, 31)], fill=(170, 176, 188, 255))  # base
    d.polygon([(6, 6), (9, 6), (11, 25), (4, 25)], fill=LAVA[3])  # vidrio
    for y in range(7, 25):  # bandas de lava que la página hace subir
        for x in range(4, 12):
            if im.getpixel((x, y))[3]:
                im.putpixel((x, y), LAVA[((y + (x % 3)) // 2) % 4])
    d.polygon([(6, 3), (9, 3), (9, 5), (6, 5)], fill=(170, 176, 188, 255))  # tapa
    return contorno(im)


def velero():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 6, 29, 25), fill=(196, 150, 60, 255))  # marco dorado
    d.rectangle((4, 8, 27, 23), fill=(150, 200, 230, 255))  # cielo
    d.rectangle((4, 17, 27, 23), fill=(50, 110, 180, 255))  # mar
    d.line((4, 19, 27, 19), fill=(90, 150, 210, 255))
    d.polygon([(15, 10), (15, 17), (10, 17)], fill=(250, 250, 250, 255))  # vela
    d.polygon([(16, 11), (16, 17), (20, 17)], fill=(236, 236, 236, 255))
    d.line((15, 9, 15, 18), fill=(100, 70, 40, 255))  # mástil
    d.polygon([(9, 18), (22, 18), (20, 20), (11, 20)], fill=(120, 70, 40, 255))  # casco
    return contorno(im)


def mesa_tazas():
    im = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 9, 29, 11), fill=(150, 100, 60, 255))  # cubierta
    d.line((2, 9, 29, 9), fill=(186, 134, 84, 255))
    d.rectangle((4, 12, 5, 15), fill=(110, 72, 42, 255))
    d.rectangle((26, 12, 27, 15), fill=(110, 72, 42, 255))
    for x in (8, 18):  # tazas gigantes
        d.rectangle((x, 3, x + 5, 8), fill=(244, 240, 230, 255))
        d.rectangle((x + 1, 3, x + 4, 4), fill=(110, 70, 40, 255))  # café
        d.rectangle((x + 6, 4, x + 7, 6), outline=(244, 240, 230, 255))  # asa
    return contorno(im)


guardar('BEANBAG', 'Puff', puff(), 1, 1, category='chairs', orientation='back')  # mira hacia la tele
guardar('POSTER_INVADER', 'Póster de invasor espacial', poster((20, 24, 40, 255), INVASOR,
        {'g': (90, 230, 110, 255)}, 3, 11), 1, 2, category='wall', canPlaceOnWalls=True)
guardar('POSTER_GHOST', 'Póster de fantasmita', poster((24, 30, 90, 255), FANTASMA,
        {'r': (235, 50, 50, 255), 'w': (250, 250, 250, 255), 'b': (40, 60, 200, 255)}, 3, 11), 1, 2,
        category='wall', canPlaceOnWalls=True)
guardar('POSTER_TETRIS', 'Póster de bloques', poster((24, 24, 32, 255), TETRIS, TETRIS_COL, 3, 9), 1, 2,
        category='wall', canPlaceOnWalls=True)
guardar('LAVA_LAMP', 'Lámpara de lava', lampara_lava(), 1, 2, category='decor', backgroundTiles=1)
guardar('BOAT_PAINTING', 'Cuadro del velero', velero(), 2, 2, category='wall', canPlaceOnWalls=True)
guardar('MUG_TABLE', 'Mesita con tazas gigantes', mesa_tazas(), 2, 1)

ORIGINALES = {
    'sofa_friends.png': ('SOFA_ORANGE', 'Sillón naranja de cafetería', 3, 2,
                         dict(category='chairs', backgroundTiles=1, orientation='front')),
    'sofa_simpson.png': ('SOFA_SIMPSON', 'Sillón de la sala amarilla', 3, 2,
                         dict(category='chairs', backgroundTiles=1, orientation='front')),
    'arcade.png': ('ARCADE', 'Máquina de arcade', 2, 3, dict(backgroundTiles=1)),
    'tele.png': ('RETRO_TV', 'Tele con consola', 2, 2, dict(backgroundTiles=1)),
}
def al_piso(im):
    """Baja lo dibujado hasta la orilla de abajo (los sillones deben tocar el piso para sentarse bien)."""
    caja = im.getbbox()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im.crop(caja), (caja[0], im.height - (caja[3] - caja[1])))
    return out


for archivo, (id_, nombre, fw, fh, extra) in ORIGINALES.items():
    if (AQUI / 'originales' / archivo).exists():
        guardar(id_, nombre, al_piso(abrir(AQUI, archivo)), fw, fh, **extra)

piezas = [puff(), lampara_lava(), velero(), mesa_tazas()]
piezas += [poster((20, 24, 40, 255), INVASOR, {'g': (90, 230, 110, 255)}, 3, 11),
           poster((24, 30, 90, 255), FANTASMA, {'r': (235, 50, 50, 255), 'w': (250, 250, 250, 255),
                                                'b': (40, 60, 200, 255)}, 3, 11),
           poster((24, 24, 32, 255), TETRIS, TETRIS_COL, 3, 9)]
hoja = Image.new('RGBA', (sum(p.width + 3 for p in piezas), 32), (110, 130, 170, 255))
x = 0
for p in piezas:
    hoja.alpha_composite(p, (x, 32 - p.height))
    x += p.width + 3
hoja.resize((hoja.width * 6, hoja.height * 6), Image.NEAREST).save(AQUI / 'v2_x6.png')
