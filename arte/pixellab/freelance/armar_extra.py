# Freelance ("sótano hacker"), piezas extra (tanda A, 2026-11-03). Originales en originales_extra/ (lista de
# trabajos en originales_extra/trabajos.txt). create_image_pixen, view=side, plantilla de muebles de frente
# (PIXELLAB.md §3), 2 variantes por pieza (sin seed y seed=7).
#
#   pizarron_1   48x32 (v1 de 2): pizarrón en blanco; los diagramas se dibujan por código. La v2 llenaba el lienzo.
#   sillon_1     48x32 (v1 de 2): sillón morado parchado con cobija. La v2 salió morado con naranja.
#   discos_1     32x48 (v1 de 2): estante de alambre con discos duros. La v2 tenía cables rojos ruidosos.
#   lampara_1    24x24 (v1 de 2): lámpara de escritorio con luz magenta (18 px de ancho: va en un lienzo 2x2).
#                La v2 salió como mancha.
#   poster_2     32x32 (v2 de 2): póster synthwave; se rellenan los huecos transparentes del sol y la rejilla del
#                suelo se redibuja limpia. La v1 tenía el sol hueco.
#   mini-servidor: las 2 variantes (miniserver_1/2, 24x24) salieron ilegibles -> 100 % por código.
#
# Uso:  python arte/pixellab/freelance/armar_extra.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y vista_extra_x6.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import al_piso, contorno, guardar, limpiar  # noqa: E402

ORIGINALES = AQUI / 'originales_extra'


def abrir(nombre):
    return limpiar(Image.open(ORIGINALES / nombre).convert('RGBA'))


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def en_lienzo(im, w, h):
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - pieza.height))
    return out


# ── Pizarrón ─────────────────────────────────────────────────────────────────────────────────────────────────────
NEGRO = rgb('#2a2e38')
AZUL = rgb('#2b5fb8')
ROJO = rgb('#d13b3b')
VERDE = rgb('#2f9e55')


def caja(px, x0, y0, x1, y1, c):
    for x in range(x0, x1 + 1):
        px[x, y0] = px[x, y1] = c
    for y in range(y0, y1 + 1):
        px[x0, y] = px[x1, y] = c


def linea(px, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        px[x, y] = c


def pizarron():
    """Pizarrón 3x2 de pared con un diagrama a plumón: cajas unidas con flechas, una base de datos y apuntes."""
    im = abrir('pizarron_1.png')
    px = im.load()
    # caja azul -> caja negra -> base de datos verde; caja negra -> caja roja abajo
    caja(px, 7, 9, 13, 13, AZUL)
    linea(px, 9, 11, 11, AZUL)
    linea(px, 14, 18, 11, NEGRO)
    px[17, 10] = px[17, 12] = NEGRO
    caja(px, 19, 9, 25, 13, NEGRO)
    linea(px, 21, 23, 11, NEGRO)
    linea(px, 26, 30, 11, NEGRO)
    px[29, 10] = px[29, 12] = NEGRO
    # cilindro (base de datos)
    for y in range(9, 15):
        px[31, y] = px[37, y] = VERDE
    linea(px, 32, 36, 8, VERDE)
    linea(px, 32, 36, 10, VERDE)
    linea(px, 32, 36, 15, VERDE)
    for y in range(14, 17):
        px[22, y] = NEGRO
    px[21, 16] = px[23, 16] = NEGRO
    caja(px, 19, 17, 25, 21, ROJO)
    px[21, 19] = px[22, 20] = px[23, 19] = px[24, 18] = ROJO  # palomita
    # apuntes (renglones) abajo a la izquierda y un tache rojo a la derecha
    linea(px, 7, 14, 17, NEGRO)
    linea(px, 7, 12, 19, NEGRO)
    linea(px, 7, 15, 21, NEGRO)
    for i in range(4):
        px[32 + i, 18 + i] = ROJO
        px[35 - i, 18 + i] = ROJO
    linea(px, 38, 40, 20, NEGRO)
    return im


# ── Póster synthwave ─────────────────────────────────────────────────────────────────────────────────────────────
CIELO = rgb('#130543')
SUELO = rgb('#0a0226')
REJA = rgb('#15c653')
HORIZONTE = rgb('#f73e80')


def exterior(im):
    """Píxeles transparentes conectados con la orilla del lienzo (lo demás transparente es un hueco interior)."""
    w, h = im.size
    px = im.load()
    pila = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    fuera = set()
    while pila:
        x, y = pila.pop()
        if (x, y) in fuera or not (0 <= x < w and 0 <= y < h) or px[x, y][3]:
            continue
        fuera.add((x, y))
        pila += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return fuera


def poster():
    im = abrir('poster_2.png')
    px = im.load()
    fuera = exterior(im)
    for y in range(im.height):
        for x in range(im.width):
            if not px[x, y][3] and (x, y) not in fuera:
                px[x, y] = CIELO
    # suelo con rejilla en perspectiva (fuga en el centro del horizonte), sin tocar las esquinas dobladas
    hx, hy, fondo = 16, 16, 27
    for y in range(hy, fondo + 1):
        for x in range(5, 27):
            r, g, b, a = px[x, y]
            if a and not (r > 180 and g > 150):  # deja el papel de las esquinas (crema)
                px[x, y] = SUELO
    for y in (hy + 2, hy + 5, hy + 10):
        for x in range(5, 27):
            if px[x, y] == SUELO:
                px[x, y] = REJA
    for xb in range(-26, 59, 14):
        for y in range(hy + 2, fondo + 1):
            x = round(hx + (xb - hx) * (y - hy) / (fondo - hy))
            if 5 <= x < 27 and px[x, y] == SUELO:
                px[x, y] = REJA
    for x in range(5, 27):
        if px[x, hy][3] and px[x, hy] != rgb('#d9c7b7'):
            px[x, hy] = HORIZONTE
    return im


# ── Mini-servidor casero (100 % código) ──────────────────────────────────────────────────────────────────────────
PLACA = rgb('#2f8f4a')
PLACA_OSCURA = rgb('#1d5e30')
POSTE = rgb('#c9a227')
CHIP = rgb('#1b1d24')
PUERTO = rgb('#a9b0bd')
VENTILADOR = rgb('#3a3f4b')
ASPAS = rgb('#6b7080')
LED_VERDE = rgb('#3ee07a')
LED_MAGENTA = rgb('#ff5fd2')


def mini_servidor():
    """Cúmulo de 4 plaquitas verdes con postes de latón, ventilador arriba y leds verde/magenta (1x1)."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y in range(4, 15):
        px[3, y] = px[12, y] = POSTE
    for i, y in enumerate((4, 7, 10, 13)):
        linea(px, 2, 13, y, PLACA)
        linea(px, 2, 13, y + 1, PLACA_OSCURA)
        if y < 13:
            px[5, y + 2] = px[6, y + 2] = CHIP
            px[9, y + 2] = px[10, y + 2] = PUERTO
            px[4, y + 2] = LED_VERDE if i % 2 == 0 else LED_MAGENTA
            px[11, y + 2] = LED_MAGENTA if i % 2 == 0 else LED_VERDE
    for y in range(1, 4):  # ventilador
        linea(px, 5, 10, y, VENTILADOR)
    px[6, 2] = px[9, 2] = px[7, 1] = px[8, 3] = ASPAS
    px[7, 2] = px[8, 2] = CHIP
    return contorno(im)


PIEZAS = [
    ('FREELANCE_WHITEBOARD', 'Pizarrón de diagramas', pizarron, 3, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('FREELANCE_OLD_COUCH', 'Sillón viejo', lambda: al_piso(abrir('sillon_1.png'), 31), 3, 2,
     dict(category='misc', backgroundTiles=1)),
    ('FREELANCE_HDD_SHELF', 'Estante de discos duros', lambda: al_piso(abrir('discos_1.png'), 47), 2, 3,
     dict(category='storage', backgroundTiles=2)),
    ('FREELANCE_DESK_LAMP', 'Lámpara de escritorio', lambda: en_lienzo(abrir('lampara_1.png'), 32, 32), 2, 2,
     dict(category='electronics', backgroundTiles=1, canPlaceOnSurfaces=True)),
    ('FREELANCE_MINI_SERVER', 'Mini-servidor casero', mini_servidor, 1, 1,
     dict(category='electronics', canPlaceOnSurfaces=True)),
    ('FREELANCE_POSTER_SYNTH', 'Póster synthwave', poster, 2, 2, dict(category='wall', canPlaceOnWalls=True)),
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
    hoja.save(AQUI / 'vista_extra_x6.png')
    print('vista:', AQUI / 'vista_extra_x6.png')


if __name__ == '__main__':
    main()
