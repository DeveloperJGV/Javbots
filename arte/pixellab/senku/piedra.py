# Estatuas petrificadas estilo Dr. Stone: piedra gris, pocos tonos y grietas oscuras.
# Helpers propios del Laboratorio de Senku (los comunes viven en ../muebles.py, que no se toca).
import random

from PIL import Image

from muebles import a_piedra

GRIETA = (58, 58, 56, 255)
NIVELES = 6  # tonos de gris que se quedan (PixelLab da 30-60 colores)


def alinear_abajo(im):
    """Baja la figura para que toque la orilla de abajo (todas las estatuas quedan a la misma altura)."""
    _, _, _, y1 = im.getbbox()
    if y1 == im.height:
        return im
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (0, im.height - y1))
    return out


def posterizar(im, niveles=NIVELES):
    """Junta los grises parecidos en pocos tonos (manchas limpias en vez de ruido)."""
    out = im.copy()
    px = out.load()
    vals = sorted({px[x, y][0] for y in range(out.height) for x in range(out.width) if px[x, y][3]})
    lo, hi = vals[0], vals[-1]
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                k = round((r - lo) / max(1, hi - lo) * (niveles - 1))
                f = lo + (hi - lo) * k / (niveles - 1)
                escala = f / max(1, r)
                px[x, y] = (min(255, round(r * escala)), min(255, round(g * escala)), min(255, round(b * escala)), a)
    return out


def _es_cuerpo(px, x, y, w, h):
    """Pixel opaco, no contorno y con vecinos opacos (para que la grieta no se salga de la figura)."""
    if not (0 < x < w - 1 and 0 < y < h - 1):
        return False
    if px[x, y][3] == 0 or px[x, y][0] < 70:
        return False
    return all(px[a, b][3] for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))


def grietas(im, semilla, cuantas=3, largo=6, hasta=0.6):
    """Dibuja grietas que bajan en zigzag desde la parte de arriba de la figura (cara y pecho)."""
    out = im.copy()
    px = out.load()
    w, h = out.size
    x0, y0, x1, y1 = out.getbbox()
    rnd = random.Random(semilla)
    limite = y0 + int((y1 - y0) * hasta)
    candidatos = [(x, y) for y in range(y0, limite) for x in range(x0, x1) if _es_cuerpo(px, x, y, w, h)]
    for _ in range(cuantas):
        if not candidatos:
            break
        x, y = rnd.choice(candidatos)
        dx = rnd.choice((-1, 1))
        for paso in range(largo):
            if not _es_cuerpo(px, x, y, w, h) and paso:
                break
            px[x, y] = GRIETA
            if rnd.random() < 0.3:
                dx = -dx
            x, y = x + (dx if rnd.random() < 0.6 else 0), y + 1
    return out


def estatua(im, semilla, cuantas=3):
    return grietas(posterizar(a_piedra(alinear_abajo(im))), semilla, cuantas)
