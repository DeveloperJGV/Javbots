"""Arma las hojas de personaje (formato ampliado de la Fase 4B) desde lo que baja `bajar.py`.

Hoja: 8 cuadros de 24x44 x 3 direcciones = 192x132 (orden de Metro City + un 4.º cuadro de caminar):
  fila 0 = de frente, fila 1 = de espaldas, fila 2 = de lado (mirando a la derecha; la izquierda la voltea el juego).
  cuadros: caminar1..4, teclear1, teclear2, leer1, leer2. Se camina 1-2-3-4 (el juego hoy hace 1-2-3-2 con 3:
  hay que cambiar `getCharacterSprites` cuando se integre).

De PixelLab salen el personaje y el caminar de frente y de lado. Lo que PixelLab hace mal se arma por código:
  - caminar de espaldas: se levanta un pie y luego el otro sobre la vista de espaldas;
  - teclear / leer: sentado (se quitan filas de pierna), manos adelante que suben y bajan, hoja en las manos.

Nunca se escala: solo se recorta, se mueven píxeles y se dibuja encima.

Uso: python armar.py <personaje> [<personaje> ...]   -> <personaje>/hoja.png y <personaje>/hoja_x8.png
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

AQUI = Path(__file__).parent
CUADRO_W, CUADRO_H = 24, 44
PIE = 42  # última fila de los zapatos en el cuadro (deja 1 fila libre abajo)
FONDO = (70, 70, 90, 255)
LEVANTA = 2  # px que sube el pie al caminar de espaldas
ARRIBA = 8  # margen que se agrega arriba del lienzo de PixelLab (para el pelo estirado); las fichas no lo cuentan

# Hoja de papel para "leer" (crema con renglones y contorno oscuro).
PAPEL = (236, 228, 204, 255)
PAPEL_RENGLON = (150, 140, 120, 255)
PAPEL_BORDE = (60, 50, 50, 255)

# ── Retoques por personaje (corren sobre cada cuadro ya estirado) ───────────────────────────────────────────────

# Senku (anime): base del pelo casi blanca, puntas verde fuerte, dos mechones largos junto a la cara, ojos rojos.
SENKU_PUNTAS = [(92, 170, 78), (118, 196, 96), (150, 218, 120), (186, 236, 160)]  # oscuro -> claro
SENKU_BASE = [(176, 204, 178), (200, 222, 200), (222, 236, 222), (240, 247, 240)]
SENKU_OJO = (196, 36, 44)
SENKU_PUNTA = 4  # px verdes en la punta de cada pico
SENKU_PIEL = (240, 191, 172)


def es_pelo_senku(c):
    r, g, b, a = c
    return a and g > r + 8 and g > b + 4 and g > 180  # verdes claros de PixelLab


def retoque_senku(im, direccion):
    out = im.copy()
    px = out.load()
    pelo = [(x, y) for y in range(im.height) for x in range(im.width) if es_pelo_senku(px[x, y])]
    if not pelo:
        return out
    y_arriba = min(y for _, y in pelo)
    piel = [(x, y) for y in range(y_arriba, y_arriba + 30) for x in range(im.width) if cerca(px[x, y], SENKU_PIEL, 40)]
    y_frente = min(y for _, y in piel) if piel else y_arriba + 12  # donde empieza la cara: ahí termina el pelo de arriba
    # punta = los primeros SENKU_PUNTA px de pelo de cada columna (así cada pico, también los de los lados, es verde)
    tope = {}
    for x, y in pelo:
        tope[x] = min(tope.get(x, y), y)
    for x, y in pelo:
        luz = sum(px[x, y][:3])
        nivel = min(3, max(0, (luz - 540) // 30))  # 4 tonos según lo claro del original
        punta = y - tope[x] < SENKU_PUNTA and y < y_frente
        px[x, y] = (SENKU_PUNTAS if punta else SENKU_BASE)[nivel] + (255,)
    if direccion != 'north' and piel:
        cara = [(x, y) for x, y in piel if y < y_frente + 10]
        x0, x1 = min(x for x, _ in cara), max(x for x, _ in cara)
        y1 = max(y for _, y in cara)
        for x in (x0 - 1, x1 + 1) if direccion == 'south' else ():  # mechones: del nacimiento del pelo a la barbilla, puntas verdes
            for y in range(y_frente - 1, y1 + 1):
                px[x, y] = (SENKU_BASE[1] if y < y1 - 1 else SENKU_PUNTAS[1]) + (255,)
        # ojos rojos: píxel oscuro de la cara que tiene otro oscuro justo encima (la pupila bajo el párpado)
        for y in range(y_frente, y1):
            for x in range(x0, x1 + 1):
                c, arriba = px[x, y], px[x, y - 1]
                if c[3] and sum(c[:3]) < 200 and arriba[3] and sum(arriba[:3]) < 200:
                    px[x, y] = SENKU_OJO + (255,)
    return out


# Neo: lentes negros (PixelLab los pinta azules). Lo azul se vuelve casi negro; lo azul claro, un brillo gris.
NEO_LENTE = (18, 18, 24)
NEO_BRILLO = (96, 96, 112)


def retoque_neo(im, direccion):
    out = im.copy()
    px = out.load()
    hombros = im.getbbox()[1] + 14  # el verde solo en la ropa: el pelo se queda negro
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and b > r + 25 and b > g + 25:
                px[x, y] = (NEO_BRILLO if r + g + b > 330 else NEO_LENTE) + (255,)
            elif a and y >= hombros and 30 < r + g + b and max(r, g, b) < 110:
                # Ropa negra con tono verde Matrix (de lejos se confundía con Trinity); el contorno no se toca
                px[x, y] = (r * 70 // 100, min(255, g * 105 // 100 + 14), b * 70 // 100, a)
    return out


# Gandalf el Gris: PixelLab pinta túnica y sombrero azul marino; se pasan a gris (más claro, misma luz relativa).
# Bigote: la piel de la boca que queda justo encima de la barba se vuelve barba (2 filas). Báculo: solo al caminar.
GANDALF_BARBA = (207, 201, 208)
GANDALF_BIGOTE = (186, 178, 186)
GANDALF_BACULO = (122, 84, 50)
GANDALF_BACULO_OSCURO = (70, 46, 30)


def retoque_gandalf(im, direccion):
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and b > r + 15 and b > g + 15:  # azulado (el contorno casi negro no entra)
                gris = min(255, (r + g + b) // 3 * 135 // 100 + 18)
                px[x, y] = (gris, gris, min(255, gris + 4), a)
    if direccion == 'north':
        return out
    barba = lambda c: c[3] and (cerca(c, GANDALF_BARBA, 50) or c[:3] == GANDALF_BIGOTE)
    piel = lambda c: c[3] and c[0] > 140 and c[0] > c[1] + 20  # piel y boca (rosados)
    for _ in range(2 if direccion == 'south' else 1):
        cambiar = [(x, y) for y in range(im.height - 1) for x in range(im.width) if piel(px[x, y]) and barba(px[x, y + 1])]
        for x, y in cambiar:
            px[x, y] = GANDALF_BIGOTE + (255,)
    return out


def baculo_gandalf(im, direccion):
    """Báculo de 1 px pegado a la orilla del cuerpo a la altura de la mano, completo, con la mano encima (2 px de piel)
    agarrándolo. De frente a la izquierda, de espaldas a la derecha, de lado por delante. Así se ve igual en todos
    los cuadros y sube y baja con la mano."""
    out = im.copy()
    px = out.load()
    x0, y0, x1, y1 = im.getbbox()
    centro = im.width // 2
    piel = FICHAS['gandalf']['piel']
    lado_izq = direccion == 'south'
    mano = [(x, y) for y in range(y0 + 20, y1) for x in range(im.width)
            if cerca(px[x, y], piel, 70) and (direccion == 'east' or (x < centro) == lado_izq)]
    y_mano = sum(y for _, y in mano) // len(mano) if mano else y1 - 14
    color_mano = px[mano[0]] if mano else piel + (255,)
    fila = [x for yy in range(y_mano - 1, y_mano + 2) for x in range(im.width) if px[x, yy][3]]
    x = min(fila) - 1 if lado_izq else max(fila) + 1
    arriba = max(0, y_mano - 18)  # sobresale por encima de la mano, a la altura del sombrero
    for y in range(arriba, y1):
        if not px[x, y][3]:  # por fuera del cuerpo; si algo lo tapa (ala del sombrero), pasa detrás
            px[x, y] = (GANDALF_BACULO_OSCURO if y - arriba < 2 else GANDALF_BACULO) + (255,)
    for y in (y_mano, y_mano + 1):
        px[x, y] = color_mano
    return out


# Kakashi: de espaldas PixelLab le pinta una raya negra vertical en el pelo (las puntas de la banda). Se rellena con el
# pelo de al lado: píxel oscuro con pelo claro a los dos lados (a 3 px o menos), en las filas del pelo.
KAKASHI_OJO = (40, 36, 62)
KAKASHI_PIEL = (242, 192, 168)


def retoque_kakashi(im, direccion):
    if direccion != 'north':
        # el ojo sale rojo/magenta en unos cuadros y normal en otros (parpadea al caminar): siempre oscuro
        out = im.copy()
        px = out.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a and r > g + 60 and b > g + 30:
                    px[x, y] = KAKASHI_OJO + (a,)
                elif a and r > 190 and b > g + 10:  # piel lila (de lado): a piel
                    px[x, y] = KAKASHI_PIEL + (a,)
        return out
    out = im.copy()
    src, px = im.load(), out.load()
    top = im.getbbox()[1]
    claro = lambda c: c[3] and sum(c[:3]) > 450
    for y in range(top, top + 12):
        for x in range(im.width):
            c = src[x, y]
            if not c[3] or sum(c[:3]) > 150:
                continue
            izq = next((src[xx, y] for xx in range(x - 1, max(-1, x - 4), -1) if sum(src[xx, y][:3]) > 150 or not src[xx, y][3]), None)
            der = next((src[xx, y] for xx in range(x + 1, min(im.width, x + 4)) if sum(src[xx, y][:3]) > 150 or not src[xx, y][3]), None)
            if izq and der and claro(izq) and claro(der):
                px[x, y] = izq
            elif claro(src[x, y - 1]) and claro(src[x, y + 1]):  # puntito suelto con pelo arriba y abajo
                px[x, y] = src[x, y - 1]
    return out


# Lentes oscuros por código (Trinity). PixelLab pinta los ojos distinto en cada cuadro (guiños, rosas, azules), así
# que no se buscan: los lentes van en un lugar fijo de la cara, 2 filas abajo de donde empieza la piel. De frente, dos
# micas de 3x2 con puente al centro; de lado, una mica de 4x2 pegada al frente de la cara y la patilla hacia atrás.
def lentes_oscuros(im, direccion, piel):
    if direccion == 'north':
        return im
    out = im.copy()
    px = out.load()
    top = im.getbbox()[1]
    es_piel = lambda c: cerca(c, piel, 50)
    filas = {y: [x for x in range(im.width) if es_piel(px[x, y])] for y in range(top, top + 20)}
    cara = next((y for y in range(top, top + 20) if len(filas[y]) >= 2), None)
    if cara is None:
        return out
    y0 = cara + (2 if direccion == 'south' else 1)
    piel_ojos = filas[y0] + filas[y0 + 1]
    if not piel_ojos:
        return out
    if direccion == 'south':
        cx = (min(piel_ojos) + max(piel_ojos)) // 2
        micas = [(cx - 3, cx - 1), (cx + 1, cx + 3)]
        for y in (y0, y0 + 1):
            for a, b in micas:
                for x in range(a, b + 1):
                    px[x, y] = NEO_LENTE + (255,)
        px[cx, y0] = NEO_LENTE + (255,)  # puente
        for a, _ in micas:
            px[a, y0] = NEO_BRILLO + (255,)
    else:
        fr = max(piel_ojos)
        for y in (y0, y0 + 1, y0 + 2):  # de lado el ojo cambia de fila entre cuadros: mica de 3
            for x in range(fr - 3, fr + 1):
                px[x, y] = NEO_LENTE + (255,)
        for x in range(fr - 6, fr - 3):  # patilla
            if es_piel(px[x, y0]):
                px[x, y0] = NEO_LENTE + (255,)
        px[fr - 3, y0] = NEO_BRILLO + (255,)
    return out


# Ficha por personaje. Filas en coordenadas del lienzo de PixelLab (48x48).
#   neutro:   cuadro de pie para cada dirección ('rot' = rotación quieta, o (animación, n.º de cuadro))
#   pasos:    4 cuadros de caminar para frente/lado, en orden; espaldas se arma por código.
#             Plantilla de 4 cuadros: (paso1, neutro, paso2, neutro). Plantilla de 8: (0, 2, 4, 6).
#             ('espejo', k) = el cuadro k volteado, si PixelLab pintó mal ese paso (de espaldas, con cara...)
#   piernas:  (primera fila de pierna, primera fila de zapato) por dirección
#   cadera:   fila donde termina la bata/torso de espaldas (las piernas empiezan abajo)
#   barbilla: las manos son piel por debajo de esta fila
#   piel:     color de piel, o 'auto' = el más común de la cara (las manos se buscan por cercanía a este color; 'tol_piel' = qué tan cerca)
#   manos_hasta: opcional, {dirección: fila}: no buscar manos desde esa fila (rodilleras, calcetas del mismo color)
#   estirar:  opcional, {dirección: (fila0, fila1, n)}: repite n filas entre fila0 y fila1 para que el pelo crezca
#             hacia arriba (el de Senku). Las demás filas de la ficha se escriben SIN contar ese estirón.
FICHAS = {
    'doc': {
        'carpeta': 'doc/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},  # plantilla de 8
        'piernas': {'south': (31, 38), 'east': (35, 39), 'north': (34, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (226, 171, 155),
    },
    'senku': {
        'carpeta': 'senku/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},  # plantilla de 8
        'piernas': {'south': (31, 37), 'east': (37, 40), 'north': (38, 40)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (240, 191, 172),
        'estirar': {'south': (3, 10, 6), 'east': (3, 10, 4), 'north': (3, 12, 6)},
        'retoque': retoque_senku,
    },
    'neo': {
        'carpeta': 'neo/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},  # plantilla de 8
        'piernas': {'south': (35, 39), 'east': (36, 39), 'north': (38, 40)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (239, 184, 163),
        'tol_piel': 160,
        'retoque': retoque_neo,
    },
    'chell': {
        'carpeta': 'chell/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},  # plantilla de 8
        'piernas': {'south': (31, 35), 'east': (33, 37), 'north': (31, 39)},
        # trae guantes blancos/grises: las "manos" se buscan por ese color, debajo de la playera y arriba de las rodilleras
        'barbilla': {'south': 25, 'east': 27, 'north': 26},
        'manos_hasta': {'south': 31, 'east': 32, 'north': 30},
        'piel': (226, 220, 220),
        'tol_piel': 110,
    },
    'gandalf': {
        'carpeta': 'gandalf/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},  # plantilla de 8: la de 4 marchaba
        'piernas': {'south': (33, 37), 'east': (36, 39), 'north': (36, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (230, 180, 170),
        'tol_piel': 70,
        'retoque': retoque_gandalf,
        'al_caminar': baculo_gandalf,
    },
    'kakashi': {  # v2 (la v1 "no se parece al del anime"); plantilla de 8 cuadros
        'carpeta': 'kakashi/v2',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (240, 192, 170),
        'retoque': lambda im, d: im if d == 'north' else retoque_kakashi(im, d),  # solo el ojo; la raya era de la v1
    },
    'marty': {  # becario
        'carpeta': 'marty/v2',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'trinity': {  # becario
        'carpeta': 'trinity/base',
        'retoque': lambda im, d: lentes_oscuros(im, d, (235, 190, 170)),
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'chrome': {  # becario
        'carpeta': 'chrome/v2',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'kohaku': {  # becario
        'carpeta': 'kohaku/v2',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'frodo': {  # becario
        'carpeta': 'frodo/v2',  # la v1 "no se parece"
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'sam': {  # becario
        'carpeta': 'sam/v2',  # la v1 "no se parece"
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'naruto': {  # becario
        'carpeta': 'naruto/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    'sakura': {  # becario
        'carpeta': 'sakura/base',
        'neutro': {'south': ('caminar8', 0), 'east': ('caminar8', 0), 'north': 'rot'},
        'pasos': {'south': (0, 2, 4, 6), 'east': (0, 2, 4, 6)},
        'piernas': {'south': (31, 36), 'east': (34, 38), 'north': (31, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': 'auto',
    },
    # DLC a futuro (en pausa desde el 2026-10-04)
    'drlight': {
        'carpeta': 'drlight/base',
        'neutro': {'south': ('caminar', 0), 'east': ('caminar', 0), 'north': 'rot'},
        'pasos': {'south': (1, 0, 3, 0), 'east': (1, 0, 3, 0)},
        'piernas': {'south': (31, 37), 'east': (35, 38), 'north': (36, 39)},
        'barbilla': {'south': 22, 'east': 24, 'north': 22},
        'piel': (228, 166, 145),
    },
}


def cargar(ficha, direccion, cual):
    base = AQUI / ficha['carpeta']
    if cual == 'rot':
        ruta = base / f'{direccion}.png'
    else:
        anim, n = cual
        ruta = base / 'zip' / 'Idle' / 'animations' / anim / direccion / f'frame_{n:03d}.png'
    original = Image.open(ruta).convert('RGBA')
    im = Image.new('RGBA', (original.width, original.height + ARRIBA))
    im.alpha_composite(original, (0, ARRIBA))
    if direccion in ficha.get('estirar', {}):
        im = estirar(im, *ficha['estirar'][direccion])
    if 'retoque' in ficha:
        im = ficha['retoque'](im, direccion)
    return im


def estirar(im, y0, y1, n):
    y0, y1 = y0 + ARRIBA, y1 + ARRIBA
    """Repite n filas repartidas entre y0 y y1 en un lienzo n filas más alto, agregado ARRIBA: lo que está debajo de
    y1 (cara, cuerpo) queda en la misma fila que antes y solo el pelo crece hacia arriba."""
    filas = list(range(y0, y1))
    dobles = {filas[i * len(filas) // n] for i in range(n)}
    out = Image.new('RGBA', im.size)
    y = im.height - 1
    for yy in range(im.height - 1, -1, -1):
        fila = im.crop((0, yy, im.width, yy + 1))
        for _ in range(2 if yy in dobles else 1):
            if y >= 0:
                out.alpha_composite(fila, (0, y))
            y -= 1
    return out


def ultima_fila(im):
    return im.getbbox()[3] - 1


def a_cuadro(im, dy):
    """Recorta el lienzo de 48 a 20x40 centrado en x y lo baja/sube `dy` filas (sin escalar)."""
    x0 = im.width // 2 - CUADRO_W // 2
    bx0, by0, bx1, by1 = im.getbbox()
    if by0 + dy < 0 or by1 + dy > CUADRO_H or bx0 < x0 or bx1 > x0 + CUADRO_W:
        print(f'  ¡ojo! un cuadro no cabe en {CUADRO_W}x{CUADRO_H}: bbox {im.getbbox()} con dy={dy}')
    cuadro = Image.new('RGBA', (CUADRO_W, CUADRO_H))
    cuadro.alpha_composite(im.crop((x0, 0, x0 + CUADRO_W, im.height)), (0, dy))
    return cuadro


def cerca(c, ref, tol=60):
    return c[3] and sum(abs(a - b) for a, b in zip(c[:3], ref)) < tol


def quitar_filas(im, desde, hasta):
    """Quita las filas [desde, hasta): lo de arriba baja para cerrar el hueco (los pies no se mueven)."""
    n = hasta - desde
    out = Image.new('RGBA', im.size)
    out.alpha_composite(im.crop((0, 0, im.width, desde)), (0, n))
    out.alpha_composite(im.crop((0, hasta, im.width, im.height)), (0, hasta))
    return out


BAJA_SENTADO = {'south': 4, 'north': 4, 'east': 3}  # filas que baja el cuerpo al sentarse


def manos(im, ficha, direccion):
    """Píxeles de las manos (en la pose sentada): piel debajo de la barbilla, a la izquierda/derecha del centro."""
    piel, barbilla = ficha['piel'], ficha['barbilla'][direccion]
    hasta = ficha.get('manos_hasta', {}).get(direccion, im.height)
    baja = BAJA_SENTADO[direccion] + ARRIBA
    px = im.load()
    centro = im.width // 2
    izq, der = [], []
    for y in range(barbilla + 1 + baja, min(im.height, hasta + baja)):
        for x in range(im.width):
            # de frente/espaldas las manos cuelgan a los lados: lo del centro es pecho o cuello
            if direccion != 'east' and abs(x - centro) < 4:
                continue
            if cerca(px[x, y], piel, ficha.get('tol_piel', 60)):
                (izq if x < centro else der).append((x, y))
    return izq, der


def relleno(px, x, y, w, movidos):
    """Color con que tapar un píxel que se movió: si queda dentro de la bata (hay ropa a los dos lados en esa fila),
    el de la ropa más cercana por la izquierda; si está en la orilla, transparente."""
    izq = next((px[xx, y] for xx in range(x - 1, -1, -1) if (xx, y) not in movidos), (0, 0, 0, 0))
    der = next((px[xx, y] for xx in range(x + 1, w) if (xx, y) not in movidos), (0, 0, 0, 0))
    if izq[3] and der[3]:
        return izq
    return (0, 0, 0, 0)


def mover(im, grupos):
    """Mueve grupos de píxeles: [(lista de (x, y), dx, dy)]. Primero tapa los huecos y luego pega encima."""
    out = im.copy()
    src, dst = im.load(), out.load()
    todos = {p for g, _, _ in grupos for p in g}
    for x, y in todos:
        dst[x, y] = relleno(src, x, y, im.width, todos)
    for g, dx, dy in grupos:
        for x, y in g:
            if 0 <= x + dx < im.width and 0 <= y + dy < im.height:
                dst[x + dx, y + dy] = src[x, y]
    return out


def sentado(im, ficha, direccion):
    """Pose sentada sobre el lienzo de 48: piernas más cortas (de espaldas, sin piernas: las tapa la silla)."""
    pierna, zapato = (f + ARRIBA for f in ficha['piernas'][direccion])
    if direccion == 'north':
        out = im.copy()
        out.paste((0, 0, 0, 0), (0, pierna, im.width, im.height))
        return quitar_filas(out, pierna - BAJA_SENTADO['north'], pierna)  # baja el cuerpo como los demás
    if direccion == 'south':
        return quitar_filas(im, pierna, pierna + BAJA_SENTADO['south'])
    # De lado: 3 filas menos de pierna y la pantorrilla 2 px adelante (rodilla doblada).
    out = quitar_filas(im, pierna, pierna + BAJA_SENTADO['east'])
    abajo = out.crop((0, zapato, im.width, im.height))
    out.paste((0, 0, 0, 0), (0, zapato, im.width, im.height))
    out.alpha_composite(abajo, (2, zapato))
    return out


def teclear(base, ficha, direccion):
    izq, der = manos(base, ficha, direccion)
    if direccion == 'east':  # una sola mano visible, hacia el teclado
        todas = izq + der
        return [mover(base, [(todas, 2, -2)]), mover(base, [(todas, 2, -1)])]
    return [mover(base, [(izq, 1, -2), (der, -1, -1)]), mover(base, [(izq, 1, -1), (der, -1, -2)])]


def hoja_papel(im, x, y, w, h):
    px = im.load()
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            borde = xx in (x, x + w - 1) or yy in (y, y + h - 1)
            renglon = not borde and (yy - y) % 2 == 0
            px[xx, yy] = PAPEL_BORDE if borde else (PAPEL_RENGLON if renglon else PAPEL)


def leer(base, ficha, direccion):
    izq, der = manos(base, ficha, direccion)
    cuadros = []
    for bob in (0, 1):
        if direccion == 'north':
            cuadros.append(mover(base, [(izq, 1, -2 - bob), (der, -1, -2 - bob)]))
            continue
        if direccion == 'east':
            todas = izq + der
            im = mover(base, [(todas, 2, -3)])
            hx = max(x for x, _ in todas) + 2
            hy = min(y for _, y in todas) - 5 + bob
            hoja_papel(im, hx, hy, 3, 6)
            cuadros.append(im)
            continue
        im = mover(base, [(izq, 2, -3), (der, -2, -3)])
        centro = base.width // 2  # si una mano no se ve (la tapa la ropa), se usa la otra en espejo
        x0 = (min(x for x, _ in izq) if izq else 2 * centro - 1 - max(x for x, _ in der)) + 2
        x1 = (max(x for x, _ in der) if der else 2 * centro - 1 - min(x for x, _ in izq)) - 2
        y0 = min(y for _, y in izq + der) - 5 + bob
        hoja_papel(im, x0 + 1, y0, x1 - x0 - 1, 6)
        # las manos van encima de la hoja
        src = mover(base, [(izq, 2, -3), (der, -2, -3)]).load()
        dst = im.load()
        for x, y in izq:
            dst[x + 2, y - 3] = src[x + 2, y - 3]
        for x, y in der:
            dst[x - 2, y - 3] = src[x - 2, y - 3]
        cuadros.append(im)
    return cuadros


def subir(im, dy):
    """Mueve el cuadro entero dy filas (positivo = abajo)."""
    out = Image.new('RGBA', im.size)
    out.alpha_composite(im, (0, dy)) if dy >= 0 else out.alpha_composite(im.crop((0, -dy, im.width, im.height)))
    return out


def paso(ficha, direccion, anim, n):
    """Un cuadro de caminar; ('espejo', k) = el cuadro k volteado (para cuando PixelLab pinta mal un paso de frente)."""
    if isinstance(n, tuple):
        return ImageOps.mirror(cargar(ficha, direccion, (anim, n[1])))
    return cargar(ficha, direccion, (anim, n))


def espaldas_caminar(im, ficha):
    """Caminar de espaldas: pie izquierdo arriba, neutro, pie derecho arriba, neutro."""
    pierna = ficha['piernas']['north'][0] + ARRIBA
    centro = im.width // 2

    def levantar(lado):
        out = im.copy()
        src, dst = im.load(), out.load()
        xs = range(0, centro) if lado == 'izq' else range(centro, im.width)
        for x in xs:
            for y in range(pierna + LEVANTA, im.height):
                dst[x, y - LEVANTA] = src[x, y]
            for y in range(im.height - LEVANTA, im.height):
                dst[x, y] = (0, 0, 0, 0)
        return out

    return [levantar('izq'), im, levantar('der'), im]


def piel_auto(ficha):
    """Color de piel más común en la cara (vista de frente): rosados/cafés claros con r > g > b."""
    im = cargar(ficha, 'south', ficha['neutro']['south'])
    top = im.getbbox()[1]
    cuenta = {}
    for y in range(top + 4, top + 20):
        for x in range(im.width):
            r, g, b, a = im.getpixel((x, y))
            if a and r > 150 and r > g + 15 and g > b and r - b < 120:
                cuenta[(r, g, b)] = cuenta.get((r, g, b), 0) + 1
    return max(cuenta, key=cuenta.get)


def armar(nombre):
    ficha = FICHAS[nombre]
    if ficha['piel'] == 'auto':
        ficha['piel'] = piel_auto(ficha)
        print('  piel', ficha['piel'])
    hoja = Image.new('RGBA', (CUADRO_W * 8, CUADRO_H * 3))
    for fila, direccion in enumerate(('south', 'north', 'east')):
        neutro = cargar(ficha, direccion, ficha['neutro'][direccion])
        if direccion == 'north':
            pasos = espaldas_caminar(neutro, ficha)
        else:
            anim = ficha['neutro'][direccion][0]
            pasos = [paso(ficha, direccion, anim, n) for n in ficha['pasos'][direccion]]
        if 'al_caminar' in ficha:  # algo que solo lleva al caminar (el báculo de Gandalf)
            pasos = [ficha['al_caminar'](im, direccion) for im in pasos]
        # Todos los pasos con la cabeza a la altura del neutro: PixelLab sube el cuerpo entero 1 px en algunos cuadros
        # y al combinarlos se ve un brinco. (Por los pies no: de frente el pie de adelante se ve más abajo, y está bien.)
        tope = neutro.getbbox()[1]
        pasos = [subir(im, tope - im.getbbox()[1]) for im in pasos]
        # el pie más bajo va en PIE; si es muy alto, manda la cabeza (que no se corte)
        abajo = max(ultima_fila(im) for im in pasos + [neutro])
        dy = max(PIE - abajo, -tope)
        base = sentado(neutro, ficha, direccion)
        cuadros = pasos + teclear(base, ficha, direccion) + leer(base, ficha, direccion)
        for col, im in enumerate(cuadros):
            hoja.alpha_composite(a_cuadro(im, dy), (col * CUADRO_W, fila * CUADRO_H))
    salida = AQUI / nombre / 'hoja.png'
    hoja.save(salida)
    vista = Image.new('RGBA', hoja.size, FONDO)
    vista.alpha_composite(hoja)
    vista.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(AQUI / nombre / 'hoja_x8.png')
    print(nombre, hoja.size, '->', salida)


if __name__ == '__main__':
    for n in sys.argv[1:] or FICHAS:
        armar(n)
