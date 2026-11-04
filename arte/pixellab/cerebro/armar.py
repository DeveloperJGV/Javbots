# "Cerebro central" (lee las bitácoras de los proyectos, resume y recuerda pendientes): piezas CEREBRO_*.
#
#   originales/domo_2.png       create_image_pixen 32x48, view=side, seed 7 (v2 de 2): domo de cristal vacío.
#                               Se le quitan 6 filas repetidas del cuerpo (42 de alto), el interior se pinta liso y la
#                               red neuronal (nodos + conexiones) se dibuja por código con colores exactos para que la
#                               página anime pulsos. Va en un lienzo 3x3 con cables que salen de la base a los lados.
#   originales/consola_2.png    32x32 (v2 de 2, seed 7; la v1 salió con 56 colores): consola; pantalla por código.
#   originales/impresora_2.png  32x32 (v2): impresora sobre gabinete (suelo 2x2), con y sin papel.
#   originales/impresora_1.png  20x20 (v1): impresora chica de mesa (1x1), con y sin papel.
#   domo_1 / consola_1: descartes (domo_1 de tapa plana; consola_1 sucia).
#
# Uso:  python arte/pixellab/cerebro/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json), red.json (nodos y conexiones del domo) y la
# hoja de escala vista_x4.png. No gasta generaciones.
import json
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return _abrir(AQUI, nombre)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def hexa(c):
    return '#%02x%02x%02x' % c[:3]


def sin_filas(im, quitar):
    filas = [y for y in range(im.height) if y not in quitar]
    out = Image.new('RGBA', (im.width, len(filas)), (0, 0, 0, 0))
    for ny, y in enumerate(filas):
        out.paste(im.crop((0, y, im.width, y + 1)), (0, ny))
    return out


def linea(x0, y0, x1, y1):
    """Bresenham: lista de píxeles de la línea (incluye los dos extremos)."""
    pts = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        pts.append((x0, y0))
        if (x0, y0) == (x1, y1):
            return pts
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


# ── Colores que la página puede animar (exactos, se pintan después de limpiar) ────────────────────────────────
INTERIOR = rgb('#0a1a2e')      # fondo del domo
CONEXION = rgb('#1f6f8b')      # conexiones en reposo (la página pinta pulsos encima)
PULSO = rgb('#bff6ff')         # color sugerido para el pulso que viaja (no está en el PNG)
NODO = rgb('#22d3ee')          # nodos
NODO_LUZ = rgb('#a5f3fc')      # brillo de 1 px en cada nodo
NUCLEO = rgb('#e879f9')        # nodo central (magenta)
NUCLEO_LUZ = rgb('#fae8ff')
CABLE = rgb('#23262e')         # funda de los cables
CABLE_LUZ = rgb('#1f6f8b')     # hilo de luz de los cables (mismo tono que CONEXION: el pulso sigue por ahí)
CABLE_ORILLA = rgb('#14161c')
CRISTAL_BRILLO = rgb('#bfe6f2')
PANTALLA = rgb('#0b1a2b')
CIAN = rgb('#22d3ee')
AMBAR = rgb('#fbbf24')
TEXTO = rgb('#8fb3c9')
VERDE = rgb('#4ade80')

# ── Domo ──────────────────────────────────────────────────────────────────────────────────────────────────────
DOMO_X, DOMO_Y = 8, 6          # esquina del domo (32x42) dentro del lienzo 48x48
QUITAR_FILAS = set(range(18, 24))  # filas repetidas del cuerpo del domo (original 32x48)
# colores del original que son "interior" (se pintan de INTERIOR); el resto (brillos del cristal, base) se queda
ES_INTERIOR = {rgb('#3d7b8d'), rgb('#062f3e'), rgb('#07303f'), rgb('#165469'), rgb('#48889d'), rgb('#7ebad4'),
               rgb('#094255'), rgb('#25728e')}
ES_RAYA = {rgb('#3e1b40'), rgb('#d5d5d2'), rgb('#07303f'), rgb('#062f3e')}  # raya de brillo del original
ZONA_INTERIOR = (4, 2, 26, 28)  # x0, y0, x1, y1 (en el domo de 32x42) donde se busca interior
# Red (coordenadas del domo 32x42). Nodo 0 = núcleo 3x3 centrado ahí; los demás 2x2 (esquina arriba-izquierda).
NODOS = [
    (13, 17),                                     # 0 núcleo
    (9, 6), (16, 5), (20, 9),                     # 1-3 arriba
    (9, 15), (20, 16),                            # 4-5 lados
    (6, 22), (13, 25), (19, 23),                  # 6-8 abajo
    (11, 11),                                     # 9 intermedio
]
CONEXIONES = [(0, 9), (9, 1), (9, 2), (2, 3), (1, 4), (0, 4), (0, 5), (3, 5), (0, 6), (0, 7), (0, 8), (6, 7),
              (7, 8), (5, 8), (4, 6), (9, 4)]


def domo():
    crudo = sin_filas(abrir('domo_2.png'), QUITAR_FILAS)
    cp = crudo.load()
    x0, y0, x1, y1 = ZONA_INTERIOR
    base = {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if cp[x, y] in ES_INTERIOR}
    base |= {(x, y) for y in range(14, 29) for x in range(21, 27) if cp[x, y] in ES_RAYA}
    # se rellena cada fila entre el primer y el último píxel de interior (borra las franjas del cristal); solo se
    # respetan los brillos muy claros de la izquierda (reflejo)
    interior = set()
    for y in range(y0, y1 + 1):
        xs = [x for x in range(x0, x1 + 1) if (x, y) in base]
        if not xs:
            continue
        izq = min(xs) if y < 11 else x0
        der = max(xs) if y < 11 else x1
        for x in range(izq, der + 1):
            r, g, b, _ = cp[x, y]
            if (x, y) in base or (r * 299 + g * 587 + b * 114) / 1000 < 170 or x > 8 or y > 12:
                interior.add((x, y))
    im = limpiar(crudo)
    px = im.load()
    # manchas moradas del fondo del cristal -> azul del cristal; motas crema de las esquinas de la base -> fuera
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and b > g + 25 and r >= g and r < 140 and r + g + b > 150:
                px[x, y] = rgb('#418093')
            elif a and (r, g, b) == (213, 213, 210) and y > 28:
                px[x, y] = rgb('#9addf2')
            elif a and (r, g, b) == (216, 207, 160):
                px[x, y] = (0, 0, 0, 0)
    for p in interior:
        px[p] = INTERIOR
    for y in range(14, 29):          # brillo del cristal: una raya clara de 1 px
        if (23, y) in interior:
            px[23, y] = CRISTAL_BRILLO
    pix_conexion = {}
    for a, b in CONEXIONES:
        pts = linea(*NODOS[a], *NODOS[b])
        pix_conexion[(a, b)] = pts
        for p in pts:
            assert p in interior, f'conexión {a}-{b} sale del domo en {p}'
            px[p] = CONEXION
    for i, (x, y) in enumerate(NODOS):
        if i == 0:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    assert (x + dx, y + dy) in interior, 'núcleo fuera'
                    px[x + dx, y + dy] = NUCLEO
            px[x - 1, y - 1] = NUCLEO_LUZ
        else:
            for dy in (0, 1):
                for dx in (0, 1):
                    assert (x + dx, y + dy) in interior, f'nodo {i} fuera'
                    px[x + dx, y + dy] = NODO
            px[x, y] = NODO_LUZ
    return im, pix_conexion


def cerebro():
    im, pix = domo()
    out = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
    out.alpha_composite(im, (DOMO_X, DOMO_Y))
    px = out.load()
    # cables: salen de la base y llegan a las orillas; contorno arriba, hilo de luz, funda y contorno abajo
    cable_izq, cable_der = [], []
    tramos = ((range(0, DOMO_X + 2), cable_izq), (range(DOMO_X + 30, 48), cable_der))
    for xs, lista in tramos:
        for x in xs:
            if not px[x, 44][3]:
                px[x, 44] = CABLE_ORILLA
            px[x, 45] = CABLE_LUZ
            px[x, 46] = CABLE
            px[x, 47] = CABLE_ORILLA
            lista.append((x, 45))
    red = {
        'lienzo': [48, 48],
        'nota': 'px del PNG CEREBRO_DOME (48x48). Nodo 0 = núcleo 3x3 centrado en (x,y); los demás son 2x2 con '
                'esquina arriba-izquierda en (x,y). Cada conexión lista sus píxeles en orden de a hacia b. Los cables '
                'van de la base hacia afuera.',
        'colores': {
            'interior': hexa(INTERIOR), 'conexion': hexa(CONEXION), 'pulso_sugerido': hexa(PULSO),
            'nodo': hexa(NODO), 'nodo_luz': hexa(NODO_LUZ), 'nucleo': hexa(NUCLEO), 'nucleo_luz': hexa(NUCLEO_LUZ),
            'cable_luz': hexa(CABLE_LUZ), 'cable': hexa(CABLE),
        },
        'nodos': [[x + DOMO_X, y + DOMO_Y] for x, y in NODOS],
        'conexiones': [
            {'a': a, 'b': b, 'px': [[x + DOMO_X, y + DOMO_Y] for x, y in pts]} for (a, b), pts in pix.items()
        ],
        'cables': {'izquierdo': [list(p) for p in reversed(cable_izq)], 'derecho': [list(p) for p in cable_der]},
    }
    texto = json.dumps(red, ensure_ascii=False, indent=1)
    (AQUI / 'red.json').write_text(texto + '\n', encoding='utf-8', newline='\n')
    return out


# ── Consola de resumen ────────────────────────────────────────────────────────────────────────────────────────
CONSOLA_PANTALLA = (7, 4, 24, 12)  # x0, y0, x1, y1 (inclusive) en el PNG de 32x32


def consola():
    im = limpiar(abrir('consola_2.png'))
    px = im.load()
    x0, y0, x1, y1 = CONSOLA_PANTALLA
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = PANTALLA
    for x in range(x0 + 1, x0 + 8):          # título
        px[x, y0 + 1] = CIAN
    px[x1 - 1, y0 + 1] = VERDE                # luz de "al día"
    for fila, largo in ((3, 13), (5, 9), (7, 11)):
        px[x0 + 1, y0 + fila] = AMBAR         # viñeta (pendiente)
        for x in range(x0 + 3, x0 + 3 + largo):
            px[x, y0 + fila] = TEXTO
    return im


# ── Impresoras ────────────────────────────────────────────────────────────────────────────────────────────────
PAPEL_SUELO = (11, 16, 20, 19)  # x0, y0, x1, y1 de la hoja en CEREBRO_PRINTER (ya bajada al piso)


def impresora(con_papel=True):
    im = al_piso(limpiar(abrir('impresora_2.png')), 31)
    if con_papel:
        return im
    px = im.load()
    x0, y0, x1, y1 = PAPEL_SUELO
    for y in range(y0, y1 + 1):
        for x in range(x0 - 1, x1 + 2):
            r, g, b, a = px[x, y]
            if a and min(r, g, b) >= 190:
                k = y - y0  # 0 = ranura, 1 = frente gris, 2-3 = tapa oscura del gabinete
                px[x, y] = rgb('#313331') if k == 0 else rgb('#a3a4a1') if k == 1 else rgb('#5c616a')
    return im


def impresora_mesa(con_papel=True):
    im = limpiar(abrir('impresora_1.png')).crop((2, 2, 18, 18))
    if not con_papel:
        px = im.load()
        for y in range(0, 4):          # filas 2-5 del original: la hoja que sale por arriba
            for x in range(16):
                px[x, y] = (0, 0, 0, 0)
        for x in range(16):            # fila 6 del original: ranura oscura
            if px[x, 4][3]:
                px[x, 4] = CABLE_ORILLA
    return al_piso(im, 15)


# ── Lista ─────────────────────────────────────────────────────────────────────────────────────────────────────
MESA = dict(category='electronics', canPlaceOnSurfaces=True)
SUELO = dict(category='electronics', backgroundTiles=1)


def piezas():
    return [
        ('CEREBRO_DOME', 'Cerebro central (domo)', cerebro(), 3, 3, dict(category='electronics', backgroundTiles=2)),
        ('CEREBRO_CONSOLE', 'Consola de resumen', consola(), 2, 2, SUELO),
        ('CEREBRO_PRINTER', 'Impresora de reportes', impresora(), 2, 2, SUELO),
        ('CEREBRO_PRINTER_EMPTY', 'Impresora de reportes (sin papel)', impresora(False), 2, 2, SUELO),
        ('CEREBRO_PRINTER_DESK', 'Impresora de mesa', impresora_mesa(), 1, 1, MESA),
        ('CEREBRO_PRINTER_DESK_EMPTY', 'Impresora de mesa (sin papel)', impresora_mesa(False), 1, 1, MESA),
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
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
