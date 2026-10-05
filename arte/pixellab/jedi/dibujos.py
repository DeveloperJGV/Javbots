# Piezas y retoques del Archivo Jedi hechos por código (sin PixelLab). Se importa desde armar.py.
#   - sables de luz (formas simples: empuñadura gris + hoja brillante con núcleo claro)
#   - droide astromecánico propio (domo cobre, cuerpo crema con paneles verde azulado; NO es R2-D2)
#   - holograma de galaxia semitransparente para la mesa holográfica
#   - utilidades: contorno, angostar (quitar columnas centrales), volver translúcido
import math
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import CONTORNO  # noqa: E402

VACIO = (0, 0, 0, 0)


# ── Utilidades ───────────────────────────────────────────────────
def contorno(im, color=CONTORNO):
    """Todo pixel lleno que toca un vacío (o la orilla) se vuelve contorno (como casco.py)."""
    out = im.copy()
    px, src = out.load(), im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                vec = ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if any(not (0 <= a < w and 0 <= b < h) or src[a, b][3] == 0 for a, b in vec):
                    px[x, y] = color
    return out


def cerrar_orillas(im, color=CONTORNO):
    """Tras recortar, lo que quedó tocando la orilla izquierda/derecha se vuelve contorno."""
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in (0, im.width - 1):
            if px[x, y][3]:
                px[x, y] = color
    return out


def angostar(im, x0, n):
    """Quita n columnas desde x0 (en objetos simétricos de piedra se nota menos que recortar la orilla)."""
    out = Image.new('RGBA', (im.width - n, im.height), VACIO)
    out.paste(im.crop((0, 0, x0, im.height)), (0, 0))
    out.paste(im.crop((x0 + n, 0, im.width, im.height)), (x0, 0))
    return out


def centrar(im, ancho, alto=None):
    """Pone lo dibujado centrado a lo ancho y pegado abajo en un lienzo ancho×alto (sin reescalar)."""
    alto = alto or im.height
    x0, y0, x1, y1 = im.getbbox()
    pieza = im.crop((x0, y0, x1, y1))
    assert pieza.width <= ancho, f'no cabe: {pieza.width} > {ancho}'
    out = Image.new('RGBA', (ancho, alto), VACIO)
    out.alpha_composite(pieza, ((ancho - pieza.width) // 2, alto - pieza.height - (im.height - y1)))
    return out


def lum(p):
    return (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000 / 255


# ── Fantasmas: rampa azul de espíritu y alfa parcial ──────────────
ESPIRITU = [(25, 70, 190), (50, 135, 250), (95, 190, 255), (165, 230, 255), (230, 250, 255)]


def a_espiritu(im, alfa=180, alfa_borde=220, desvanecer=6):
    """Recolorea con una rampa azul brillante por luminosidad y baja el alfa (translúcido ~70%).
    Las últimas `desvanecer` filas se van borrando: el espíritu flota, sin pies."""
    out = im.copy()
    px = out.load()
    lums = [lum(px[x, y]) for y in range(im.height) for x in range(im.width) if px[x, y][3]]
    lo, hi = min(lums), max(lums)
    borde = contorno(im, (1, 1, 1, 255)).load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if not p[3]:
                continue
            t = (lum(p) - lo) / (hi - lo or 1)
            c = ESPIRITU[min(len(ESPIRITU) - 1, int(t * len(ESPIRITU)))]
            es_borde = borde[x, y] == (1, 1, 1, 255)
            a = alfa_borde if es_borde else alfa
            y1 = im.getbbox()[3]
            if y >= y1 - desvanecer:
                a = int(a * (y1 - y) / (desvanecer + 1))
            px[x, y] = (ESPIRITU[0] if es_borde else c) + (a,)
    return out


# ── Sables de luz ────────────────────────────────────────────────
HOJAS = {  # (núcleo, hoja, resplandor)
    'azul': ((235, 248, 255), (60, 150, 255), (60, 150, 255)),
    'verde': ((235, 255, 235), (70, 230, 90), (70, 230, 90)),
    'morado': ((250, 235, 255), (180, 90, 255), (180, 90, 255)),
    'amarillo': ((255, 255, 230), (255, 215, 60), (255, 215, 60)),
    'rojo': ((255, 235, 235), (240, 40, 50), (240, 40, 50)),
}
METAL = (170, 175, 185, 255)
METAL_LUZ = (215, 220, 228, 255)
METAL_SOMBRA = (95, 100, 112, 255)
GRIP = (40, 40, 48, 255)


def sable(im, x, y_punta, largo_hoja, color, largo_mango=7):
    """Sable vertical: hoja de 2 px (núcleo claro + orilla de color) con resplandor translúcido,
    guarda y empuñadura de 3 px con rayas de grip. x = columna izquierda de la hoja."""
    nucleo, hoja, glow = HOJAS[color]
    px = im.load()
    for yy in range(y_punta - 1, y_punta + largo_hoja):  # resplandor alrededor
        for xx in range(x - 1, x + 3):
            if not (0 <= xx < im.width and 0 <= yy < im.height):
                continue
            p = px[xx, yy]
            if p[3] == 0:
                px[xx, yy] = glow + (90,)
            elif p != CONTORNO:  # sobre el terciopelo: mezcla opaca 40% del color
                px[xx, yy] = tuple(int(p[i] * 0.6 + glow[i] * 0.4) for i in range(3)) + (255,)
    for yy in range(y_punta, y_punta + largo_hoja):
        px[x, yy] = nucleo + (255,)
        px[x + 1, yy] = hoja + (255,)
    px[x, y_punta] = hoja + (255,)  # punta redondeada
    y = y_punta + largo_hoja
    for xx in range(x - 1, x + 3):  # guarda
        px[xx, y] = METAL_SOMBRA
    for k in range(1, largo_mango):
        for xx, c in ((x - 1, METAL_LUZ), (x, METAL), (x + 1, METAL), (x + 2, METAL_SOMBRA)):
            px[xx, y + k] = c
        if k in (2, 4):
            px[x, y + k] = px[x + 1, y + k] = GRIP
    for xx in range(x - 1, x + 3):  # pomo
        px[xx, y + largo_mango] = METAL_SOMBRA


PIEDRA = (70, 66, 78, 255)
PIEDRA_LUZ = (98, 93, 108, 255)
PIEDRA_SOMBRA = (48, 45, 56, 255)
TERCIOPELO = (34, 30, 52, 255)
ORO = (200, 160, 70, 255)


def placa(w, h, x0, y0, x1, y1):
    """Placa de piedra oscura con marco y fondo de terciopelo, para colgar sables."""
    im = Image.new('RGBA', (w, h), VACIO)
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            marco = x in (x0, x1) or y in (y0, y1)
            borde2 = x in (x0 + 1, x1 - 1) or y in (y0 + 1, y1 - 1)
            if marco:
                px[x, y] = CONTORNO
            elif borde2:
                px[x, y] = PIEDRA_LUZ if (y == y0 + 1 or x == x0 + 1) else PIEDRA_SOMBRA
            elif x in (x0 + 2, x1 - 2) or y in (y0 + 2, y1 - 2):
                px[x, y] = PIEDRA
            else:
                px[x, y] = TERCIOPELO
    return im


def soporte(im, x, y):
    """Ganchito dorado que sostiene el sable (2 px a cada lado de la empuñadura)."""
    px = im.load()
    px[x - 2, y] = px[x + 3, y] = ORO


def estante_sables():
    """Pared 2×2 (32×32): azul, verde, morado y amarillo colgados en vertical."""
    im = placa(32, 32, 1, 1, 30, 30)
    for i, color in enumerate(['azul', 'verde', 'morado', 'amarillo']):
        x = 6 + i * 6
        sable(im, x, 5, 14, color)
        soporte(im, x, 20)
    return im


def vitrina_sable_rojo():
    """Pared 1×2 (16×32): el sable rojo solo, en vitrina aparte (trofeo del lado oscuro)."""
    im = placa(16, 32, 1, 1, 14, 30)
    px = im.load()
    for y in range(3, 29):  # fondo rojizo muy oscuro
        for x in range(3, 13):
            px[x, y] = (46, 20, 30, 255)
    sable(im, 7, 5, 14, 'rojo')
    soporte(im, 7, 20)
    return im


# ── Droide astromecánico (propio) ────────────────────────────────
COBRE = (200, 105, 50, 255)
COBRE_LUZ = (240, 160, 95, 255)
COBRE_SOMBRA = (140, 62, 32, 255)
CREMA = (238, 228, 200, 255)
CREMA_SOMBRA = (190, 178, 150, 255)
TEAL = (40, 150, 160, 255)
TEAL_OSCURO = (24, 96, 110, 255)
GRIS = (150, 155, 165, 255)
GRIS_OSCURO = (90, 95, 105, 255)
OJO = (16, 16, 24, 255)
OJO_BRILLO = (120, 200, 255, 255)
FOCO = (255, 70, 60, 255)


def droide():
    """16×32: el droide (14×20) parado abajo. Domo cobre con un ojo grande, cuerpo crema,
    paneles verde azulado y piernas laterales; contorno de un color como el resto."""
    W, H = 16, 21
    im = Image.new('RGBA', (W, H), VACIO)
    px = im.load()
    cx = 7.5
    for y in range(H):
        for x in range(W):
            c = None
            # domo: media elipse filas 0-6, columnas 2-13
            if y <= 6 and ((x - cx) / 6.0) ** 2 + ((y - 6.5) / 6.5) ** 2 <= 1.0 and 2 <= x <= 13:
                c = COBRE
                if (x < 6 and y < 4) or (x == 4 and y < 6):
                    c = COBRE_LUZ
                elif x >= 11:
                    c = COBRE_SOMBRA
            # anillo del cuello
            elif y == 7 and 2 <= x <= 13:
                c = GRIS_OSCURO if x >= 11 else GRIS
            # cuerpo: filas 8-17
            elif 8 <= y <= 17 and 2 <= x <= 13:
                c = CREMA_SOMBRA if x >= 11 else CREMA
            # piernas laterales: columnas 0-2 y 13-15, filas 9-18; pies filas 19-20
            elif 9 <= y <= 18 and (x <= 2 or x >= 13):
                c = TEAL_OSCURO if x in (0, 15) else CREMA_SOMBRA if x >= 13 else CREMA
            elif 19 <= y <= 20 and (x <= 3 or x >= 12):
                c = GRIS_OSCURO
            # pie central
            elif 18 <= y <= 20 and 5 <= x <= 10:
                c = GRIS_OSCURO if y == 20 else GRIS
            if c:
                px[x, y] = c
    # detalles
    for x, y in ((6, 3), (7, 3), (6, 4), (7, 4), (8, 3), (8, 4)):
        px[x, y] = OJO
    px[6, 3] = OJO_BRILLO
    px[10, 4] = FOCO
    px[5, 5] = px[9, 5] = COBRE_SOMBRA  # líneas del domo
    for y in range(10, 16):  # panel central
        for x in range(6, 10):
            px[x, y] = TEAL if y % 2 == 0 else TEAL_OSCURO
    for y in (9, 10):  # paneles chicos
        px[4, y] = px[11, y] = TEAL
    for x in range(4, 12):  # rejilla abajo
        px[x, 16] = GRIS if x % 2 else GRIS_OSCURO
    for y in (9, 10, 11):  # hombros de las piernas
        px[1, y] = px[14, y] = TEAL
    im = contorno(im)
    lienzo = Image.new('RGBA', (16, 32), VACIO)
    lienzo.alpha_composite(im, (0, 32 - H - 1))
    return lienzo


# ── Holograma de galaxia para la mesa ────────────────────────────
HOLO = [(40, 110, 220), (80, 170, 255), (150, 220, 255), (230, 250, 255)]


def holograma(mesa, y_corte=16, centro=(16, 8)):
    """Borra el disco que puso PixelLab sobre la mesa y dibuja una galaxia espiral azul translúcida
    (brazos con alfa parcial, núcleo claro) y un haz tenue que sube de la mesa."""
    im = mesa.copy()
    px = im.load()
    for y in range(y_corte):
        for x in range(im.width):
            px[x, y] = VACIO
    # haz de luz del proyector (cono tenue)
    for y in range(centro[1] + 3, y_corte + 1):
        medio = 2 + (y_corte - y) // 2
        for x in range(16 - medio, 16 + medio):
            if px[x, y][3] == 0:
                px[x, y] = HOLO[1] + (70,)
    cx, cy = centro
    for y in range(y_corte):  # disco tenue de la galaxia
        for x in range(im.width):
            if ((x - cx + 0.5) / 11.5) ** 2 + ((y - cy + 0.5) / 5.5) ** 2 <= 1 and px[x, y][3] < 100:
                px[x, y] = HOLO[0] + (75,)
    # galaxia: 2 brazos espirales en elipse aplastada (de frente se ve como disco inclinado)
    puntos = {}
    for brazo in (0, math.pi):
        for i in range(60):
            t = i / 59
            ang = brazo + t * 3.4
            r = 1.0 + t * 9.5
            x = cx + r * math.cos(ang)
            y = cy + r * math.sin(ang) * 0.45
            nivel = 2 if t < 0.35 else 1
            k = (int(round(x)), int(round(y)))
            puntos[k] = max(puntos.get(k, 0), nivel)
    for (x, y), nivel in puntos.items():
        if 0 <= x < im.width and 0 <= y < y_corte:
            px[x, y] = HOLO[nivel] + (225 if nivel == 2 else 200,)
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):  # resplandor
                a, b = x + dx, y + dy
                if 0 <= a < im.width and 0 <= b < y_corte and px[a, b][3] < 100:
                    px[a, b] = HOLO[1] + (130,)
    for x, y in ((cx, cy), (cx - 1, cy), (cx, cy - 1), (cx - 1, cy - 1)):  # núcleo
        px[x, y] = HOLO[3] + (240,)
    for x, y in ((6, 4), (25, 11), (9, 12), (23, 3), (12, 2)):  # estrellas sueltas
        if px[x, y][3] < 100:
            px[x, y] = HOLO[2] + (180,)
    return im
