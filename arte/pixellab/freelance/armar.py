# Cuarto de freelance ("cuartel hacker"): arma los muebles desde los originales de PixelLab + retoques por código.
#
#   originales/escritorio_1.png  create_image_pixen 48x32, view=side (v1 de 3) -> pantallas con texto verde por código
#   originales/silla_1.png       create_image_pixen 32x32, view=side, de espaldas (v1 de 3) -> recorte a 16x32
#   originales/rack_1.png        create_image_pixen 32x48, view=side (v1 de 2)
#   originales/mapa_2.png        create_image_pixen 64x32 (v2 de 3): solo se toma la forma de los continentes;
#                                la pantalla, la rejilla y los clientes marcados se dibujan por código
#   originales/tablero_1.png     create_image_pixen 48x32, view=side (v1 de 3): tablero de misiones de corcho
#   originales/cables_1.png      create_image_pixen 32x32, view=side
#   originales/refri_1.png       create_image_pixen 32x32, view=side: refri de bebidas energéticas
#   neón "</>" y ">_": 100 % por código
#   2.ª tanda (para no reusar muebles de la oficina):
#   originales/lampara_2.png  32x32 (v2 de 2): lámpara de tubo LED verde -> recorte a 16x32
#   originales/planta_2.png   32x32 (v2 de 2): cactus en maceta de monitor viejo (se quita el halo azul)
#   originales/planta_1.png   32x32 (v1 de 2): sansevieria en maceta negra con franja verde
#   originales/bote_1.png, puff_1.png, pizzas_1.png  16x16 (1 de 1 cada uno)
#   originales/repisa_1.png   32x32: repisa de pared con consolas y cartuchos (se quita la sombra gris de abajo)
#   originales/poster_1.png   32x32: póster de candado verde
#   3.ª tanda ("sótano hacker", para que no se parezca al cuarto de agenda):
#   originales/cajas_2.png    32x32 (v2 de 2): cajas de cartón con cables
#   originales/foco_1.png     32x32: foco colgante magenta (va en la pared, cuelga del techo)
#   (archivero_1.png de metal salió en ángulo: descartado)
#   neón magenta "404" y cables por el suelo: 100 % por código
#
# Uso:  python arte/pixellab/freelance/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import random
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, angosto, guardar, limpiar, sin_halo  # noqa: E402


def abrir(nombre):
    return _abrir(AQUI, nombre)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# Verde de terminal (mismo tono en pantallas, mapa y neón)
PANTALLA = rgb('#06140c')
TEXTO = rgb('#3ee07a')
TEXTO_TENUE = rgb('#1f8a48')
CURSOR = rgb('#b6ffcc')
REJILLA = rgb('#0e2a1a')
TIERRA = rgb('#1f8a48')
TIERRA_CLARA = rgb('#3ee07a')
MARCO = rgb('#2a2e38')
MARCO_CLARO = rgb('#4a5060')
CONTORNO = rgb('#14161c')
CLIENTE = rgb('#fbbf24')
CLIENTE_NUEVO = rgb('#ef4444')
NEON = rgb('#7dffa6')
NEON_CENTRO = rgb('#e6fff0')
NEON_BRILLO = rgb('#3ee07a', 110)


def pantalla_texto(im, x0, y0, x1, y1, semilla):
    """Pinta una pantalla de terminal: fondo casi negro, renglones de 'código' verde y un cursor."""
    rnd = random.Random(semilla)
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = PANTALLA
    y = y0 + 1
    while y <= y1 - 1:
        sangria = rnd.choice((0, 0, 1, 2))
        largo = rnd.randint(2, x1 - x0 - 1 - sangria)
        for x in range(x0 + 1 + sangria, min(x1, x0 + 1 + sangria + largo)):
            px[x, y] = TEXTO if rnd.random() > 0.25 else TEXTO_TENUE
        y += 2
    px[x0 + 1, y1 - 1 if (y1 - y0) % 2 == 0 else y1] = CURSOR
    return im


# ── Piezas ───────────────────────────────────────────────────────────────────────────────────────────────────────

def escritorio():
    im = limpiar(abrir('escritorio_1.png'))
    for i, (x0, y0, x1, y1) in enumerate(((5, 5, 13, 11), (19, 4, 28, 11), (34, 5, 42, 11))):
        pantalla_texto(im, x0, y0, x1, y1, 10 + i)
    return im


def silla():
    im = limpiar(abrir('silla_1.png'))
    x0, _, x1, _ = im.getbbox()
    izq = (x0 + x1 - 16) // 2
    im = im.crop((izq, 0, izq + 16, 32))
    return al_piso(im, 30)


def rack():
    return al_piso(limpiar(abrir('rack_1.png')), 47)


def mapa():
    """Pantalla de pared 4x2 con el mapa del mundo verde; los clientes son puntos ámbar (uno rojo = nuevo)."""
    im = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    px = im.load()
    x0, y0, x1, y1 = 2, 3, 61, 30  # marco
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            borde = x in (x0, x1) or y in (y0, y1)
            marco = x in (x0 + 1, x1 - 1) or y in (y0 + 1, y1 - 1)
            px[x, y] = CONTORNO if borde else (MARCO_CLARO if marco and y == y0 + 1 else MARCO if marco else PANTALLA)
    for y in range(y0 + 2, y1 - 1):
        for x in range(x0 + 2, x1 - 1):
            if (x - x0) % 8 == 0 or (y - y0) % 7 == 0:
                px[x, y] = REJILLA
    tierra = abrir('mapa_2.png')
    tb = tierra.getbbox()
    tierra = tierra.crop(tb)
    ox = (x0 + x1 + 1 - tierra.width) // 2
    oy = (y0 + y1 + 1 - tierra.height) // 2
    tp = tierra.load()
    for y in range(tierra.height):
        for x in range(tierra.width):
            r, g, b, a = tp[x, y]
            if a and g > 40:
                px[ox + x, oy + y] = TIERRA_CLARA if g > 170 else TIERRA
    # clientes (posiciones fijas sobre el mapa: América, Europa, Asia, Oceanía) y uno nuevo en rojo
    for cx, cy, c in ((17, 11, CLIENTE), (23, 21, CLIENTE), (33, 10, CLIENTE), (45, 12, CLIENTE), (50, 22, CLIENTE),
                      (14, 15, CLIENTE_NUEVO)):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            px[cx + dx, cy + dy] = c
    return im


def cactus():
    im = limpiar(abrir('planta_2.png'))
    return al_piso(sin_halo(im, lambda c: c[2] > c[0] + 40 and c[2] > c[1] + 10), 31)


def chico(nombre):
    return al_piso(limpiar(abrir(nombre)), 15)


def repisa():
    im = limpiar(abrir('repisa_1.png'))
    px = im.load()
    for y in range(21, 32):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and abs(r - g) < 12 and abs(g - b) < 16 and r > 80:  # sombra gris pintada bajo la repisa
                px[x, y] = (0, 0, 0, 0)
    return im


def tablero():
    return limpiar(abrir('tablero_1.png'))


def cables():
    return al_piso(limpiar(abrir('cables_1.png')), 31)


def refri():
    return al_piso(limpiar(abrir('refri_1.png')), 31)


GLIFOS = {
    '<': ['..#', '.#.', '#..', '.#.', '..#'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    '>': ['#..', '.#.', '..#', '.#.', '#..'],
    '_': ['...', '...', '...', '...', '###'],
}


MAGENTA = (rgb('#ff5fd2'), rgb('#ffe3f6'), rgb('#e0309f', 110))
GLIFOS.update({
    '4': ['#.#', '#.#', '###', '..#', '..#'],
    '0': ['###', '#.#', '#.#', '#.#', '###'],
})


def cables_suelo():
    """Tira de cables 3x1 que cruza el suelo (se camina encima: backgroundTiles 1)."""
    im = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    px = im.load()
    oscuro, claro = rgb('#16181e'), rgb('#3a3f4b')
    for y0, fase, color in ((9, 0, oscuro), (11, 2, oscuro), (10, 5, rgb('#1f8a48'))):
        for x in range(1, 47):
            y = y0 + (1 if (x + fase) % 12 < 6 else 0)
            px[x, y] = color
            if color == oscuro and x % 9 == 0:
                px[x, y - 1] = claro
    for x, c in ((3, rgb('#ef4444')), (44, rgb('#22d3ee'))):  # clavijas
        for dy in (-1, 0, 1):
            px[x, 10 + dy] = c
    return im


def neon(texto, colores=None):
    """Letrero de neón 2x1 de pared: tubo de 1 px, brillo arriba y resplandor solo abajo (PIXELLAB.md §14)."""
    tubo_color, centro, brillo = colores or (NEON, NEON_CENTRO, NEON_BRILLO)
    im = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    px = im.load()
    ancho = len(texto) * 4 - 1
    x = (32 - ancho) // 2
    y0 = 5
    tubo = []
    for ch in texto:
        for fy, fila in enumerate(GLIFOS[ch]):
            for fx, c in enumerate(fila):
                if c == '#':
                    tubo.append((x + fx, y0 + fy))
        x += 4
    for tx, ty in tubo:
        if (tx, ty + 1) not in tubo and not px[tx, ty + 1][3]:
            px[tx, ty + 1] = brillo
    for tx, ty in tubo:
        px[tx, ty] = tubo_color
    for tx, ty in tubo:
        if (tx, ty - 1) not in tubo:
            px[tx, ty] = centro
    return im


PIEZAS = [
    # id, nombre, función, ancho, alto (cuadros), campos del manifest
    ('FREELANCE_DESK', 'Escritorio hacker', escritorio, 3, 2, dict(category='desks', backgroundTiles=1, isDesk=True)),
    ('FREELANCE_CHAIR', 'Silla gamer', silla, 1, 2, dict(category='chairs', backgroundTiles=1, orientation='back')),
    ('FREELANCE_RACK', 'Rack de servidores', rack, 2, 3, dict(category='electronics', backgroundTiles=1)),
    ('FREELANCE_WORLD_MAP', 'Mapa de clientes', mapa, 4, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_MISSIONS', 'Tablero de misiones', tablero, 3, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_CABLES', 'Montón de cables', cables, 2, 2, dict(category='misc', backgroundTiles=1)),
    ('FREELANCE_FRIDGE', 'Refri de bebidas', refri, 2, 2, dict(category='misc', backgroundTiles=1)),
    ('FREELANCE_NEON', 'Neón </>', lambda: neon('</>'), 2, 1, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_NEON_PROMPT', 'Neón >_', lambda: neon('>_'), 2, 1, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_LAMP', 'Lámpara LED verde', lambda: angosto(limpiar(abrir('lampara_2.png'))), 1, 2,
     dict(category='decor', backgroundTiles=1)),
    ('FREELANCE_CACTUS', 'Cactus en monitor', cactus, 2, 2, dict(category='decor', backgroundTiles=1)),
    ('FREELANCE_PLANT', 'Sansevieria', lambda: al_piso(limpiar(abrir('planta_1.png')), 31), 2, 2,
     dict(category='decor', backgroundTiles=1)),
    ('FREELANCE_BIN', 'Bote de papeles', lambda: chico('bote_1.png'), 1, 1, dict(category='misc')),
    ('FREELANCE_BEANBAG', 'Puff gamer', lambda: chico('puff_1.png'), 1, 1, dict(category='misc')),
    ('FREELANCE_PIZZA', 'Cajas de pizza', lambda: chico('pizzas_1.png'), 1, 1, dict(category='misc')),
    ('FREELANCE_SHELF', 'Repisa de consolas', repisa, 2, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_POSTER', 'Póster del candado', lambda: limpiar(abrir('poster_1.png')), 2, 2,
     dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_BOXES', 'Cajas de cartón', lambda: al_piso(limpiar(abrir('cajas_2.png')), 31), 2, 2,
     dict(category='misc', backgroundTiles=1)),
    ('FREELANCE_BULB', 'Foco colgante magenta', lambda: limpiar(abrir('foco_1.png')), 2, 2,
     dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_NEON_404', 'Neón 404', lambda: neon('404', MAGENTA), 2, 1, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_FLOOR_CABLES', 'Cables por el suelo', cables_suelo, 3, 1, dict(category='misc', backgroundTiles=1)),
]


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    k = 6
    ancho = sum(i.width * k + 12 for i in hechas) + 12
    alto = max(i.height for i in hechas) * k + 24
    hoja = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 12
    for i in hechas:
        hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 12 - i.height * k))
        x += i.width * k + 12
    hoja.save(AQUI / 'vista_x6.png')
    print('vista:', AQUI / 'vista_x6.png')


if __name__ == '__main__':
    main()
