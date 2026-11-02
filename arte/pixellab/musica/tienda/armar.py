# Sala de música (tienda de discos retro, años 70-80): muebles de la parte "TIENDA".
#
#   originales/estante_c.png    create_image_pixen 32x32, view=side, seed 33 (de 4: a bien, b sin margen, d deforme)
#   originales/caja_b.png       create_image_pixen 32x32, view=side, seed 22 (las 4 salieron altas, ~28 px; se compacta
#                               por código quitando filas repetidas de tablas y de fundas)
#   originales/mostrador_a.png  create_image_pixen 48x32, view=side, seed 11 (contorno oscuro como el resto)
#   originales/casetes_b.png    create_image_pixen 32x32, view=side, seed 22 (los casetes se leen; llena el ancho)
#   originales/sillon_a.png     create_image_pixen 32x32, view=side, seed 11 (audífonos grandes en el brazo)
#   Neón DISCOS y portadas de pared: 100 % por código (aquí abajo).
#
# Uso:  python arte/pixellab/musica/tienda/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la hoja vista_x6.png. No gasta generaciones.
import colorsys
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
from muebles import guardar  # noqa: E402

CONTORNO = (40, 22, 20, 255)  # café muy oscuro: el negro puro se ve más duro que el resto de la oficina


def abrir(nombre):
    return Image.open(AQUI / 'originales' / f'{nombre}.png').convert('RGBA')


def vecinos(x, y):
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def es_orilla(px, w, h, x, y):
    return any(not (0 <= a < w and 0 <= b < h) or px[a, b][3] == 0 for a, b in vecinos(x, y))


def limpiar(im, tol=10):
    """Alfa a 0/255, sin píxeles sueltos, y junta colores casi iguales (PixelLab da varios tonos por 1-3 de diferencia)."""
    im = im.copy()
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and all(not (0 <= a < w and 0 <= b < h) or px[a, b][3] == 0 for a, b in vecinos(x, y)):
                px[x, y] = (0, 0, 0, 0)
    cuenta = {}
    for y in range(h):
        for x in range(w):
            if px[x, y][3]:
                cuenta[px[x, y]] = cuenta.get(px[x, y], 0) + 1
    paleta, mapa = [], {}
    for c, _ in sorted(cuenta.items(), key=lambda t: -t[1]):
        cerca = next((p for p in paleta if sum(abs(c[i] - p[i]) for i in range(3)) <= tol), None)
        if cerca is None:
            paleta.append(c)
            cerca = c
        mapa[c] = cerca
    for y in range(h):
        for x in range(w):
            if px[x, y][3]:
                px[x, y] = mapa[px[x, y]]
    return im


def contorno_calido(im, umbral=60):
    """La orilla casi negra pasa a CONTORNO (café oscuro)."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] and sum(p[:3]) < umbral and es_orilla(px, w, h, x, y):
                px[x, y] = CONTORNO
    return im


def agregar_contorno(im):
    """Contorno de 1 px alrededor de lo dibujado (para piezas que salieron sin él)."""
    out = im.copy()
    src, px = im.load(), out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if not src[x, y][3] and any(0 <= a < w and 0 <= b < h and src[a, b][3] for a, b in vecinos(x, y)):
                px[x, y] = CONTORNO
    return out


def colores(im):
    return len({im.getpixel((x, y)) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3]})


# ---------- Estante de discos ----------
def estante():
    return agregar_contorno(limpiar(abrir('estante_c')))


# ---------- Caja de discos (2x1) ----------
# Filas del original que se quedan: fundas (orilla, borde crema, 4 filas de color) y la caja (borde, tablas, franja
# oscura, jaladera, base). Quitar filas repetidas no deforma el pixel art; reducir sí.
FILAS_CAJA = [3, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 22, 26, 27, 29]
FUNDAS = 6  # las primeras 6 filas de FILAS_CAJA son las fundas: ahí se cambian los colores


def caja():
    src = limpiar(abrir('caja_b'))
    out = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    for i, fila in enumerate(FILAS_CAJA):
        out.paste(src.crop((0, fila, 32, fila + 1)), (0, i))
    return out


def girar_fundas(im, grados, sat=1.0):
    """Otra caja: gira el tono de las fundas (solo filas de fundas y solo colores claros: la madera se queda)."""
    out = im.copy()
    px = out.load()
    for y in range(FUNDAS):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a or (r * 299 + g * 587 + b * 114) / 1000 < 70:
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if ss * (1 - abs(2 * ll - 1)) < 0.25:  # crema y grises se quedan
                continue
            r2, g2, b2 = colorsys.hls_to_rgb((hh + grados / 360) % 1, ll, min(1, ss * sat))
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


# ---------- Mostrador, casetes, sillón ----------
def mostrador():
    # Sin caja registradora (es una oficina, no una tienda): la mitad derecha de la cubierta
    # (filas 0-16) es el espejo de la izquierda, que está limpia.
    im = contorno_calido(limpiar(abrir('mostrador_a')))
    px = im.load()
    for y in range(17):
        for x in range(24, im.width):
            px[x, y] = px[im.width - 1 - x, y]
    return im


def casetes():
    return contorno_calido(limpiar(abrir('casetes_b')))


def sillon():
    return contorno_calido(limpiar(abrir('sillon_a')))


# ---------- Neón DISCOS (3x1, pared, por código) ----------
NEON_TABLA, NEON_TABLA_LUZ = (30, 20, 40, 255), (44, 30, 58, 255)
NEON_ROSA, NEON_ROSA_BRILLO, NEON_ROSA_HALO = (255, 105, 200, 255), (255, 200, 240, 255), (120, 30, 95, 255)
NEON_CIAN, NEON_CIAN_HALO = (90, 235, 245, 255), (25, 95, 115, 255)


def neon():
    """Tabla oscura de esquinas redondas con un tubo cian en la orilla."""
    im = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 1, 47, 14], fill=CONTORNO)
    d.rectangle([1, 2, 46, 13], fill=NEON_TABLA)
    for x, y in ((0, 1), (47, 1), (0, 14), (47, 14)):  # esquinas redondas
        im.putpixel((x, y), (0, 0, 0, 0))
    d.rectangle([3, 3, 44, 12], outline=NEON_CIAN_HALO)  # resplandor del tubo hacia adentro
    d.rectangle([2, 2, 45, 13], outline=NEON_CIAN)
    for x, y in ((2, 2), (45, 2), (2, 13), (45, 13)):    # el tubo dobla en curva
        im.putpixel((x, y), NEON_TABLA)
    return im


# Letras de tubo de 5x7 (la I de 3), una línea de 1 px como los letreros de neón.
LETRAS = {
    'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    'I': ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
    'S': ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
    'C': ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
    'O': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
}


def neon_discos():
    im = neon()
    px = im.load()
    palabra = 'DISCOS'
    ancho = sum(len(LETRAS[c][0]) for c in palabra) + 2 * (len(palabra) - 1)
    x, y0 = (48 - ancho + 1) // 2, 4
    puntos = set()
    for c in palabra:
        for dy, fila in enumerate(LETRAS[c]):
            for dx, ch in enumerate(fila):
                if ch == 'X':
                    puntos.add((x + dx, y0 + dy))
        x += len(LETRAS[c][0]) + 2
    for x, y in puntos:  # resplandor solo debajo de cada trazo (sin rellenar entre letras)
        if (x, y + 1) not in puntos and px[x, y + 1] == NEON_TABLA:
            px[x, y + 1] = NEON_ROSA_HALO
    for x, y in puntos:
        px[x, y] = NEON_ROSA_BRILLO if (x, y - 1) not in puntos and (x, y + 1) in puntos else NEON_ROSA
    return im


# ---------- Portadas de pared (2x2, por código) ----------
def portada(dibujo):
    """Portada de 13x13: contorno, fondo y dibujo abstracto (sin texto ni logos)."""
    im = Image.new('RGBA', (13, 13), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 12, 12], fill=CONTORNO)
    dibujo(d)
    return im


def sol(d):  # atardecer: cielo naranja, franjas, medio sol amarillo
    d.rectangle([1, 1, 11, 11], fill=(240, 130, 50))
    for i, c in enumerate([(220, 70, 60), (190, 50, 80), (130, 40, 90)]):
        d.rectangle([1, 7 + i, 11, 7 + i], fill=c)
    d.rectangle([1, 10, 11, 11], fill=(70, 30, 70))
    d.pieslice([3, 3, 9, 9], 180, 360, fill=(255, 215, 90))


def ondas(d):  # ondas: fondo turquesa con círculos concéntricos rosas
    d.rectangle([1, 1, 11, 11], fill=(40, 150, 140))
    d.ellipse([2, 2, 10, 10], outline=(250, 120, 170))
    d.ellipse([4, 4, 8, 8], outline=(255, 220, 120))
    d.point((6, 6), fill=(250, 120, 170))


def rayo(d):  # morado con zigzag mostaza
    d.rectangle([1, 1, 11, 11], fill=(90, 50, 130))
    zig = [(1, 8), (3, 5), (5, 8), (7, 5), (9, 8), (11, 5)]
    d.line(zig, fill=(235, 180, 50))
    d.line([(a, b + 1) for a, b in zig], fill=(235, 180, 50))
    d.rectangle([1, 1, 11, 2], fill=(60, 30, 95))


def triangulos(d):  # crema con triángulos rojo y azul
    d.rectangle([1, 1, 11, 11], fill=(235, 220, 185))
    d.polygon([(1, 11), (6, 3), (11, 11)], fill=(210, 60, 55))
    d.polygon([(5, 11), (9, 5), (11, 8), (11, 11)], fill=(40, 90, 150))
    d.ellipse([8, 1, 10, 3], fill=(240, 150, 40))


def portadas():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    sombra = (0, 0, 0, 70)
    for (x, y), dib in zip(((2, 1), (17, 2), (3, 17), (17, 16)), (sol, ondas, rayo, triangulos)):
        capa = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        ImageDraw.Draw(capa).rectangle([x + 1, y + 1, x + 13, y + 13], fill=sombra)  # sombra dura de 1 px
        im.alpha_composite(capa)
        im.alpha_composite(portada(dib), (x, y))
    return im


# ---------- Vista previa x6 sobre piso de madera oscura ----------
def piso(w, h):
    im = Image.new('RGBA', (w, h), (58, 36, 26, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, 4):  # tablones de 4 px con juntas desfasadas
        d.line([(0, y), (w, y)], fill=(44, 27, 20))
        for x in range((y // 4 % 2) * 12, w, 24):
            d.line([(x, y), (x, y + 3)], fill=(44, 27, 20))
        d.line([(0, y + 1), (w, y + 1)], fill=(66, 42, 30))
    return im


def vista(muebles, salida, escala=6):
    pared = [m for m in muebles if m[2]]
    suelo = [m for m in muebles if not m[2]]
    w = max(sum(m[1].width + 8 for m in fila) + 8 for fila in (pared, suelo))
    h = 8 + 32 + 8 + max(m[1].height for m in suelo) + 8
    im = piso(w, h)
    ImageDraw.Draw(im).rectangle([0, 0, w, 47], fill=(70, 40, 60))  # franja de pared
    x = 8
    for _, m, _ in pared:
        im.alpha_composite(m, (x, 8 + 32 - m.height))
        x += m.width + 8
    x = 8
    for _, m, _ in suelo:
        im.alpha_composite(m, (x, 56))
        x += m.width + 8
    im.resize((w * escala, h * escala), Image.NEAREST).save(salida)


if __name__ == '__main__':
    base = caja()
    piezas = [
        ('RECORD_SHELF', 'Estante de discos', estante(), 2, 2, {'backgroundTiles': 1}),
        ('RECORD_CRATE', 'Caja de discos', base, 2, 1, {}),
        ('RECORD_CRATE_B', 'Caja de discos (turquesa)', girar_fundas(base, 150), 2, 1, {}),
        ('RECORD_CRATE_C', 'Caja de discos (azul)', girar_fundas(base, 200, 0.9), 2, 1, {}),
        ('RECORD_COUNTER', 'Mostrador', mostrador(), 3, 2, {'backgroundTiles': 1, 'isDesk': True}),
        ('CASSETTE_SHELF', 'Estante de casetes', casetes(), 2, 2, {'backgroundTiles': 1}),
        ('LISTENING_CHAIR', 'Sillón con audífonos', sillon(), 2, 2, {'backgroundTiles': 1}),
        ('NEON_DISCOS', 'Neón DISCOS', neon_discos(), 3, 1, {'category': 'wall', 'canPlaceOnWalls': True}),
        ('LP_WALL', 'Portadas de pared', portadas(), 2, 2, {'category': 'wall', 'canPlaceOnWalls': True}),
    ]
    for id_, nombre, im, fw, fh, extra in piezas:
        guardar(id_, nombre, im, fw, fh, **extra)
        print('   ', id_, 'colores', colores(im))
    vista([(p[0], p[2], p[5].get('canPlaceOnWalls', False)) for p in piezas], AQUI / 'vista_x6.png')
    print('vista', AQUI / 'vista_x6.png')
