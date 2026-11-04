# Sala de música "rock band": piezas ROCKBAND_*.
#
#   ROCKBAND_GUITAR_STAND  Guitarra-control de plástico en su soporte (suelo 1x2). Se arma con la MISMA guitarra de
#                          GUITAR_HERO_WALL (se lee su PNG ya armado, no su armar.py): se quita 1 fila lisa del mástil
#                          para que quepa con el soporte, y el soporte (tripié y ganchos del cuerpo)
#                          se dibuja por código. soporte_1 (diagonal) y soporte_2 (guitarra dentro de un marco): descartes.
#   ROCKBAND_SETLIST       originales/setlist_1.png (create_image_pixen 48x32, view=side): pizarrón de pared con marco
#                          de madera; renglones, palomitas y barra de avance por código.
#   ROCKBAND_PRACTICE_AMP  originales/amp_1.png (20x20): amplificador chico de práctica (1x1); el foco rojo se aviva.
#
# Uso:  python arte/pixellab/rockband/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la hoja de escala
# vista_x4.png. No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import MUEBLES, abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return _abrir(AQUI, nombre)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def dibujar(px, forma, x0, y0, colores):
    for dy, fila in enumerate(forma):
        for dx, ch in enumerate(fila):
            if ch in colores:
                px[x0 + dx, y0 + dy] = colores[ch]


def sin_filas(im, quitar):
    filas = [y for y in range(im.height) if y not in quitar]
    out = Image.new('RGBA', (im.width, len(filas)), (0, 0, 0, 0))
    for ny, y in enumerate(filas):
        out.paste(im.crop((0, y, im.width, y + 1)), (0, ny))
    return out


# ── Guitarra en su soporte ────────────────────────────────────────────────────────────────────────────────────
SOPORTE = rgb('#1b1a20')
SOPORTE_LUZ = rgb('#4a4a55')
QUITAR = {0, 6}  # fila 0 vacía y fila 6 (mástil liso entre clavijero y primer botón) de GUITAR_HERO_WALL
# botones del mástil en el PNG final: (x, y) de la fila de 2 px; colores iguales a GUITAR_HERO_WALL
BOTONES = [('verde', 5), ('rojo', 7), ('amarillo', 9), ('azul', 11), ('naranja', 13)]
PIES = [  # filas 29-31, columnas 2-12: tripié en A
    '...KSSSK...',
    '..KS...SK..',
    '.KS.....SK.',
]


def guitarra_soporte():
    gh = Image.open(MUEBLES / 'GUITAR_HERO_WALL' / 'GUITAR_HERO_WALL.png').convert('RGBA')
    guitarra = sin_filas(gh, QUITAR)                      # 16x30, la guitarra queda en las filas 0-28
    out = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = out.load()
    c = {'K': SOPORTE, 'S': SOPORTE_LUZ}
    dibujar(px, PIES, 2, 29, c)
    # ganchos que sostienen el cuerpo (detrás, se asoman por los lados abajo); la horquilla del mástil no se dibuja: a 1 px
    # se leía como mugre
    for x, y in ((1, 26), (1, 27), (2, 28), (14, 26), (14, 27), (13, 28)):
        px[x, y] = SOPORTE
    out.alpha_composite(guitarra, (0, 0))
    return out


# ── Pizarrón de setlist ───────────────────────────────────────────────────────────────────────────────────────
PIZARRA = rgb('#202020')
GIS = rgb('#c9c9c0')
GIS_TENUE = rgb('#8a8a82')
PALOMITA = rgb('#6ee07a')
ACTUAL = rgb('#ffd54a')
BARRA_FONDO = rgb('#3a3a3a')
BARRA = rgb('#6ee07a')
SETLIST_PIZARRA = (6, 6, 41, 25)       # x0, y0, x1, y1 inclusive (superficie lisa)
SETLIST_FILAS = [7, 11, 15, 19]        # y de arriba de cada renglón (casilla 3x3 en x 8-10, texto en y+1 desde x 13)
SETLIST_CASILLA_X = 8
SETLIST_TEXTO_X = 13
SETLIST_LARGOS = [22, 16, 19, 13]      # largo del "texto" de cada renglón en el ejemplo
SETLIST_BARRA = (8, 23, 39, 24)        # barra de avance (x0, y0, x1, y1)
CASILLA = ['GGG', 'G.G', 'GGG']
PALOMITA_FORMA = ['...P', 'P.P.', '.P..']  # 4x3, empieza en x 8 (pisa la casilla)


def setlist(hechas=2, actual=2):
    im = limpiar(abrir('setlist_1.png'))
    px = im.load()
    x0, y0, x1, y1 = SETLIST_PIZARRA
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not (y == 25 and 36 <= x <= 39):   # el gis que trae el original en la repisa
                px[x, y] = PIZARRA
    for i, (y, largo) in enumerate(zip(SETLIST_FILAS, SETLIST_LARGOS)):
        if i < hechas:
            dibujar(px, PALOMITA_FORMA, SETLIST_CASILLA_X, y, {'P': PALOMITA})
            color = GIS_TENUE
        else:
            col = ACTUAL if i == actual else GIS
            dibujar(px, CASILLA, SETLIST_CASILLA_X, y, {'G': col})
            color = ACTUAL if i == actual else GIS
        for x in range(SETLIST_TEXTO_X, SETLIST_TEXTO_X + largo):
            if x % 5 != 4:                           # cortes = palabras
                px[x, y + 1] = color
    bx0, by0, bx1, by1 = SETLIST_BARRA
    lleno = bx0 + (bx1 - bx0 + 1) * hechas // len(SETLIST_FILAS)
    for y in range(by0, by1 + 1):
        for x in range(bx0, bx1 + 1):
            px[x, y] = BARRA if x < lleno else BARRA_FONDO
    return im


# ── Amplificador de práctica ──────────────────────────────────────────────────────────────────────────────────
FOCO = rgb('#ff4a3a')
FOCO_ORIGINAL = (13, 7)  # en amp_1 (20x20)


def amplificador():
    im = limpiar(abrir('amp_1.png'))
    im.putpixel(FOCO_ORIGINAL, FOCO)
    return al_piso(im.crop((2, 2, 18, 18)), 15)


def foco_amp(im):
    return next((x, y) for y in range(16) for x in range(16) if im.getpixel((x, y)) == FOCO)


# ── Lista ─────────────────────────────────────────────────────────────────────────────────────────────────────
def piezas():
    return [
        ('ROCKBAND_GUITAR_STAND', 'Guitarra-control en soporte', guitarra_soporte(), 1, 2,
         dict(category='decor', backgroundTiles=1)),
        ('ROCKBAND_SETLIST', 'Pizarrón de setlist', setlist(), 3, 2, dict(category='wall', canPlaceOnWalls=True)),
        ('ROCKBAND_PRACTICE_AMP', 'Amplificador de práctica', amplificador(), 1, 1, dict(category='electronics')),
    ]


def hoja(hechas, destino, k=4):
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    fila = [agente.crop((0, 0, 24, 44))] + hechas
    alto = max(i.height for i in fila) * k + 16
    ancho = sum(i.width * k + 8 for i in fila) + 8
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in fila:
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    destino.parent.mkdir(parents=True, exist_ok=True)
    out.save(destino)
    print('hoja:', destino)


def main():
    hechas = []
    for id_, nombre, im, fw, fh, extra in piezas():
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    print('foco del amplificador en', foco_amp(hechas[2]))
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
