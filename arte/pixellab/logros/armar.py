# "Juego de su vida": piezas de logros (LOGROS_*) desde los originales de PixelLab (lista en trabajos.txt) + lo que se
# dibuja por código: recoloreado plata/bronce, versiones "sin ganar" (apagadas), símbolos de las insignias y las casillas
# del tablero de rachas. Todo create_image_pixen, view=side, plantilla de muebles de frente (PIXELLAB.md §3); las
# variantes que no se usan se quedan en originales/ para comparar.
#
# Uso:  python arte/pixellab/logros/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y vista_x4.png. No gasta.
import colorsys
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def en_lienzo(im, w, h, abajo=0):
    """Lo dibujado, abajo al centro de un lienzo w x h (dejando `abajo` filas libres)."""
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - abajo - pieza.height))
    return out


def piso(nombre):
    im = abrir(nombre)
    return al_piso(im, im.height - 1)


# ── Recoloreado (oro → plata / bronce) y apagado ───────────────────────────────────────────────────────────────
PLATA = [rgb('#4a5263'), rgb('#6f7a8a'), rgb('#9aa4b2'), rgb('#c3cad4'), rgb('#e6eaef')]
BRONCE = [rgb('#5a2e18'), rgb('#8a4a24'), rgb('#b8703a'), rgb('#d9975a'), rgb('#f2c48e')]


def es_oro(c):
    r, g, b, a = c
    if not a:
        return False
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    # oro claro (poco saturado) o sombra de oro rojiza (muy saturada); la madera queda fuera (s < 0.5 y oscura)
    return (20 / 360 <= h <= 65 / 360 and s > 0.3 and v > 0.45) or (5 / 360 <= h <= 65 / 360 and s > 0.5 and v > 0.4)


def rampa(c, tonos, lmin, lmax):
    lum = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000
    t = 0 if lmax == lmin else (lum - lmin) / (lmax - lmin)
    i = min(len(tonos) - 1, max(0, round(t * (len(tonos) - 1))))
    return tonos[i][:3] + (c[3],)


def recolorear(im, tonos, regla=es_oro):
    out = im.copy()
    px = out.load()
    oro = [(x, y) for y in range(out.height) for x in range(out.width) if regla(px[x, y])]
    lums = [(px[x, y][0] * 299 + px[x, y][1] * 587 + px[x, y][2] * 114) / 1000 for x, y in oro]
    lmin, lmax = min(lums), max(lums)
    for x, y in oro:
        px[x, y] = rampa(px[x, y], tonos, lmin, lmax)
    return out


def apagar(im, brillo=0.75, tinte=(70, 74, 92)):
    """Versión "sin ganar": gris azulado oscuro, conserva las formas (se lee como hueco por llenar)."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                lum = (r * 299 + g * 587 + b * 114) / 1000 / 255
                px[x, y] = tuple(int(t * 0.5 + 200 * lum * brillo) for t in tinte) + (a,)
    return out


# ── Medallas ───────────────────────────────────────────────────────────────────────────────────────────────────
def medalla():
    """medalla_2 (20x20, 14x18 dibujado): se quitan 2 filas repetidas del listón para que quepa en 16 de alto."""
    im = abrir('medalla_2.png')
    filas = [y for y in range(im.height) if y not in (2, 3)]
    out = Image.new('RGBA', (im.width, len(filas)), (0, 0, 0, 0))
    for ny, y in enumerate(filas):
        out.paste(im.crop((0, y, im.width, y + 1)), (0, ny))
    return en_lienzo(out, 16, 16)


def es_oro_medalla(c):
    # el listón rojo también cae cerca del naranja: la medalla es oro solo si el verde no se hunde
    return es_oro(c) and c[1] > 0.45 * c[0]


# ── Insignias por tema ─────────────────────────────────────────────────────────────────────────────────────────
# Base: escudo insignia_2 (12x12 en 16x16). El centro azul se pasa al color del tema y el símbolo va encima.
TEMAS = {
    # id: (nombre, rampa del centro oscuro→claro, símbolo 5x5, color del símbolo)
    'GARDEN': ('jardín', [rgb('#1d3b24'), rgb('#2f5e36'), rgb('#4b8a4a')], [
        '...XX',
        '..XXX',
        '.XvX.',
        '.vX..',
        'X....',
    ], rgb('#b8f28a')),
    'OUTINGS': ('salidas', [rgb('#4a1830'), rgb('#7a2848'), rgb('#a8406a')], [
        '.X.X.',
        'XXXXX',
        'XXXXX',
        '.XXX.',
        '..X..',
    ], rgb('#ff8fb0')),
    'TASKS': ('tareas', [rgb('#1c2c55'), rgb('#2e4a86'), rgb('#4d6fbf')], [
        '....X',
        '...XX',
        'X.XX.',
        'XXX..',
        '.X...',
    ], rgb('#e8f4ff')),
    'MUSIC': ('música', [rgb('#2e1a4f'), rgb('#4a2d7c'), rgb('#6d4bb0')], [
        '..XX.',
        '..X.X',
        '..X..',
        'XXX..',
        'XX...',
    ], rgb('#ffe27a')),
}
SIMBOLO_X, SIMBOLO_Y = 5, 5  # esquina del símbolo dentro del escudo (lienzo de 16, escudo en y 2..13)


def es_centro(c):
    r, g, b, a = c
    return a and b > r + 20 and b > g + 10


def insignia(tema, ganada=True):
    _, tonos, simbolo, color = TEMAS[tema]
    im = recolorear(abrir('insignia_2.png'), tonos, regla=es_centro)
    px = im.load()
    for dy, fila in enumerate(simbolo):
        for dx, ch in enumerate(fila):
            if ch == 'X':
                px[SIMBOLO_X + dx, SIMBOLO_Y + dy] = color
            elif ch == 'v':  # vena de la hoja: color del centro
                px[SIMBOLO_X + dx, SIMBOLO_Y + dy] = tonos[1]
    return im if ganada else apagar(im)


BASE_INSIGNIA = rgb('#3a2a20')
BASE_INSIGNIA_CLARA = rgb('#5e4636')


def con_base(im):
    """Insignia de mesa: el escudo sube 2 px y abajo lleva una pata y una base de madera oscura."""
    out = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    out.alpha_composite(im, (0, 0))
    px = out.load()
    for x in range(5, 11):
        px[x, 15] = BASE_INSIGNIA
        px[x, 14] = BASE_INSIGNIA_CLARA if x in (6, 7, 8, 9) else BASE_INSIGNIA
    return out


# ── Tablero de rachas ──────────────────────────────────────────────────────────────────────────────────────────
GIS = rgb('#8fae8c')
LLAMA = [rgb('#c8341c'), rgb('#f07a1e'), rgb('#ffd34a')]  # rojo, naranja, amarillo
LLAMA_FORMA = [  # 4x4 por casilla (día ganado): r = rojo, n = naranja, a = amarillo
    '..r.',
    '.rn.',
    'rnar',
    '.nn.',
]
LLAMA_GRANDE = [  # 5x7 del encabezado
    '..r..',
    '..rr.',
    '.rnr.',
    'rnnar',
    'rnaar',
    'rnaar',
    '.rrr.',
]
TABLERO_ANCHO = 6  # columnas que se agregan repitiendo una del centro (el marco es liso a lo ancho)
CASILLA_X0, CASILLA_Y0 = 6, 13  # primera línea de gis de la cuadrícula (en el tablero ya ensanchado)
COLUMNAS, FILAS, PASO = 7, 2, 5  # 7 días x 2 semanas; casilla de 4x4 por dentro + línea de 1


def casilla(col, fila):
    """Rectángulo interior (x, y, ancho, alto) de la casilla col 0..6, fila 0..1 (día = fila*7 + col)."""
    return (CASILLA_X0 + 1 + col * PASO, CASILLA_Y0 + 1 + fila * PASO, PASO - 1, PASO - 1)


def dibujar(px, forma, x0, y0, colores):
    for dy, fila in enumerate(forma):
        for dx, ch in enumerate(fila):
            if ch in colores:
                px[x0 + dx, y0 + dy] = colores[ch]


def tablero(dias=0):
    im = abrir('tablero_1.png')
    # ensanchar: repetir la columna 20 (marco liso arriba y abajo) TABLERO_ANCHO veces, centrado en 48
    x0, _, x1, _ = im.getbbox()
    izq, der = im.crop((x0, 0, 21, im.height)), im.crop((21, 0, x1, im.height))
    col = im.crop((20, 0, 21, im.height))
    ancho = (x1 - x0) + TABLERO_ANCHO
    out = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    x = (48 - ancho) // 2
    out.alpha_composite(izq, (x, 0))
    x += izq.width
    for _ in range(TABLERO_ANCHO):
        out.alpha_composite(col, (x, 0))
        x += 1
    out.alpha_composite(der, (x, 0))
    px = out.load()
    # pizarrón liso (el original trae manchas de más claro y oscuro): todo el verde a un solo tono, con el gis
    verde = rgb('#3f6346')
    for yy in range(32):
        for xx in range(48):
            r, g, b, a = px[xx, yy]
            if a and g > r + 10 and g > b:
                px[xx, yy] = verde
    # encabezado: llama grande + raya de gis donde la página escribe el número de días
    dibujar(px, LLAMA_GRANDE, 7, 5, {'r': LLAMA[0], 'n': LLAMA[1], 'a': LLAMA[2]})
    for xx in range(14, 41):
        if xx % 2 == 0:
            px[xx, 11] = GIS
    # cuadrícula de gis
    ancho_rejilla = COLUMNAS * PASO + 1
    alto_rejilla = FILAS * PASO + 1
    for i in range(ancho_rejilla):
        for j in range(FILAS + 1):
            px[CASILLA_X0 + i, CASILLA_Y0 + j * PASO] = GIS
    for j in range(alto_rejilla):
        for i in range(COLUMNAS + 1):
            px[CASILLA_X0 + i * PASO, CASILLA_Y0 + j] = GIS
    for d in range(dias):
        cx, cy, _, _ = casilla(d % COLUMNAS, d // COLUMNAS)
        dibujar(px, LLAMA_FORMA, cx, cy, {'r': LLAMA[0], 'n': LLAMA[1], 'a': LLAMA[2]})
    return out


# ── Lista de piezas ────────────────────────────────────────────────────────────────────────────────────────────
MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)


def piezas():
    oro = medalla()
    copa = en_lienzo(abrir('copa_chica_2.png'), 16, 16)
    alta = piso('copa_alta_2.png')
    alta = en_lienzo(alta, 16, 32)
    alta_plata = recolorear(en_lienzo(abrir('copa_alta_1.png'), 16, 32), PLATA)
    lista = [
        ('LOGROS_MEDAL_GOLD', 'Medalla de oro', oro, 1, 1, MESA),
        ('LOGROS_MEDAL_SILVER', 'Medalla de plata', recolorear(oro, PLATA, es_oro_medalla), 1, 1, MESA),
        ('LOGROS_MEDAL_BRONZE', 'Medalla de bronce', recolorear(oro, BRONCE, es_oro_medalla), 1, 1, MESA),
        ('LOGROS_MEDAL_LOCKED', 'Medalla (sin ganar)', apagar(oro), 1, 1, MESA),
        ('LOGROS_CUP_SMALL', 'Copa chica de oro', copa, 1, 1, MESA),
        ('LOGROS_CUP_SMALL_SILVER', 'Copa chica de plata', recolorear(copa, PLATA), 1, 1, MESA),
        ('LOGROS_CUP_SMALL_BRONZE', 'Copa chica de bronce', recolorear(copa, BRONCE), 1, 1, MESA),
        ('LOGROS_CUP_TALL', 'Copa alta de oro', alta, 1, 2, dict(category='decor', backgroundTiles=1)),
        ('LOGROS_CUP_TALL_SILVER', 'Copa alta de plata', alta_plata, 1, 2, dict(category='decor', backgroundTiles=1)),
        ('LOGROS_CUP_GRAND', 'Copa de campeón', piso('copa_grande_2.png'), 2, 2,
         dict(category='decor', backgroundTiles=1)),
        ('LOGROS_WALL_CASE', 'Vitrina de logros de pared', abrir('vitrina_pared_1.png'), 2, 2, PARED),
        ('LOGROS_TROPHY_CABINET', 'Vitrina de trofeos', piso('vitrina_suelo_1.png'), 2, 3,
         dict(category='storage', backgroundTiles=2)),
    ]
    for tema, (nombre, *_r) in TEMAS.items():
        on, off = insignia(tema), insignia(tema, ganada=False)
        lista += [
            (f'LOGROS_BADGE_{tema}', f'Insignia de {nombre}', con_base(on), 1, 1, MESA),
            (f'LOGROS_BADGE_{tema}_OFF', f'Insignia de {nombre} (sin ganar)', con_base(off), 1, 1, MESA),
            (f'LOGROS_BADGE_{tema}_WALL', f'Insignia de {nombre} (pared)', on, 1, 1, PARED),
            (f'LOGROS_BADGE_{tema}_WALL_OFF', f'Insignia de {nombre} (pared, sin ganar)', off, 1, 1, PARED),
        ]
    lista += [
        ('LOGROS_STREAK_BOARD', 'Tablero de rachas', tablero(0), 3, 2, PARED),
        ('LOGROS_STREAK_BOARD_FULL', 'Tablero de rachas (14 días)', tablero(14), 3, 2, PARED),
    ]
    return lista


def main():
    hechas = []
    for id_, nombre, im, fw, fh, extra in piezas():
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    # hoja de escala x4: un agente (char_0, cuadro 0) a la izquierda y todas las piezas
    k = 4
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    agente = agente.crop((0, 0, 24, 44))
    filas = [[agente] + hechas[:12], [agente] + hechas[12:]]
    alto_fila = 48 * k + 16
    ancho = max(sum(i.width * k + 8 for i in f) for f in filas) + 8
    hoja = Image.new('RGBA', (ancho, alto_fila * len(filas)), (70, 70, 90, 255))
    for n, fila in enumerate(filas):
        x = 8
        base = (n + 1) * alto_fila - 8
        for i in fila:
            hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, base - i.height * k))
            x += i.width * k + 8
    hoja.save(AQUI / 'vista_x4.png')
    print(len(hechas), 'piezas; vista en', AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
