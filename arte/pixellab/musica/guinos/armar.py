# Sala de música (tienda de discos retro): tres guiños geek.
#
#   MARTY_AMP         Amplificador de Marty (2x2). Por código: las 4 variantes de PixelLab (amp_1..4, 32x32,
#                     view=side) salieron como caja cuadrada de orilla a orilla aunque el prompt pedía "1.5 veces más
#                     alto que ancho" y margen. Se dibuja el gabinete (20x28) por código y se reutiliza la tela de
#                     la rejilla de amp_1. Perilla grande con la aguja al máximo, marca roja y un rayo amarillo.
#   PORTAL_RADIO      Radio de Aperture (1x1, encima de un mostrador). 100 % por código, siguiendo la imagen real
#                     de la wiki (combineoverwiki.net, "85.2_FM.jpg"): domo BLANCO, cara frontal oscura en arco con
#                     pantalla turquesa y dos bocinas, base negra, perilla arriba a la derecha y antena larga y
#                     delgada. Foco rojo (así empiezan en el juego). A 16 px un domo de 10 px se controla mejor a mano.
#   GUITAR_HERO_WALL  Guitarra de Guitar Hero (pared 1x2). gh_1 (create_image_pixen 32x32, view=side, v1 de 3)
#                     recortada a 16x32; los 5 botones del mástil se repintan por código (el rojo salió vino).
#
# Uso:  python arte/pixellab/musica/guinos/armar.py
# Escribe en webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png.
# No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[3]
sys.path.insert(0, str(AQUI.parents[1]))
from muebles import abrir as _abrir, guardar, recortar_ancho  # noqa: E402

ASSETS = RAIZ / 'webview-ui' / 'public' / 'assets'
MOSTRADOR = ASSETS / 'furniture' / 'RECORD_COUNTER' / 'RECORD_COUNTER.png'
PERSONAJE = ASSETS / 'characters' / 'char_0.png'

CONTORNO = (44, 26, 34)  # café oscuro: el contorno de toda la sala


def abrir(nombre):
    return _abrir(AQUI, nombre)


# ── Ayudantes (copiados de musica/escenario/armar.py; no se importa ese archivo) ──
def sin_sueltos(im, minimo=4):
    """Borra grupos de píxeles (vecindad 8) de menos de `minimo` píxeles."""
    w, h = im.size
    px = im.load()
    visto = set()
    for y in range(h):
        for x in range(w):
            if not px[x, y][3] or (x, y) in visto:
                continue
            grupo, pila = [], [(x, y)]
            visto.add((x, y))
            while pila:
                cx, cy = pila.pop()
                grupo.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visto and px[nx, ny][3]:
                            visto.add((nx, ny))
                            pila.append((nx, ny))
            if len(grupo) < minimo:
                for gx, gy in grupo:
                    px[gx, gy] = (0, 0, 0, 0)
    return im


def unir_parecidos(im, umbral=6):
    """Junta colores casi iguales en el más usado."""
    px = im.load()
    cuenta = {}
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                cuenta[px[x, y]] = cuenta.get(px[x, y], 0) + 1
    base, mapa = [], {}
    for c, _ in sorted(cuenta.items(), key=lambda kv: -kv[1]):
        destino = next((b for b in base if max(abs(b[i] - c[i]) for i in range(3)) <= umbral), None)
        if destino is None:
            base.append(c)
            destino = c
        mapa[c] = destino
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                px[x, y] = mapa[px[x, y]]
    return im


def contorno_cafe(im, umbral=14):
    """Pasa el contorno casi negro de PixelLab al café oscuro de la sala."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) <= umbral:
                px[x, y] = CONTORNO + (255,)
    return im


def pintar(im, filas, colores, x0, y0):
    px = im.load()
    for dy, fila in enumerate(filas):
        for dx, ch in enumerate(fila):
            if ch != '.':
                px[x0 + dx, y0 + dy] = colores[ch] + (255,)


# ── Amplificador de Marty (por código) ───────────────────────────
AMP_W, AMP_H = 20, 28           # gabinete: más alto que ancho, no rebasa 28 px
AMP_X = (32 - AMP_W) // 2 - 1   # un poco a la izquierda: a la derecha va el rayo
AMP_NEGRO = (30, 28, 34)
AMP_NEGRO_LUZ = (52, 50, 58)
AMP_NEGRO_SOMBRA = (22, 20, 26)
PLATA = (176, 176, 186)
PLATA_LUZ = (226, 226, 234)
PANEL = (150, 150, 160)
PANEL_LUZ = (196, 196, 204)
PANEL_SOMBRA = (104, 104, 116)
PERILLA = (24, 22, 28)
PERILLA_LUZ = (78, 78, 88)
AGUJA = (250, 248, 236)
MAXIMO = (226, 44, 44)
MARCA = (70, 70, 80)
REJILLA_MARCO = (118, 118, 130)
RAYO = (255, 214, 64)
RAYO_LUZ = (255, 250, 200)

# perilla grande 5x5 con la aguja apuntando abajo a la derecha (todo a la derecha = máximo)
DIAL = [
    '.KKK.',
    'KkKKK',
    'KKNKK',
    'KKKNK',
    '.KKK.',
]
RAYO_FIG = [
    '..YY',
    '.YY.',
    'YWWY',
    '.YY.',
    'YY..',
    'Y...',
]


def amplificador():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0 = AMP_X, 32 - AMP_H
    x1, y1 = x0 + AMP_W - 1, 31
    d.rectangle((x0, y0, x1, y1), fill=CONTORNO + (255,))
    d.rectangle((x0 + 1, y0 + 1, x1 - 1, y1 - 1), fill=AMP_NEGRO + (255,))
    d.line((x0 + 1, y0 + 1, x1 - 1, y0 + 1), fill=AMP_NEGRO_LUZ + (255,))
    d.line((x0 + 1, y0 + 1, x0 + 1, y1 - 1), fill=AMP_NEGRO_LUZ + (255,))
    d.line((x1 - 1, y0 + 2, x1 - 1, y1 - 1), fill=AMP_NEGRO_SOMBRA + (255,))
    d.line((x0 + 2, y1 - 1, x1 - 1, y1 - 1), fill=AMP_NEGRO_SOMBRA + (255,))
    # panel de controles
    px0, py0, px1, py1 = x0 + 2, y0 + 2, x1 - 2, y0 + 8
    d.rectangle((px0, py0, px1, py1), fill=PANEL + (255,))
    d.line((px0, py0, px1, py0), fill=PANEL_LUZ + (255,))
    d.line((px0, py1, px1, py1), fill=PANEL_SOMBRA + (255,))
    for i in range(2):  # perillas chicas (2: la tercera se pegaba a la grande)
        kx = px0 + 1 + i * 3
        pintar(im, ['kK', 'KK'], {'K': PERILLA, 'k': PERILLA_LUZ}, kx, py0 + 3)
    # marcas de la escala alrededor de la perilla grande y la roja en el máximo
    dx, dy = px1 - 6, py0 + 1
    pintar(im, DIAL, {'K': PERILLA, 'k': PERILLA_LUZ, 'N': AGUJA}, dx, dy)
    im.putpixel((dx - 1, dy + 4), MARCA + (255,))
    im.putpixel((dx + 2, py0), MARCA + (255,))
    im.putpixel((dx + 5, dy + 4), MAXIMO + (255,))
    im.putpixel((dx + 5, dy + 3), MAXIMO + (255,))
    # rejilla: marco plata y tela tomada de la variante 1 de PixelLab
    gx0, gy0, gx1, gy1 = x0 + 2, y0 + 10, x1 - 2, y1 - 4
    d.rectangle((gx0, gy0, gx1, gy1), fill=REJILLA_MARCO + (255,))
    tela = unir_parecidos(abrir('amp_1.png').crop((4, 9, 4 + gx1 - gx0 - 1, 9 + gy1 - gy0 - 1)))
    im.alpha_composite(tela, (gx0 + 1, gy0 + 1))
    # esquineros de metal
    for cx, cy, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        for ex, ey in ((1, 1), (2, 1), (1, 2)):
            im.putpixel((cx + sx * ex, cy + sy * ey), PLATA + (255,))
        im.putpixel((cx + sx, cy + sy), PLATA_LUZ + (255,))
    # rayo que sale de la perilla
    pintar(im, RAYO_FIG, {'Y': RAYO, 'W': RAYO_LUZ}, x1 + 1, y0 - 3)
    return im


# ── Radio de Aperture (por código) ───────────────────────────────
RADIO = [
    '.....a..........',
    '.....A..........',
    '.....A..........',
    '.....A..........',
    '.....A..........',
    '.....A..........',
    '.....A..........',
    '.....A...KK.....',
    '.....OOOOkkO....',
    '....OWWWWWWsO...',
    '...OWWWWWWWWsO..',
    '...OWWODDDOWsO..',
    '...OWODCCCDOsO..',
    '...OWDGDDDGDsO..',
    '...OsDGDRDGDsO..',
    '..OKKKKKKKKKKKO.',
]
RADIO_COLORES = {
    'O': CONTORNO, 'W': (238, 238, 234), 's': (190, 192, 198), 'D': (40, 44, 52), 'G': (78, 82, 92),
    'C': (96, 206, 226), 'R': (232, 52, 48), 'K': (32, 32, 38), 'k': (70, 70, 80), 'A': (104, 104, 114),
    'a': (150, 150, 160),
}


def radio():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    pintar(im, RADIO, RADIO_COLORES, 0, 0)
    return im


# ── Guitarra de Guitar Hero ──────────────────────────────────────
BOTONES = [(15, 220, 12), (234, 34, 44), (242, 196, 30), (30, 150, 250), (244, 116, 30)]
TRASTE = (61, 52, 48)
MASTIL_X = (15, 16)        # columnas de adentro del mástil en el original de 32x32 (14 y 17 = contorno)
BOTON_Y0 = 7               # primer botón (verde); uno cada 2 filas, con traste en medio
MASTIL_HASTA = 18          # filas del mástil que se repintan (hasta donde empieza el cuerpo)


def guitarra():
    im = sin_sueltos(abrir('gh_1.png'), 2)
    px = im.load()
    for y in range(BOTON_Y0, MASTIL_HASTA + 1):
        k = y - BOTON_Y0
        color = BOTONES[k // 2] if k % 2 == 0 and k // 2 < len(BOTONES) else TRASTE
        for x in MASTIL_X:
            px[x, y] = color + (255,)
    # clavijas: brillo azul claro -> plata; punto amarillo suelto del cuerpo -> rojo del cuerpo
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) == (168, 222, 235):
                px[x, y] = (182, 184, 185, 255)
            elif a and (r, g, b) == (249, 193, 28):
                px[x, y] = (237, 4, 35, 255)
    return recortar_ancho(contorno_cafe(unir_parecidos(im)), 16)


def piezas():
    return [
        ('MARTY_AMP', 'Amplificador de Marty', amplificador(), 2, 2, dict(backgroundTiles=1)),
        ('PORTAL_RADIO', 'Radio de Aperture', radio(), 1, 1, dict(category='decor', canPlaceOnSurfaces=True)),
        ('GUITAR_HERO_WALL', 'Guitarra de Guitar Hero', guitarra(), 1, 2,
         dict(category='wall', canPlaceOnWalls=True)),
    ]


# ── Vista previa x6: pared arriba, piso de madera oscura ─────────
PISO_A = (58, 38, 28)
PISO_B = (50, 32, 24)
PISO_JUNTA = (36, 22, 17)
PARED = (54, 36, 48)
PARED_ZOCLO = (38, 24, 34)


def vista(lista, escala=6):
    cols, filas = 14, 5
    lienzo = Image.new('RGBA', (cols * 16, filas * 16), (0, 0, 0, 255))
    d = ImageDraw.Draw(lienzo)
    d.rectangle((0, 0, cols * 16 - 1, 31), fill=PARED)
    d.rectangle((0, 30, cols * 16 - 1, 31), fill=PARED_ZOCLO)
    for fy in range(2, filas):
        for fx in range(cols):
            x, y = fx * 16, fy * 16
            d.rectangle((x, y, x + 15, y + 15), fill=PISO_A if (fx + fy) % 2 else PISO_B)
            d.line((x, y + 7, x + 15, y + 7), fill=PISO_JUNTA)
            d.line((x, y + 15, x + 15, y + 15), fill=PISO_JUNTA)
            d.line((x + (0 if fy % 2 else 8), y, x + (0 if fy % 2 else 8), y + 7), fill=PISO_JUNTA)
    por_id = {p[0]: p[2] for p in lista}
    # pared: guitarra (filas 0-1)
    lienzo.alpha_composite(por_id['GUITAR_HERO_WALL'], (16, 0))
    # piso: personaje de referencia, amplificador, mostrador con la radio encima (fila de atrás)
    base = 64
    pj = Image.open(PERSONAJE).convert('RGBA').crop((0, 0, 24, 44))
    lienzo.alpha_composite(pj, (40, base + 16 - 44 - 2))
    lienzo.alpha_composite(por_id['MARTY_AMP'], (64, base + 16 - 32))
    lienzo.alpha_composite(pj, (104, base + 16 - 44 - 2))
    mostrador = Image.open(MOSTRADOR).convert('RGBA')
    mx, my = 128, base + 16 - 32
    lienzo.alpha_composite(mostrador, (mx, my))
    lienzo.alpha_composite(por_id['PORTAL_RADIO'], (mx + 16, my))
    # la radio suelta, para verla sin mostrador
    lienzo.alpha_composite(por_id['PORTAL_RADIO'], (192, base))
    lienzo.resize((lienzo.width * escala, lienzo.height * escala), Image.NEAREST).save(AQUI / 'vista_x6.png')
    print('vista', AQUI / 'vista_x6.png')


if __name__ == '__main__':
    lista = piezas()
    for id_, nombre, im, fw, fh, extra in lista:
        guardar(id_, nombre, im, fw, fh, **extra)
    vista(lista)
