# Sala de música (tienda de discos retro): muebles del ESCENARIO.
#
#   originales/guitarra_e_4.png  create_image_pixen 32x32, view=side (v4 de 4) -> recorte a 16x32
#   originales/guitarra_a_2.png  create_image_pixen 32x32, view=side (v2 de 4) -> recorte a 16x32
#   originales/bocina_1.png      create_image_pixen 32x32 (solo referencia: salió de 22 px de ancho, no cabe en 1x2)
#                                -> la bocina se dibuja por código con colores exactos en bandas (para latir)
#   originales/bateria_2.png     create_image_pixen 32x32, view=side (v2 de 4)
#   originales/piano_2.png       create_image_pixen 32x32, view=side (v2 de 4)
#   originales/micro_4.png       create_image_pixen 32x32, view=side (v4 de 4) -> recorte a 16x32
#   originales/dj_4.png          create_image_pixen 48x32, view=side (v4 de 4) -> bajada al piso y mezcladora a la derecha
#   originales/tele_3.png        create_image_pixen 32x32, view=side (v3 de 4) -> pantalla lisa por código
#
# Uso:  python arte/pixellab/musica/escenario/armar.py
# Escribe en webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png.
# No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[3]
sys.path.insert(0, str(AQUI.parents[1]))
from muebles import abrir as _abrir, guardar, recortar_ancho  # noqa: E402

TOCADISCOS = RAIZ / 'features' / 'musica' / 'assets' / 'furniture' / 'TURNTABLE' / 'TURNTABLE.png'


def abrir(nombre):
    return _abrir(AQUI, nombre)


def sin_sueltos(im, minimo=4):
    """Borra grupos de píxeles (vecindad 8) de menos de `minimo` píxeles: motas sueltas que deja PixelLab."""
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
    """Junta colores casi iguales (PixelLab da 2-3 tonos que no se distinguen) en el más usado."""
    px = im.load()
    cuenta = {}
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                cuenta[px[x, y]] = cuenta.get(px[x, y], 0) + 1
    base = []
    mapa = {}
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


def limpiar(im):
    return unir_parecidos(sin_sueltos(im))


def al_piso(im):
    """Baja lo dibujado para que las patas toquen la última fila del lienzo."""
    _, _, _, y1 = im.getbbox()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (0, im.height - y1))
    return out


# ── Bocina (por código) ──────────────────────────────────────────
# Colores EXACTOS de los conos, en bandas de afuera hacia adentro. El latido se hace después por código
# ('pulse' cambiando estos colores por otros más claros, o 'cycle' rotándolos para que las ondas salgan).
CONO_ARO = (118, 116, 128)  # orilla (suspensión) de cada cono
CONO_1 = (46, 44, 54)       # banda exterior
CONO_2 = (64, 62, 74)       # banda media
CONO_3 = (84, 82, 96)       # banda interior (solo el woofer)
CONO_TAPA = (152, 150, 164)  # tapa del centro
CAJA_CONTORNO = (22, 18, 26)
CAJA = (32, 30, 38)
CAJA_LUZ = (52, 50, 60)
CAJA_SOMBRA = (26, 24, 30)
TORNILLO = (150, 146, 140)


def bocina():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = im.load()
    x0, x1, y0, y1 = 1, 14, 2, 31
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            orilla = x in (x0, x1) or y in (y0, y1)
            if orilla:
                px[x, y] = CAJA_CONTORNO + (255,)
            elif x == x0 + 1 or y == y0 + 1:
                px[x, y] = CAJA_LUZ + (255,)
            elif x == x1 - 1 or y == y1 - 1:
                px[x, y] = CAJA_SOMBRA + (255,)
            else:
                px[x, y] = CAJA + (255,)
    # zoclo: una franja más oscura abajo
    for x in range(x0 + 1, x1):
        px[x, y1 - 2] = CAJA_SOMBRA + (255,)

    def cono(cx, cy, bandas):
        """bandas: [(radio, color), ...] de adentro hacia afuera."""
        for y in range(y0 + 1, y1):
            for x in range(x0 + 1, x1):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                for r, c in bandas:
                    if d <= r:
                        px[x, y] = c + (255,)
                        break

    cono(7.5, 8.5, [(0.8, CONO_TAPA), (1.9, CONO_2), (2.9, CONO_1), (3.9, CONO_ARO)])
    cono(7.5, 21.0, [(1.3, CONO_TAPA), (2.4, CONO_3), (3.4, CONO_2), (4.4, CONO_1), (5.4, CONO_ARO)])
    for x, y in ((x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x0 + 2, y1 - 3), (x1 - 2, y1 - 3)):
        px[x, y] = TORNILLO + (255,)
    return im


# ── Cabina de DJ: bajarla al piso y cambiar la mezcladora de lugar ─
# El tocadiscos (32x32) va encima en los 2 cuadros de la izquierda; la mezcladora queda en el de la derecha.
# La mezcladora del original (en el centro, 21 px) quedaba tapada por el tocadiscos: se borra y se dibuja una
# compacta por código (al comprimir la original se perdían las perillas).
BORRAR = (12, 6, 37, 14)  # mezcladora original y su base negra (x0, y0, x1, y1), se repinta de cubierta
COL_CUBIERTA = 6          # columna del original que solo tiene cubierta: se copia en lo borrado
MEZCLADORA = [
    '.AAAAAAAAAA.',
    'AEEEEEEEEEEA',
    'AEKEPEEKEPEA',
    'AEEEEEEEEEEA',
    'AELWLEELLWEA',
    'AMMMMMMMMMMA',
    'AAAAAAAAAAAA',
]
MEZCLA_COLORES = {'A': (0, 1, 4), 'E': (88, 92, 96), 'K': (21, 211, 217), 'P': (255, 128, 190),
                  'L': (37, 38, 44), 'W': (251, 210, 235), 'M': (20, 21, 28)}
MEZCLA_POS = (34, 11)     # esquina de la mezcladora en el PNG final (ya en el piso); su base cae en la cubierta


def cabina_dj():
    src = abrir('dj_4.png')
    out = src.copy()
    spx, opx = src.load(), out.load()
    bx0, by0, bx1, by1 = BORRAR
    for x in range(bx0, bx1):
        for y in range(by0, by1):
            opx[x, y] = spx[COL_CUBIERTA, y] if spx[COL_CUBIERTA, y][3] else (0, 0, 0, 0)
    out = al_piso(limpiar(out))
    px = out.load()
    mx, my = MEZCLA_POS
    for dy, fila in enumerate(MEZCLADORA):
        for dx, ch in enumerate(fila):
            if ch != '.':
                px[mx + dx, my + dy] = MEZCLA_COLORES[ch] + (255,)
    return out


# ── Tele de karaoke: pantalla lisa ──────────────────────────────
PANTALLA = (5, 5, 17, 14)  # x, y, ancho, alto en el PNG final de 32x32
PANTALLA_COLOR = (18, 24, 34)


def tele():
    im = limpiar(abrir('tele_3.png'))
    x, y, w, h = PANTALLA
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            im.putpixel((xx, yy), PANTALLA_COLOR + (255,))
    return im


# ── Micrófono: 100 % por código (2026-11-02) ─
# El de PixelLab (cabeza de 12 px) se veía enorme junto a los personajes: cápsula de 6 px de ancho, tubo delgado
# y base redonda; ~24 px de alto, con los pies en la última fila.
MICROFONO = [
    '.....AAAA.......',
    '....AEFFDA......',
    '....AJJJJA......',
    '....AFFFDA......',
    '....AJJJJA......',
    '....AFFFDA......',
    '.....AJJA.......',
    '......AA........',
    '.....ADDA.......',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '......CA........',
    '.....ACDA.......',
    '...AEFFFDDA.....',
    '...AAAAAAAA.....',
]
MIC_COLORES = {'A': (44, 26, 34), 'C': (169, 172, 186), 'D': (112, 127, 151), 'E': (255, 255, 254),
               'F': (221, 223, 239), 'J': (52, 60, 79)}


def microfono():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = im.load()
    y0 = 32 - len(MICROFONO)
    for dy, fila in enumerate(MICROFONO):
        for dx, ch in enumerate(fila):
            if ch != '.':
                px[1 + dx, y0 + dy] = MIC_COLORES[ch] + (255,)
    return im


def piezas():
    return [
        ('WALL_GUITAR_ELECTRIC', 'Guitarra eléctrica', recortar_ancho(limpiar(abrir('guitarra_e_4.png')), 16), 1, 2,
         dict(category='wall', canPlaceOnWalls=True)),
        ('WALL_GUITAR_ACOUSTIC', 'Guitarra acústica', recortar_ancho(limpiar(abrir('guitarra_a_2.png')), 16), 1, 2,
         dict(category='wall', canPlaceOnWalls=True)),
        ('STAGE_SPEAKER', 'Bocina', bocina(), 1, 2, dict(backgroundTiles=1)),
        ('DRUM_KIT', 'Batería', al_piso(limpiar(abrir('bateria_2.png'))), 2, 2, dict(backgroundTiles=1)),
        ('UPRIGHT_PIANO', 'Piano vertical', al_piso(limpiar(abrir('piano_2.png'))), 2, 2, dict(backgroundTiles=1)),
        ('MIC_STAND', 'Micrófono', microfono(), 1, 2, dict(backgroundTiles=1)),
        ('DJ_BOOTH', 'Cabina de DJ', cabina_dj(), 3, 2, dict(backgroundTiles=1, isDesk=True)),
        ('KARAOKE_TV', 'Tele de karaoke', tele(), 2, 2, dict(backgroundTiles=1)),
    ]


# ── Vista previa x6 sobre piso de madera oscura ─────────────────
PISO_A = (58, 38, 28)
PISO_B = (50, 32, 24)
PISO_JUNTA = (36, 22, 17)
PARED = (54, 36, 48)
PARED_ZOCLO = (38, 24, 34)


def vista(lista, escala=6):
    cols, filas = 18, 5
    lienzo = Image.new('RGBA', (cols * 16, filas * 16), (0, 0, 0, 255))
    d = ImageDraw.Draw(lienzo)
    d.rectangle((0, 0, cols * 16 - 1, 32 - 1), fill=PARED)
    d.rectangle((0, 30, cols * 16 - 1, 31), fill=PARED_ZOCLO)
    for fy in range(2, filas):
        for fx in range(cols):
            x, y = fx * 16, fy * 16
            d.rectangle((x, y, x + 15, y + 15), fill=PISO_A if (fx + fy) % 2 else PISO_B)
            d.line((x, y + 7, x + 15, y + 7), fill=PISO_JUNTA)
            d.line((x, y + 15, x + 15, y + 15), fill=PISO_JUNTA)
            d.line((x + (0 if fy % 2 else 8), y, x + (0 if fy % 2 else 8), y + 7), fill=PISO_JUNTA)
    por_id = {p[0]: p[2] for p in lista}
    # pared (filas 0-1): guitarras
    lienzo.alpha_composite(por_id['WALL_GUITAR_ELECTRIC'], (16, 0))
    lienzo.alpha_composite(por_id['WALL_GUITAR_ACOUSTIC'], (48, 0))
    # piso: cada mueble apoyado con su fila de abajo en la fila 3 (los de 2 de alto ocupan 2-3)
    x = 0
    for id_ in ('STAGE_SPEAKER', 'DRUM_KIT', 'MIC_STAND', 'UPRIGHT_PIANO', 'KARAOKE_TV', 'DJ_BOOTH'):
        im = por_id[id_]
        x += 16
        lienzo.alpha_composite(im, (x, 64 - im.height + 0))
        if id_ == 'DJ_BOOTH':
            # tocadiscos encima, en los 2 cuadros de la izquierda (su fila de abajo = fila de atrás de la cabina)
            tt = Image.open(TOCADISCOS).convert('RGBA')
            lienzo.alpha_composite(tt, (x, 64 - im.height + 16 - tt.height))
        x += im.width
    # repetir la bocina a la derecha de la cabina para ver el par
    lienzo.alpha_composite(por_id['STAGE_SPEAKER'], (x, 64 - 32))
    lienzo.resize((lienzo.width * escala, lienzo.height * escala), Image.NEAREST).save(AQUI / 'vista_x6.png')
    print('vista', AQUI / 'vista_x6.png')


if __name__ == '__main__':
    lista = piezas()
    for id_, nombre, im, fw, fh, extra in lista:
        guardar(id_, nombre, im, fw, fh, **extra)
    vista(lista)
