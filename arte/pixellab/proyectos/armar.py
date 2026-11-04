# Cuarto de proyectos (PROYECTOS_*): tablero kanban, archivero, carpetas, sello, pantalla de avance y reloj.
# Originales de PixelLab en originales/ (lista en trabajos.txt; todo create_image_pixen, view=side, plantilla de muebles
# de frente de PIXELLAB.md §3). Lo plano (tablero, pantalla, carpetas, hoja sellada) va dibujado por código.
#
#   archivero_2.png  (32x32) archivero de madera con etiquetas de color -> se angosta a 16 px (1x2) quitando columnas
#   sello_1.png      (20x20) sello de goma rojo -> 1x1 tal cual (14x14 dibujado)
#   reloj_2.png      (20x20) reloj de pared redondo -> 1x1; la carátula se limpia y las manecillas van por código
#   Descartes: kanban_1 (pizarrón, llena el lienzo; se usó solo su paleta), kanban_2 (corcho), archivero_1 (metal, sin
#   etiquetas), carpetas_1 (parece hamburguesa), carpetas_2 (ilegible), pantalla_1 (tele vieja con reflejo).
#
# Zonas que la página repinta (px dentro del PNG): ver las constantes KANBAN_*, ARCHIVERO_ETIQUETAS, BARRA_*, RELOJ_*,
# HOJA_SELLO más abajo.
#
# Uso:  python arte/pixellab/proyectos/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) e vista_x4.png.
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


def rect(px, x0, y0, x1, y1, c):
    """Rellena de x0..x1, y0..y1 (incluidos)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def en_lienzo(im, w, h, abajo=0):
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - abajo - pieza.height))
    return out


ORILLA = rgb('#11172b')  # contorno (el mismo del pizarrón de PixelLab)
ALUMINIO = rgb('#b8bcc0')
ALUMINIO_OSCURO = rgb('#9b9ea6')
BLANCO = rgb('#ebeff2')
LINEA = rgb('#c8cdd4')

# ── Tablero kanban 4x2 (64x32) ─────────────────────────────────────────────────────────────────────────────────
# Tres columnas (por hacer / en curso / listo). Cada una: franja de color arriba (encabezado) y área libre de tarjetas.
KANBAN_COLUMNAS = [(4, 21), (23, 40), (42, 59)]  # x0..x1 incluidos (18 px de ancho cada una)
KANBAN_SEPARADORES = [22, 41]
KANBAN_ENCABEZADO_Y = (3, 5)  # franja de color de cada columna
KANBAN_TARJETAS_Y = (7, 25)  # área de tarjetas: 19 filas -> caben 4 tarjetas de 16x4 con 1 px entre ellas
KANBAN_ENCABEZADOS = [rgb('#8c96a8'), rgb('#e8b04a'), rgb('#6cbf6c')]
NOTAS = [rgb('#ffe68a'), rgb('#9fd3ff'), rgb('#ffb3c8'), rgb('#b9f0a8')]


def kanban(tarjetas=None):
    im = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    px = im.load()
    # tablero: contorno, marco de aluminio, superficie blanca
    rect(px, 1, 0, 62, 27, ORILLA)
    rect(px, 2, 1, 61, 26, ALUMINIO)
    rect(px, 2, 26, 61, 26, ALUMINIO_OSCURO)
    rect(px, 3, 2, 60, 25, BLANCO)
    for x in KANBAN_SEPARADORES:
        rect(px, x, 2, x, 25, LINEA)
    for (x0, x1), c in zip(KANBAN_COLUMNAS, KANBAN_ENCABEZADOS):
        rect(px, x0, KANBAN_ENCABEZADO_Y[0], x1, KANBAN_ENCABEZADO_Y[1], c)
    # bandeja de plumones
    rect(px, 4, 27, 59, 29, ORILLA)
    rect(px, 5, 27, 58, 28, ALUMINIO)
    rect(px, 5, 28, 58, 28, ALUMINIO_OSCURO)
    for x0, c in ((14, rgb('#d8453a')), (19, rgb('#3a6fd8')), (45, rgb('#2f9a4a'))):
        rect(px, x0, 27, x0 + 3, 27, c)
        px[x0, 27] = ORILLA
    # tarjetas de muestra (solo para la hoja de vista; el mueble va limpio)
    for col, n in enumerate(tarjetas or []):
        x0, x1 = KANBAN_COLUMNAS[col]
        for i in range(n):
            y = KANBAN_TARJETAS_Y[0] + i * 5
            c = NOTAS[(col + i) % len(NOTAS)]
            rect(px, x0 + 1, y, x1 - 1, y + 3, c)
            rect(px, x0 + 3, y + 1, x1 - 5, y + 1, tuple(int(v * 0.7) for v in c[:3]) + (255,))
    return im


# ── Archivero 1x2 ──────────────────────────────────────────────────────────────────────────────────────────────
# archivero_2 mide 22 px de ancho: se quitan 3 columnas de cada lado del centro (madera lisa) y queda de 16.
QUITAR_COLUMNAS = (9, 10, 11, 20, 21, 22)
# Etiquetas de los 3 cajones (x0, y0, x1, y1 incluidos, en el PNG final de 16x32): la página puede repintarlas.
ARCHIVERO_ETIQUETAS = [(6, 10, 9, 10), (6, 15, 9, 15), (6, 21, 9, 21)]
ETIQUETAS = [rgb('#d8453a'), rgb('#e8b04a'), rgb('#4a8ad8')]


def archivero():
    im = abrir('archivero_2.png')
    cols = [x for x in range(im.width) if x not in QUITAR_COLUMNAS]
    out = Image.new('RGBA', (len(cols), im.height), (0, 0, 0, 0))
    for nx, x in enumerate(cols):
        out.paste(im.crop((x, 0, x + 1, im.height)), (nx, 0))
    out = en_lienzo(al_piso(out, out.height - 1), 16, 32)
    px = out.load()
    for (x0, y0, x1, y1), c in zip(ARCHIVERO_ETIQUETAS, ETIQUETAS):
        rect(px, x0, y0, x1, y1, c)
    return out


# ── Carpetas apiladas 1x1 (por código) ─────────────────────────────────────────────────────────────────────────
CARPETAS = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....ooo........',
    '....oMMMoooooo..',
    '...oMMMMMMMMMMo.',
    '...ommmmmmmmmmo.',
    '..oowwwwwwwwwwo.',
    '..oBBBBBBBBBBBoo',
    '..obbbbbbbbbbbbo',
    '...owwwwwwwwwwwo',
    '.ooRRRRRRRRRRRo.',
    '.orrrrrrrrrrrro.',
    '.oooooooooooooo.',
]
COLORES_CARPETAS = {
    'o': rgb('#2a1e2a'), 'M': rgb('#f0cf86'), 'm': rgb('#d6a85c'), 'w': rgb('#f6f2e8'),
    'B': rgb('#5f8fe0'), 'b': rgb('#3e68b8'), 'R': rgb('#e06060'), 'r': rgb('#b23e48'),
}


def pintar(filas, colores):
    im = Image.new('RGBA', (len(filas[0]), len(filas)), (0, 0, 0, 0))
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch in colores:
                im.putpixel((x, y), colores[ch])
    return im


# ── Hoja sellada 1x1 (por código): marco rojo de sello vacío; la página escribe la palabra ──────────────────────
HOJA_SELLO = (3, 8, 12, 11)  # interior del sello (x0, y0, x1, y1): 10x4 px; "LISTO" en letras de 3 px no cabe (19 px)
ROJO_SELLO = rgb('#c8344a')


def hoja_sellada():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    rect(px, 0, 5, 15, 15, rgb('#2a1e2a'))
    rect(px, 1, 6, 14, 14, rgb('#f6f2e8'))
    rect(px, 1, 14, 14, 14, rgb('#d8d0c4'))
    # marco del sello (ligeramente torcido: la esquina derecha baja 1 px)
    for x in range(2, 14):
        px[x, 7 if x < 9 else 7] = ROJO_SELLO
        px[x, 12] = ROJO_SELLO
    for y in range(7, 13):
        px[2, y] = ROJO_SELLO
        px[13, y] = ROJO_SELLO
    return im


# ── Pantalla de avance 2x1 de pared (por código) ───────────────────────────────────────────────────────────────
PANTALLA = rgb('#162238')
BARRA_TITULO = (5, 4, 26, 6)  # renglón para el nombre del proyecto (x0, y0, x1, y1)
BARRA = (5, 9, 26, 11)  # barra: 22x3 px; la página llena de x0 a x0 + avance*22
BARRA_VACIA = rgb('#2c3c56')
BARRA_LLENA = rgb('#5fd38a')
BARRA_BRILLO = rgb('#a8f0c0')


def pantalla(avance=0.0):
    im = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    px = im.load()
    rect(px, 1, 1, 30, 14, ORILLA)
    rect(px, 2, 2, 29, 13, rgb('#3a4050'))
    rect(px, 2, 13, 29, 13, rgb('#2c313e'))
    rect(px, 3, 3, 28, 12, PANTALLA)
    x0, y0, x1, y1 = BARRA
    rect(px, x0, y0, x1, y1, BARRA_VACIA)
    lleno = round(avance * (x1 - x0 + 1))
    if lleno:
        rect(px, x0, y0, x0 + lleno - 1, y1, BARRA_LLENA)
        rect(px, x0, y0, x0 + lleno - 1, y0, BARRA_BRILLO)
    px[29, 12] = rgb('#5fd38a')  # foquito de encendido
    return im


# ── Reloj 1x1 de pared ─────────────────────────────────────────────────────────────────────────────────────────
RELOJ_CENTRO = (8, 8)  # pixel del eje de las manecillas
RELOJ_CARATULA = (7.5, 8, 17)  # carátula = pixeles con (x-7.5)^2 + (y-8)^2 <= 17 (x 4..11, y 4..12)
CARATULA = rgb('#fbf3dc')
MARCAS = rgb('#b09070')
MANECILLAS = rgb('#2a1a14')


def reloj(hora=None):
    im = abrir('reloj_2.png').crop((2, 2, 18, 18))
    px = im.load()
    fx, fy, r2 = RELOJ_CARATULA
    for y in range(16):
        for x in range(16):
            # dentro del bisel: todo lo que no sea madera pasa a carátula lisa (quita las marcas sueltas de PixelLab)
            r, g, b, _ = px[x, y]
            madera = r > 100 and r > 2 * g
            if (x - fx) ** 2 + (y - fy) ** 2 <= r2 or ((x - fx) ** 2 + (y - fy) ** 2 <= 25 and not madera):
                px[x, y] = CARATULA
    for x, y in ((7, 4), (8, 4), (11, 8), (7, 12), (8, 12), (4, 8)):
        px[x, y] = MARCAS
    if hora is not None:  # (dx, dy) de cada pixel de las manecillas respecto al eje
        cx, cy = RELOJ_CENTRO
        for dx, dy in hora:
            px[cx + dx, cy + dy] = MANECILLAS
        px[cx, cy] = MANECILLAS
    return im


LAS_TRES = [(1, 0), (2, 0), (0, -1), (0, -2), (0, -3)]  # horario a las 3, minutero a las 12


# ── Lista ──────────────────────────────────────────────────────────────────────────────────────────────────────
MESA = dict(category='decor', canPlaceOnSurfaces=True)
PARED = dict(category='wall', canPlaceOnWalls=True)


def piezas():
    return [
        ('PROYECTOS_KANBAN', 'Tablero kanban', kanban(), 4, 2, PARED),
        ('PROYECTOS_FILE_CABINET', 'Archivero de proyectos', archivero(), 1, 2,
         dict(category='storage', backgroundTiles=1)),
        ('PROYECTOS_FOLDERS', 'Carpetas apiladas', pintar(CARPETAS, COLORES_CARPETAS), 1, 1, MESA),
        ('PROYECTOS_STAMP', 'Sello de terminado', en_lienzo(abrir('sello_1.png'), 16, 16), 1, 1, MESA),
        ('PROYECTOS_STAMPED_SHEET', 'Hoja sellada', hoja_sellada(), 1, 1, MESA),
        ('PROYECTOS_PROGRESS_SCREEN', 'Pantalla de avance', pantalla(), 2, 1, PARED),
        ('PROYECTOS_CLOCK', 'Reloj de última vez', reloj(LAS_TRES), 1, 1, PARED),
        ('PROYECTOS_CLOCK_BLANK', 'Reloj de última vez (sin manecillas)', reloj(), 1, 1, PARED),
    ]


def hoja(imagenes, ruta, k=4):
    agente = Image.open(RAIZ / 'webview-ui' / 'public' / 'assets' / 'characters' / 'char_0.png').convert('RGBA')
    fila = [agente.crop((0, 0, 24, 44))] + imagenes
    alto = 48 * k + 16
    ancho = sum(i.width * k + 8 for i in fila) + 8
    out = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in fila:
        out.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    ruta.parent.mkdir(parents=True, exist_ok=True)
    out.save(ruta)
    print('hoja:', ruta)


def main():
    hechas = []
    for id_, nombre, im, fw, fh, extra in piezas():
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    # muestras de cómo se ve con datos (solo en la hoja): tablero con tarjetas y barra al 60 %
    hechas += [kanban([3, 2, 4]), pantalla(0.6)]
    hoja(hechas, AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
