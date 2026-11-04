# Rincón de ideas (núcleo de la oficina, genérico): buzón de ideas, pizarrón de notas adhesivas, foco grande de "idea",
# frasco de ideas y escritorio de lluvia de ideas. Originales de PixelLab en originales/ (lista en trabajos.txt);
# create_image_pixen, view=side, plantilla de muebles de frente.
#
#   buzon_1.png   32x32 (v1 de 2): 20 px de ancho -> se quitan 5 columnas casi repetidas (16 de ancho, 1x2) y la ranura
#                 se repinta por código (la original, con labio claro, parecía boca). buzon_2 sin contorno: descartado.
#   foco_1.png    32x32 (v1 de 2): 18 px de ancho -> se quitan 2 columnas (1x2). _OFF = vidrio gris azulado por código.
#                 foco_2 sin contorno y con base ancha: descartado.
#   corcho_1.png  48x32: cork con ruido/tramado -> el pizarrón se dibuja POR CÓDIGO con su paleta (marco y corcho).
#   mesa_2.png    48x32 (v2 de 2): mesa con papeles, notas rosas y plumones. mesa_1 (papel que parece pez): descartada.
#   Frasco de ideas: POR CÓDIGO (los frascos de PixelLab salen de 17-18 px, §16).
#
# Uso:  python arte/pixellab/ideas/armar.py
# Escribe webview-ui/public/assets/furniture/IDEAS_*/ (PNG + manifest.json) y vista_x4.png. No gasta.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402

T = (0, 0, 0, 0)


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def lum(c):
    return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000


def en_lienzo(im, w, h, abajo=0):
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), T)
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - abajo - pieza.height))
    return out


def sin_columnas_parecidas(im, n):
    """Quita las `n` columnas más parecidas a su vecina (de adentro del dibujo): angosta sin reducir."""
    for _ in range(n):
        x0, _, x1, _ = im.getbbox()
        px = im.load()
        dif = lambda x: sum(px[x, y] != px[x - 1, y] for y in range(im.height))  # noqa: E731
        x = min(range(x0 + 2, x1 - 2), key=dif)
        out = Image.new('RGBA', (im.width - 1, im.height), T)
        out.paste(im.crop((0, 0, x, im.height)), (0, 0))
        out.paste(im.crop((x + 1, 0, im.width, im.height)), (x, 0))
        im = out
    return im


# ── Buzón de ideas ──────────────────────────────────────────────────────────────────────────────────────────────
MADERA, MADERA_CLARA = (186, 113, 47, 255), (217, 153, 75, 255)
RANURA = (48, 16, 14, 255)


def buzon():
    im = sin_columnas_parecidas(abrir('buzon_1.png'), 5)
    im = im.crop(im.getbbox())  # 15x28; filas 8-11 = la ranura vieja (ver trabajos.txt)
    px = im.load()
    for y in (8, 9, 10, 11):
        for x in range(4, 10):
            px[x, y] = MADERA
    for x in range(4, 11):       # ranura nueva: una raya oscura de 1 px con canto claro abajo
        px[x, 9] = RANURA
        px[x, 10] = MADERA_CLARA
    return en_lienzo(im, 16, 32)


# ── Foco grande de idea ─────────────────────────────────────────────────────────────────────────────────────────
VIDRIO_OFF = [(70, 78, 98, 255), (118, 130, 152, 255), (160, 172, 192, 255), (198, 208, 222, 255), (232, 238, 246, 255)]
FILAMENTO_OFF = (78, 80, 92, 255)
FOCO_LUZ = (251, 239, 160)  # tono principal del foco prendido (#fbefa0)


def foco(prendido=True):
    im = sin_columnas_parecidas(abrir('foco_1.png'), 2)
    im = en_lienzo(im, 16, 32)
    if prendido:
        return im
    px = im.load()
    _, y0, _, _ = im.getbbox()
    vidrio = []
    for y in range(y0, y0 + 19):  # bulbo (arriba del cuello metálico)
        for x in range(16):
            r, g, b, a = px[x, y]
            if not a or (r < 10 and g < 10 and b < 10):
                continue
            if r > b + 40 and r < 200 and g < 120:  # filamento naranja oscuro
                px[x, y] = FILAMENTO_OFF
            elif r > b + 30:  # vidrio amarillo
                vidrio.append((x, y))
    lums = [lum(px[x, y]) for x, y in vidrio]
    lo, hi = min(lums), max(lums)
    for x, y in vidrio:
        t = (lum(px[x, y]) - lo) / (hi - lo or 1)
        px[x, y] = VIDRIO_OFF[min(4, round(t * 4))]
    return im


# ── Pizarrón de notas adhesivas (por código, 3x2 de pared) ───────────────────────────────────────────────────────
# Paleta tomada de corcho_1.png (marco claro, sombra rojiza) con el corcho en dos tonos lisos.
MARCO_OSC, MARCO, MARCO_CLARO = (110, 52, 50, 255), (192, 129, 53, 255), (240, 190, 130, 255)
CORCHO, CORCHO_OSC, CORCHO_PUNTO = (206, 146, 78, 255), (178, 116, 56, 255), (222, 168, 100, 255)
ZONA_NOTAS = (6, 6, 41, 25)  # x0, y0, x1, y1 (inclusive) del corcho libre
NOTAS = [  # (x, y, color, sombra) cuadritos de 6x6 con alfiler
    (8, 8, (255, 226, 102, 255), (214, 178, 60, 255)),
    (16, 7, (255, 156, 196, 255), (214, 112, 150, 255)),
    (25, 9, (130, 220, 250, 255), (82, 170, 210, 255)),
    (33, 7, (164, 232, 130, 255), (110, 186, 84, 255)),
    (11, 17, (255, 186, 100, 255), (214, 140, 60, 255)),
    (21, 18, (255, 226, 102, 255), (214, 178, 60, 255)),
    (31, 17, (255, 156, 196, 255), (214, 112, 150, 255)),
]
TINTA = (90, 80, 96, 255)
ALFILER = (220, 50, 60, 255)


def pizarron(con_notas=True):
    im = Image.new('RGBA', (48, 32), T)
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, 45, 29], fill=MARCO_OSC)
    d.rectangle([3, 3, 44, 28], fill=MARCO)
    d.line([3, 3, 44, 3], fill=MARCO_CLARO)
    d.line([3, 3, 3, 28], fill=MARCO_CLARO)
    d.rectangle([5, 5, 42, 26], fill=CORCHO_OSC)
    d.rectangle([6, 6, 41, 25], fill=CORCHO)
    px = im.load()
    for i, (x, y) in enumerate((x, y) for y in range(7, 25, 3) for x in range(7, 41, 4)):  # poros del corcho
        px[x + (y // 3) % 2 * 2, y] = CORCHO_PUNTO if i % 2 else CORCHO_OSC
    if con_notas:
        for x, y, c, s in NOTAS:
            d.rectangle([x, y, x + 5, y + 5], fill=c)
            d.line([x + 1, y + 6, x + 6, y + 6], fill=CORCHO_OSC)   # sombrita
            d.line([x + 6, y + 1, x + 6, y + 5], fill=CORCHO_OSC)
            d.line([x, y + 5, x + 5, y + 5], fill=s)
            d.line([x + 1, y + 2, x + 4, y + 2], fill=TINTA)        # renglones garabateados
            d.line([x + 1, y + 4, x + 3, y + 4], fill=TINTA)
            px[x + 2, y] = ALFILER
    return im


# ── Frasco de ideas (por código, 1x1 de mesa) ───────────────────────────────────────────────────────────────────
CONTORNO_F = (28, 30, 58, 255)
VIDRIO, VIDRIO_OSC = (150, 190, 210, 150), (110, 150, 175, 170)
BRILLO = (235, 248, 255, 230)
TAPA, TAPA_OSC = (120, 128, 140, 255), (82, 88, 100, 255)
CHISPA, CHISPA_CENTRO = (255, 214, 90, 255), (255, 250, 210, 255)
PAPEL = [(255, 240, 190, 255), (255, 226, 102, 255), (250, 250, 240, 255)]


def frasco():
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    for y in range(4, 15):
        for x in range(3, 13):
            borde = x in (3, 12) or y == 14
            px[x, y] = CONTORNO_F if borde else (VIDRIO_OSC if x in (4, 11) else VIDRIO)
    px[3, 4] = px[12, 4] = T
    for x in range(4, 12):
        px[x, 4] = CONTORNO_F
    for y in (1, 2, 3):  # tapa de rosca
        for x in range(4, 12):
            borde = x in (4, 11) or y == 1
            px[x, y] = CONTORNO_F if borde else (TAPA if y == 2 else TAPA_OSC)
    px[4, 1] = px[11, 1] = T
    papeles = [(4, 13), (6, 13), (8, 13), (10, 13), (5, 12), (7, 12), (9, 12), (4, 11), (8, 11), (10, 11)]
    for i, (x, y) in enumerate(papeles):  # papelitos doblados abajo
        px[x, y] = PAPEL[i % 3]
        if x + 1 <= 11:
            px[x + 1, y] = PAPEL[i % 3]
    for cx, cy in ((7, 7), (10, 9)):  # chispas de idea flotando
        px[cx, cy] = CHISPA_CENTRO
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if 4 <= cx + dx <= 11:
                px[cx + dx, cy + dy] = CHISPA
    for y in range(6, 11):
        px[5, y] = BRILLO
    return im


# ── Escritorio de lluvia de ideas ───────────────────────────────────────────────────────────────────────────────
def escritorio():
    im = abrir('mesa_2.png')
    return al_piso(im, 31)


MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)
PIEZAS = [
    ('IDEAS_BOX', 'Buzón de ideas', buzon, 1, 2, dict(category='misc', backgroundTiles=1)),
    ('IDEAS_NOTE_BOARD', 'Pizarrón de notas', lambda: pizarron(True), 3, 2, PARED),
    ('IDEAS_NOTE_BOARD_EMPTY', 'Pizarrón de notas (vacío)', lambda: pizarron(False), 3, 2, PARED),
    ('IDEAS_BULB_ON', 'Foco de idea (prendido)', lambda: foco(True), 1, 2, dict(category='decor', backgroundTiles=1)),
    ('IDEAS_BULB_OFF', 'Foco de idea (apagado)', lambda: foco(False), 1, 2, dict(category='decor', backgroundTiles=1)),
    ('IDEAS_JAR', 'Frasco de ideas', frasco, 1, 1, MESA),
    ('IDEAS_DESK', 'Escritorio de lluvia de ideas', escritorio, 3, 2,
     dict(category='desks', isDesk=True, backgroundTiles=1)),
]


def hoja(hechas, salida, k=4):
    """Hoja de escala: un agente (char_0, cuadro 0,0,24,44) a la izquierda y las piezas, todo x k sobre el piso."""
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    ims = [agente.crop((0, 0, 24, 44))] + hechas
    ancho = sum(i.width * k + 16 for i in ims) + 16
    alto = max(i.height for i in ims) * k + 32
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    d = ImageDraw.Draw(out)
    x = 16
    for n, i in enumerate(ims):
        y0 = alto - 16 - i.height * k
        if n:  # cuadrícula de 16 px detrás de cada pieza (no del agente)
            for gx in range(0, i.width, 16):
                for gy in range(0, i.height, 16):
                    d.rectangle([x + gx * k, y0 + gy * k, x + (gx + 16) * k - 1, y0 + (gy + 16) * k - 1],
                                outline=(95, 95, 118, 255))
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, y0))
        x += i.width * k + 16
    out.save(salida)
    print('vista:', salida)


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
