# Decoración de temporada (TEMPORADA_<NOMBRE>_*): juegos para cambiar la oficina según la fecha.
#
# Originales de PixelLab en temporada/<nombre>/originales/ (lista en trabajos.txt, se bajan con bajar.sh). Todos
# create_image_pixen, view=side, plantilla de muebles de frente (PIXELLAB.md §3); las variantes que no se usan se
# quedan en originales/ para comparar. Lo plano y con letras (letreros, banderines, serpentinas, papel picado, luces,
# telarañas, murciélagos, corazones, regalos, velas, esferas, guirnalda) va por código.
#
# Uso:  python arte/pixellab/temporada/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y una hoja de escala por temporada en
# temporada/vista_<nombre>.png (agente a la izquierda, x4). No gasta.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar, sin_halo  # noqa: E402

REPO = AQUI.parents[2]
T = (0, 0, 0, 0)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


CONTORNO = rgb('#1b1b22')


# ── Originales de PixelLab ────────────────────────────────────────────────────────────────────────────────────

def abrir(temporada, nombre):
    return limpiar(_abrir(AQUI / temporada, nombre))


def sin_sombra(im):
    """Quita la elipse gris de 'sombra de piso' que a veces pinta PixelLab bajo el objeto (grises poco saturados
    en las últimas filas ocupadas)."""
    px = im.load()
    y1 = im.getbbox()[3]
    for y in range(max(0, y1 - 4), y1):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 18 and 50 < r < 170:
                px[x, y] = T
    return im


def piso(temporada, nombre, w=None, h=None, sombra=False):
    """Pieza de piso: se recorta a w x h px centrando lo dibujado (nunca se escala) y se baja al piso."""
    im = abrir(temporada, nombre)
    if sombra:
        im = sin_sombra(im)
    x0, y0, x1, y1 = im.getbbox()
    w = w or im.width
    h = h or im.height
    pieza = im.crop((x0, y0, x1, y1))
    out = Image.new('RGBA', (w, h), T)
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - pieza.height))
    return al_piso(out, h - 1)


def chico(temporada, nombre):
    """Pieza de 1x1 pedida en 16/20 px: recorte de lo dibujado, abajo al centro de 16x16 (si es más ancha, al
    centro)."""
    im = abrir(temporada, nombre)
    x0, y0, x1, y1 = im.getbbox()
    if x1 - x0 > 16:
        x0 += (x1 - x0 - 16) // 2
        x1 = x0 + 16
    if y1 - y0 > 16:
        y0 = y1 - 16
    pieza = im.crop((x0, y0, x1, y1))
    out = Image.new('RGBA', (16, 16), T)
    out.alpha_composite(pieza, ((16 - pieza.width) // 2, 16 - pieza.height))
    return out


def pared(temporada, nombre, w, h):
    """Pieza de pared: lo dibujado centrado en un lienzo de w x h px."""
    im = abrir(temporada, nombre)
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), T)
    out.alpha_composite(pieza, ((w - pieza.width) // 2, (h - pieza.height) // 2))
    return out


def angosto(temporada, nombre):
    """Pieza delgada pedida en 32x32: recorte a 16 de ancho centrado en lo dibujado y bajada al piso (1x2)."""
    im = abrir(temporada, nombre)
    x0, _, x1, _ = im.getbbox()
    izq = max(0, min(im.width - 16, (x0 + x1 - 16) // 2))
    return al_piso(im.crop((izq, 0, izq + 16, im.height)), im.height - 1)


# ── Letras por código (tubo de 3x5; la N y la M de 4) ─────────────────────────────────────────────────────────
LETRAS = {
    'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    'C': ['XXX', 'X..', 'X..', 'X..', 'XXX'],
    'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    'F': ['XXX', 'X..', 'XX.', 'X..', 'X..'],
    'I': ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    'L': ['X..', 'X..', 'X..', 'X..', 'XXX'],
    'M': ['X..X', 'XXXX', 'X..X', 'X..X', 'X..X'],
    'N': ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
    'O': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    'P': ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
    'S': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
    'U': ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
    'V': ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
    'Z': ['XXX', '..X', '.X.', 'X..', 'XXX'],
    ' ': ['.', '.', '.', '.', '.'],
}
LETRAS['Ñ'] = LETRAS['N']


def texto(px, frase, y0, ancho_total, color, sombra=None, x_centro=None):
    """Escribe `frase` centrada; la Ñ lleva su tilde de 4 px en la fila y0-2. Devuelve los puntos pintados."""
    ancho = sum(len(LETRAS[c][0]) for c in frase) + (len(frase) - 1)
    x = (ancho_total - ancho) // 2 if x_centro is None else x_centro - ancho // 2
    puntos = []
    for c in frase:
        for dy, fila in enumerate(LETRAS[c]):
            for dx, ch in enumerate(fila):
                if ch == 'X':
                    puntos.append((x + dx, y0 + dy))
        if c == 'Ñ':
            puntos += [(x, y0 - 1), (x + 1, y0 - 2), (x + 2, y0 - 1), (x + 3, y0 - 2)]
        x += len(LETRAS[c][0]) + 1
    if sombra:
        for x, y in puntos:
            if (x + 1, y + 1) not in puntos:
                px[x + 1, y + 1] = sombra
    for x, y in puntos:
        px[x, y] = color
    return puntos


# ── Navidad ───────────────────────────────────────────────────────────────────────────────────────────────────
VERDE, VERDE_CLARO, VERDE_OSCURO = rgb('#2f8a3e'), rgb('#4fb052'), rgb('#1d5a2c')
ROJO, ROJO_CLARO, ROJO_OSCURO = rgb('#d0343a'), rgb('#f06a5e'), rgb('#8e1f2b')
ORO, ORO_CLARO, ORO_OSCURO = rgb('#e8b53a'), rgb('#fbe48a'), rgb('#a8741e')
BLANCO, NIEVE_SOMBRA = rgb('#f4f4f8'), rgb('#b9c6de')
AZUL, AZUL_CLARO = rgb('#3d7fd9'), rgb('#9cc8ff')
PLATA, PLATA_OSCURO = rgb('#d4d8e0'), rgb('#8b93a3')


BOLA = ['..XXX..', '.XcccX.', 'XclcccX', 'XcccccX', 'XccccsX', '.XsssX.', '..XXX..']


def esfera(px, x0, y0, color, claro, oscuro, gancho=True):
    """Esfera de 7x7 (contorno, brillo arriba a la izquierda, sombra abajo) con casquillo dorado encima."""
    for dy, fila in enumerate(BOLA):
        for dx, ch in enumerate(fila):
            if ch != '.':
                px[x0 + dx, y0 + dy] = {'X': CONTORNO, 'c': color, 'l': claro, 's': oscuro}[ch]
    if gancho:
        px[x0 + 3, y0 - 1] = ORO_OSCURO
        px[x0 + 2, y0 - 1] = CONTORNO
        px[x0 + 4, y0 - 1] = CONTORNO
        px[x0 + 3, y0 - 2] = CONTORNO


def esferas():
    """1x1: tres esferas navideñas amontonadas (dorada atrás, roja y azul adelante), con su casquillo."""
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    esfera(px, 4, 3, ORO, ORO_CLARO, ORO_OSCURO)
    esfera(px, 0, 9, ROJO, ROJO_CLARO, ROJO_OSCURO)
    esfera(px, 9, 9, AZUL, AZUL_CLARO, rgb('#24508f'))
    return im


def caja(px, x0, y0, x1, y1, color, oscuro, liston, liston_oscuro, moño=True):
    """Caja de regalo de frente: contorno, cara, sombra a la derecha, listón vertical y horizontal y moño."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            borde = x in (x0, x1) or y in (y0, y1)
            px[x, y] = CONTORNO if borde else (oscuro if x == x1 - 1 or y == y1 - 1 else color)
    cx = (x0 + x1) // 2
    tapa = y0 + 2
    for x in range(x0 + 1, x1):
        px[x, tapa] = oscuro
    for y in range(y0 + 1, y1):
        px[cx, y] = liston if y != y1 - 1 else liston_oscuro
    for x in range(x0 + 1, x1):
        px[x, tapa + 1 if y1 - y0 > 6 else tapa] = liston if x != x1 - 1 else liston_oscuro
    if moño:
        for x, y, c in ((cx - 2, y0 - 1, liston), (cx - 1, y0 - 2, liston), (cx - 1, y0 - 1, liston_oscuro),
                        (cx + 1, y0 - 1, liston_oscuro), (cx + 1, y0 - 2, liston), (cx + 2, y0 - 1, liston),
                        (cx, y0 - 1, liston_oscuro), (cx - 2, y0 - 2, CONTORNO), (cx + 2, y0 - 2, CONTORNO),
                        (cx - 1, y0 - 3, CONTORNO), (cx + 1, y0 - 3, CONTORNO), (cx - 3, y0 - 1, CONTORNO),
                        (cx + 3, y0 - 1, CONTORNO), (cx, y0 - 2, CONTORNO)):
            px[x, y] = c


def regalos(colores):
    """1x1: dos cajas de regalo (una grande atrás a la izquierda y una chica adelante a la derecha)."""
    (c1, o1, l1, lo1), (c2, o2, l2, lo2) = colores
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    caja(px, 1, 6, 10, 15, c1, o1, l1, lo1)
    caja(px, 8, 10, 14, 15, c2, o2, l2, lo2)
    return im


def guirnalda():
    """3x1 de pared: guirnalda de pino que cuelga en dos arcos, con bayas, esferas doradas y moños rojos."""
    im = Image.new('RGBA', (48, 16), T)
    px = im.load()
    puntos = []
    for x in range(2, 46):
        t = (x - 2) % 22 / 22  # dos arcos de 22 px
        y = 3 + round(5 * 4 * t * (1 - t))
        puntos.append((x, y))
    for x, y in puntos:  # rama de 3 px de grueso con agujas alternadas
        for dy in (-1, 0, 1, 2):
            px[x, y + dy] = VERDE if dy in (0, 1) else VERDE_OSCURO
        if x % 3 == 0:
            px[x, y - 2] = VERDE_OSCURO
            px[x, y] = VERDE_CLARO
        if x % 3 == 1:
            px[x, y + 3] = VERDE_OSCURO
    for x, y in puntos[3::6]:
        px[x, y + 1] = ROJO
        px[x + 1, y + 1] = ROJO_OSCURO
    for i in (11, 33):  # esferas doradas colgando del fondo de cada arco
        x, y = puntos[i - 2]
        px[x, y + 3] = ORO_OSCURO
        for dx, dy, c in ((-1, 4, ORO), (0, 4, ORO), (-1, 5, ORO_OSCURO), (0, 5, ORO_OSCURO), (-1, 4, ORO_CLARO)):
            px[x + dx, y + dy] = c
    for cx in (2, 24, 45):  # moños en los clavos
        for dx, dy, c in ((-2, 0, ROJO), (-1, 0, ROJO_OSCURO), (0, 0, ROJO_OSCURO), (1, 0, ROJO_OSCURO),
                          (2, 0, ROJO), (-2, -1, ROJO_CLARO), (2, -1, ROJO_CLARO), (-1, 1, ROJO), (1, 1, ROJO),
                          (-1, 2, ROJO_OSCURO), (1, 3, ROJO_OSCURO)):
            if 0 <= cx + dx < 48:
                px[cx + dx, 3 + dy] = c
    return sin_halo_contorno(im)


def sin_halo_contorno(im):
    """Contorno oscuro de 1 px (vecindad 4) alrededor de todo lo dibujado."""
    src = im.copy().load()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y][3]:
                continue
            if any(0 <= x + dx < im.width and 0 <= y + dy < im.height and src[x + dx, y + dy][3]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = CONTORNO
    return im


FOCOS = [rgb('#ff4d4d'), rgb('#ffd23f'), rgb('#4dd96b'), rgb('#4da6ff'), rgb('#ff8ae2')]


def luces():
    """3x1 de pared: tira de foquitos de colores en un cable que cuelga en ondas. Los foquitos usan exactamente los
    5 colores de FOCOS por si se animan después con `cycle`."""
    im = Image.new('RGBA', (48, 16), T)
    px = im.load()
    cable = rgb('#24352a')
    ys = {}
    for x in range(48):
        t = x % 16 / 16
        ys[x] = 3 + round(4 * 4 * t * (1 - t))
        px[x, ys[x]] = cable
    for i, x in enumerate(range(3, 48, 5)):
        y = ys[x] + 1
        c = FOCOS[i % len(FOCOS)]
        px[x, y] = CONTORNO  # casquillo
        for dy in (1, 2, 3):
            px[x, y + dy] = c
            px[x - 1, y + dy] = CONTORNO if dy != 2 else c
            px[x + 1, y + dy] = CONTORNO if dy != 2 else c
        px[x - 1, y + 2] = c
        px[x, y + 4] = CONTORNO
        px[x - 1, y + 1] = CONTORNO
        px[x + 1, y + 1] = CONTORNO
        px[x - 1, y + 3] = CONTORNO
        px[x + 1, y + 3] = CONTORNO
        px[x, y + 1] = rgb('#ffffff')  # brillo
    return im


# ── Año nuevo ─────────────────────────────────────────────────────────────────────────────────────────────────
NEGRO_NOCHE = rgb('#1c1b2e')
SERPENTINA = [rgb('#e8b53a'), rgb('#c8ccd6'), rgb('#e86aa6'), rgb('#56c5e8')]


def serpentinas(colores=SERPENTINA, ancho=32):
    """Pared: serpentinas de papel en espiral que cuelgan de una línea, alternando colores."""
    im = Image.new('RGBA', (ancho, 16), T)
    px = im.load()
    onda = (0, 1, 2, 2, 1, 0, -1, -1)  # vaivén de la tira, 2 px de grueso (cara clara y canto oscuro)
    for i, x in enumerate(range(3, ancho - 3, 6)):
        c = colores[i % len(colores)]
        osc = tuple(int(v * 0.6) for v in c[:3]) + (255,)
        largo = 10 + (i * 3) % 5
        for y in range(1, 1 + largo):
            dx = onda[(y + i * 3) % len(onda)]
            px[x + dx, y] = c
            px[x + dx + 1, y] = osc
    for x in range(ancho):  # cinta de arriba
        px[x, 0] = ORO_OSCURO
    return im


def letrero_anonuevo():
    # "FELIZ" arriba y "AÑO NUEVO" abajo; la tilde de la Ñ ocupa las filas 7-8 entre las dos líneas.
    im = Image.new('RGBA', (48, 16), T)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 47, 15], fill=CONTORNO)
    d.rectangle([1, 1, 46, 14], fill=ORO_OSCURO)
    d.rectangle([2, 2, 45, 13], fill=NEGRO_NOCHE)
    for x, y in ((0, 0), (47, 0), (0, 15), (47, 15)):
        im.putpixel((x, y), T)
    px = im.load()
    texto(px, 'FELIZ', 2, 48, ORO_CLARO)
    texto(px, 'AÑO NUEVO', 9, 48, ORO)
    for x, y in ((4, 4), (43, 4), (8, 3), (39, 3)):  # destellos (solo junto a FELIZ)
        px[x, y] = ORO_CLARO
    return im


# ── Día de Muertos ────────────────────────────────────────────────────────────────────────────────────────────
PICADO = [rgb('#e8378f'), rgb('#ff8a1f'), rgb('#8c4fd6'), rgb('#33b56a'), rgb('#ffd23f'), rgb('#2fa8e0')]


def papel_picado():
    """3x1 de pared: hilera de banderitas de papel picado con calados (flor y rombos) en 6 colores."""
    im = Image.new('RGBA', (48, 16), T)
    px = im.load()
    hilo = rgb('#3a2a20')
    for x in range(48):
        px[x, 1] = hilo
    for i, x0 in enumerate(range(1, 47, 8)):
        c = PICADO[i % len(PICADO)]
        osc = tuple(int(v * 0.7) for v in c[:3]) + (255,)
        for y in range(2, 13):
            for x in range(x0, x0 + 7):
                px[x, y] = c
        for x in range(x0, x0 + 7):  # orilla de abajo en picos
            px[x, 13] = c if (x - x0) % 2 == 0 else T
            px[x, 2] = osc
        for x, y in ((x0 + 3, 5), (x0 + 2, 6), (x0 + 4, 6), (x0 + 3, 7), (x0 + 1, 9), (x0 + 5, 9), (x0 + 3, 10)):
            px[x, y] = T  # calados
    return im


CERA, CERA_SOMBRA = rgb('#f3ead2'), rgb('#cbbf9e')
FLAMA, FLAMA_CENTRO = rgb('#ff9a1f'), rgb('#ffe066')


def velas():
    """1x1: tres velas blancas de distinta altura con flama y escurrimientos, en un platito de barro."""
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    for x0, alto in ((2, 7), (6, 10), (11, 5)):
        base = 13
        for y in range(base - alto, base):
            px[x0, y] = CERA
            px[x0 + 1, y] = CERA
            px[x0 + 2, y] = CERA_SOMBRA
        px[x0 + 1, base - alto + 1] = CERA_SOMBRA  # escurrido
        px[x0, base - alto + 2] = CERA_SOMBRA
        px[x0 + 1, base - alto - 1] = CONTORNO  # mecha
        px[x0 + 1, base - alto - 2] = FLAMA_CENTRO
        px[x0 + 1, base - alto - 3] = FLAMA
        px[x0, base - alto - 2] = FLAMA
        px[x0 + 2, base - alto - 2] = FLAMA
    barro, barro_osc = rgb('#b5622f'), rgb('#7a3b1d')
    for x in range(1, 15):
        px[x, 13] = barro
        px[x, 14] = barro_osc
    return sin_halo_contorno(im)


# ── Halloween ─────────────────────────────────────────────────────────────────────────────────────────────────
TELA = rgb('#e6e8f0', 210)
TELA_TENUE = rgb('#c9ccd8', 150)


def telarana():
    """1x1 de pared/esquina: telaraña desde la esquina de arriba a la izquierda, con su araña colgando."""
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    rayos = [(15, 0), (15, 7), (12, 12), (7, 15), (0, 15)]
    for x1, y1 in rayos:
        n = max(x1, y1)
        for i in range(n + 1):
            px[round(x1 * i / n), round(y1 * i / n)] = TELA
    for r in (4, 8, 12):  # hilos curvos entre rayos
        for k in range(len(rayos) - 1):
            (ax, ay), (bx, by) = rayos[k], rayos[k + 1]
            la, lb = max(ax, ay), max(bx, by)
            p = (ax * r / la, ay * r / la)
            q = (bx * r / lb, by * r / lb)
            for t in range(9):
                f = t / 8
                x = p[0] + (q[0] - p[0]) * f
                y = p[1] + (q[1] - p[1]) * f
                hundido = 0.12 * r * 4 * f * (1 - f)  # cuelga hacia la esquina
                x, y = round(x - hundido * 0.7), round(y - hundido * 0.7)
                if 0 <= x < 16 and 0 <= y < 16 and not px[x, y][3]:
                    px[x, y] = TELA_TENUE
    for y in range(7, 11):  # hilo de la araña
        px[11, y] = TELA_TENUE
    for x, y in ((10, 11), (11, 11), (12, 11), (10, 12), (11, 12), (12, 12), (9, 11), (13, 11), (9, 13), (13, 13)):
        px[x, y] = CONTORNO
    px[11, 11] = rgb('#3a2f4a')
    return im


MURCIELAGO, MURCIELAGO_CLARO = rgb('#2a1f3a'), rgb('#4b3a66')
OJO = rgb('#ffcf3a')

ALA = [  # murciélago de 9x5 (X = cuerpo, O = ojos)
    'X...X...X',
    'XX.XXX.XX',
    'XXXXOXOXX',
    '.XXXXXXX.',
    '..X.X.X..',
]


def murcielagos():
    """2x1 de pared: tres murciélagos de papel negro morado con ojos amarillos, en alturas distintas."""
    im = Image.new('RGBA', (32, 16), T)
    px = im.load()
    for x0, y0 in ((1, 2), (12, 8), (22, 1)):
        for dy, fila in enumerate(ALA):
            for dx, ch in enumerate(fila):
                if ch == 'X':
                    px[x0 + dx, y0 + dy] = MURCIELAGO if dy else MURCIELAGO_CLARO
                elif ch == 'O':
                    px[x0 + dx, y0 + dy] = OJO
    return im


# ── San Valentín ──────────────────────────────────────────────────────────────────────────────────────────────
ROSA, ROSA_CLARO, ROSA_OSCURO = rgb('#ff7aa8'), rgb('#ffc2d8'), rgb('#c2456f')
CORAZON = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
CORAZON_CHICO = ['XX.XX', 'XXXXX', '.XXX.', '..X..']


def corazon(px, x0, y0, forma, color, claro, oscuro):
    for dy, fila in enumerate(forma):
        for dx, ch in enumerate(fila):
            if ch == 'X':
                abajo = dy + 1 >= len(forma) or forma[dy + 1][dx] != 'X'
                px[x0 + dx, y0 + dy] = oscuro if abajo or dx == len(fila) - 1 else color
    px[x0 + 1, y0 + 1] = claro


def corazones():
    """2x1 de pared: guirnalda de corazones rojos y rosas colgando de un hilo."""
    im = Image.new('RGBA', (32, 16), T)
    px = im.load()
    hilo = rgb('#c2456f')
    for x in range(32):
        y = 1 + round(2 * 4 * (x / 31) * (1 - x / 31))
        px[x, y] = hilo
    for i, (x0, y0, grande) in enumerate(((1, 4, False), (7, 5, True), (16, 6, False), (22, 5, True))):
        forma = CORAZON if grande else CORAZON_CHICO
        if i % 2:
            corazon(px, x0, y0, forma, ROJO, ROJO_CLARO, ROJO_OSCURO)
        else:
            corazon(px, x0, y0, forma, ROSA, ROSA_CLARO, ROSA_OSCURO)
    return sin_halo_contorno(im)


# ── Cumpleaños ────────────────────────────────────────────────────────────────────────────────────────────────
FIESTA = [rgb('#ff5b5b'), rgb('#ffd23f'), rgb('#4dd96b'), rgb('#4da6ff'), rgb('#c77dff')]


def banderines():
    """3x1 de pared: hilera de banderines triangulares de colores."""
    im = Image.new('RGBA', (48, 16), T)
    px = im.load()
    hilo = rgb('#5a4636')
    for x in range(48):
        px[x, 1 + round(3 * 4 * (x / 47) * (1 - x / 47))] = hilo
    for i, x0 in enumerate(range(3, 42, 7)):
        c = FIESTA[i % len(FIESTA)]
        osc = tuple(int(v * 0.7) for v in c[:3]) + (255,)
        ytop = 2 + round(3 * 4 * ((x0 + 3) / 47) * (1 - (x0 + 3) / 47))
        for dy in range(8):
            mitad = 3 - dy * 3 // 8
            for dx in range(-mitad, mitad + 1):
                px[x0 + 3 + dx, ytop + dy] = osc if dx == mitad else c
    return sin_halo_contorno(im)


def letrero_cumple():
    im = Image.new('RGBA', (48, 16), T)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 47, 15], fill=CONTORNO)
    d.rectangle([1, 1, 46, 14], fill=rgb('#ff7aa8'))
    d.rectangle([2, 2, 45, 13], fill=rgb('#2a1f3a'))
    for x, y in ((0, 0), (47, 0), (0, 15), (47, 15)):
        im.putpixel((x, y), T)
    px = im.load()
    # cada letra de un color de fiesta
    for frase, y in (('FELIZ', 2), ('CUMPLEAÑOS', 9)):
        ancho = sum(len(LETRAS[c][0]) for c in frase) + len(frase) - 1
        x = (48 - ancho) // 2
        for i, c in enumerate(frase):
            texto(px, c, y, 48, FIESTA[i % len(FIESTA)], x_centro=x + len(LETRAS[c][0]) // 2)
            x += len(LETRAS[c][0]) + 1
    return im


def reloj():
    """1x1 de pared: reloj redondo dorado con las dos manecillas en las 12 y dos destellos."""
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    cx, cy = 7.5, 7.5
    caratula = rgb('#fbf3dc')
    for y in range(16):
        for x in range(16):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= 4.6:
                px[x, y] = caratula
            elif d <= 5.8:
                px[x, y] = ORO if y < 9 else ORO_OSCURO
            elif d <= 6.9:
                px[x, y] = CONTORNO
    for x, y in ((7, 4), (8, 4), (11, 7), (11, 8), (7, 11), (8, 11), (4, 7), (4, 8)):  # marcas 12, 3, 6, 9
        px[x, y] = ORO_OSCURO
    for y in range(5, 9):  # minutero y horario juntos en las 12
        px[7, y] = CONTORNO
    for y in range(6, 9):
        px[8, y] = CONTORNO
    px[8, 8] = ROJO
    for x, y in ((0, 1), (1, 0), (1, 1), (1, 2), (2, 1), (14, 13), (14, 14), (14, 15), (13, 14), (15, 14)):
        px[x, y] = ORO_CLARO
    return im


CAJA_CORAZON = ['..XXX...XXX..', '.XXXXX.XXXXX.', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX',
                '.XXXXXXXXXXX.', '..XXXXXXXXX..', '...XXXXXXX...', '....XXXXX....', '.....XXX.....',
                '......X......']


def chocolates():
    """1x1: caja de chocolates en forma de corazón (tapa roja, canto oscuro, moño rosa)."""
    im = Image.new('RGBA', (16, 16), T)
    px = im.load()
    x0, y0 = 0, 1
    for dy, fila in enumerate(CAJA_CORAZON):  # canto de la caja, 2 px abajo
        for dx, ch in enumerate(fila):
            if ch == 'X':
                px[x0 + 1 + dx, y0 + dy + 2] = ROJO_OSCURO
    for dy, fila in enumerate(CAJA_CORAZON):
        for dx, ch in enumerate(fila):
            if ch == 'X':
                px[x0 + 1 + dx, y0 + dy] = ROJO
    for x, y in ((3, 2), (4, 2), (2, 3), (9, 2)):
        px[x, y] = ROJO_CLARO
    for x, y in ((9, 4), (10, 3), (10, 4), (11, 4), (12, 3), (12, 4), (13, 4), (10, 5), (12, 5), (11, 6)):  # moño
        px[x, y] = ROSA if (x + y) % 2 else ROSA_CLARO
    im = sin_halo_contorno(im)
    px = im.load()
    return im


def farol():
    """Farol de PixelLab con el vidrio cian pasado a ámbar (luz de vela)."""
    im = abrir('halloween', 'farol_1.png')
    px = im.load()
    rampa = [rgb('#7a3d12'), rgb('#c46a1c'), rgb('#f0a23a'), rgb('#ffd27a')]
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and b > r + 30 and g > r + 15:
                lum = (r * 299 + g * 587 + b * 114) / 1000
                px[x, y] = rampa[min(3, int(lum / 256 * 4.4))]
    return al_piso(im, 31)


# ── Piezas ────────────────────────────────────────────────────────────────────────────────────────────────────
PARED = dict(category='wall', canPlaceOnWalls=True)
DECO = dict(category='decor')
REGALOS_NAVIDAD = ((ROJO, ROJO_OSCURO, ORO, ORO_OSCURO), (VERDE, VERDE_OSCURO, ROJO_CLARO, ROJO))
REGALOS_CUMPLE = ((rgb('#4da6ff'), rgb('#2b6fbf'), rgb('#ffd23f'), rgb('#c79b1c')),
                  (rgb('#c77dff'), rgb('#8a4fc2'), rgb('#4dd96b'), rgb('#2f9c4a')))

PAN = 'pan_1.png'  # variante escogida
GLOBOS_ANONUEVO = 'globos_2.png'

TEMPORADAS = {
    'navidad': [
        ('TEMPORADA_NAVIDAD_TREE', 'Árbol de Navidad', lambda: piso('navidad', 'arbol_1.png'), 2, 3,
         dict(category='decor', backgroundTiles=2)),
        ('TEMPORADA_NAVIDAD_ORNAMENTS', 'Esferas navideñas', esferas, 1, 1, DECO),
        ('TEMPORADA_NAVIDAD_GIFTS', 'Regalos de Navidad', lambda: regalos(REGALOS_NAVIDAD), 1, 1, DECO),
        ('TEMPORADA_NAVIDAD_POINSETTIA', 'Nochebuena', lambda: piso('navidad', 'nochebuena_1.png'), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_NAVIDAD_GARLAND', 'Guirnalda de pino', guirnalda, 3, 1, PARED),
        ('TEMPORADA_NAVIDAD_LIGHTS', 'Tira de foquitos', luces, 3, 1, PARED),
        ('TEMPORADA_NAVIDAD_SNOW_WINDOW', 'Ventana con nieve', lambda: pared('navidad', 'ventana_1.png', 32, 32), 2, 2,
         PARED),
    ],
    'anonuevo': [
        ('TEMPORADA_ANONUEVO_STREAMERS', 'Serpentinas', serpentinas, 2, 1, PARED),
        ('TEMPORADA_ANONUEVO_BALLOONS', 'Globos dorados', lambda: piso('anonuevo', GLOBOS_ANONUEVO), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_ANONUEVO_CLOCK', 'Reloj de medianoche', reloj, 1, 1, PARED),
        ('TEMPORADA_ANONUEVO_TOAST', 'Copas y champaña', lambda: chico('anonuevo', 'copas_1.png'), 1, 1, DECO),
        ('TEMPORADA_ANONUEVO_SIGN', 'Letrero FELIZ AÑO NUEVO', letrero_anonuevo, 3, 1, PARED),
    ],
    'muertos': [
        ('TEMPORADA_MUERTOS_OFRENDA', 'Ofrenda', lambda: piso('muertos', 'ofrenda_3.png', 32, 32, sombra=True), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_MUERTOS_MARIGOLDS', 'Cempasúchil', lambda: chico('muertos', 'cempasuchil_1.png'), 1, 1, DECO),
        ('TEMPORADA_MUERTOS_CANDLES', 'Velas', velas, 1, 1, DECO),
        ('TEMPORADA_MUERTOS_SUGAR_SKULL', 'Calaverita de azúcar', lambda: chico('muertos', 'calaveritas_1.png'), 1, 1,
         DECO),
        ('TEMPORADA_MUERTOS_PAN', 'Pan de muerto', lambda: chico('muertos', PAN), 1, 1, DECO),
        ('TEMPORADA_MUERTOS_PAPEL_PICADO', 'Papel picado', papel_picado, 3, 1, PARED),
    ],
    'halloween': [
        ('TEMPORADA_HALLOWEEN_PUMPKIN', 'Calabaza', lambda: chico('halloween', 'calabaza_1.png'), 1, 1, DECO),
        ('TEMPORADA_HALLOWEEN_COBWEB', 'Telaraña', telarana, 1, 1, PARED),
        ('TEMPORADA_HALLOWEEN_BATS', 'Murciélagos', murcielagos, 2, 1, PARED),
        ('TEMPORADA_HALLOWEEN_CANDY', 'Cubeta de dulces', lambda: chico('halloween', 'dulces_1.png'), 1, 1, DECO),
        ('TEMPORADA_HALLOWEEN_LANTERN', 'Farol', farol, 2, 2, dict(category='decor', backgroundTiles=1)),
    ],
    'sanvalentin': [
        ('TEMPORADA_SANVALENTIN_HEARTS', 'Corazones', corazones, 2, 1, PARED),
        ('TEMPORADA_SANVALENTIN_BALLOONS', 'Globos de corazón', lambda: piso('sanvalentin', 'globos_1.png'), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_SANVALENTIN_ROSES', 'Rosas en florero', lambda: angosto('sanvalentin', 'rosas_1.png'), 1, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_SANVALENTIN_CHOCOLATES', 'Caja de chocolates', chocolates, 1, 1, DECO),
        ('TEMPORADA_SANVALENTIN_TABLE', 'Mesita romántica', lambda: piso('sanvalentin', 'mesita_1.png'), 2, 2,
         dict(category='decor', backgroundTiles=1)),
    ],
    'cumple': [
        ('TEMPORADA_CUMPLE_CAKE', 'Pastel', lambda: chico('cumple', 'pastel_1.png'), 1, 1, DECO),
        ('TEMPORADA_CUMPLE_BALLOONS', 'Globos', lambda: piso('cumple', 'globos_1.png'), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('TEMPORADA_CUMPLE_BUNTING', 'Banderines', banderines, 3, 1, PARED),
        ('TEMPORADA_CUMPLE_GIFTS', 'Regalos', lambda: regalos(REGALOS_CUMPLE), 1, 1, DECO),
        ('TEMPORADA_CUMPLE_SIGN', 'Letrero FELIZ CUMPLEAÑOS', letrero_cumple, 3, 1, PARED),
    ],
}


def hoja(nombre, piezas):
    """Hoja de escala x4: un agente (char_0, cuadro de frente) a la izquierda y todas las piezas en fila."""
    k = 4
    agente = Image.open(REPO / 'webview-ui/public/assets/characters/char_0.png').convert('RGBA').crop((0, 0, 24, 44))
    todas = [agente] + piezas
    ancho = sum(i.width * k + 12 for i in todas) + 12
    alto = max(i.height for i in todas) * k + 24
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 12
    for i in todas:
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 12 - i.height * k))
        x += i.width * k + 12
    return out


def main():
    solo = sys.argv[1:] or list(TEMPORADAS)
    for t in solo:
        hechas = []
        for id_, nombre, fn, fw, fh, extra in TEMPORADAS[t]:
            im = fn()
            guardar(id_, nombre, im, fw, fh, **extra)
            hechas.append(im)
        hoja(t, hechas).save(AQUI / f'vista_{t}.png')
    print('vistas en', AQUI)


if __name__ == '__main__':
    main()
