# Bodega: estanteria metalica con cajas (se le da clic para ver lo guardado).
#
#   originales/bodega_v4.png  create_image_pixen 32x32, view=side (v4 de 4)  -> STORAGE_SHELF
#   STORAGE_SHELF_EMPTY       por codigo: la misma estanteria con las repisas vacias (0 generaciones)
#
# Uso:  python arte/pixellab/bodega/armar.py
# Escribe webview-ui/public/assets/furniture/STORAGE_SHELF*/ (PNG + manifest.json) y vista_x6.png.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import guardar  # noqa: E402

FONDO = (0x39, 0x37, 0x56, 255)  # tablero de atras
ORILLA = (0x1c, 0x16, 0x36, 255)  # contorno oscuro
REPISA_LUZ = (0x6f, 0x7c, 0x86, 255)
REPISA = (0x52, 0x5c, 0x6e, 255)
SOMBRA = (0x2e, 0x2c, 0x48, 255)  # bajo cada repisa
REPISAS = (10, 19, 27)  # fila de luz de cada repisa (la de abajo es la siguiente)


def piso(w, h):
    """Piso de madera oscura para las vistas previas (igual al de la rockola)."""
    im = Image.new('RGBA', (w, h))
    px = im.load()
    tonos = [(58, 40, 30, 255), (64, 45, 33, 255), (54, 37, 28, 255)]
    for y in range(h):
        tabla = y // 4
        for x in range(w):
            if y % 4 == 3 or (x + tabla * 11) % 24 == 0:
                px[x, y] = (38, 26, 20, 255)
            else:
                px[x, y] = tonos[tabla % 3]
    return im


def vista(ims, salida, escala=6, sep=8):
    w = sep + sum(i.width + sep for i in ims)
    h = max(i.height for i in ims) + 2 * sep
    fondo = piso(w, h)
    x = sep
    for i in ims:
        fondo.alpha_composite(i, (x, sep))
        x += i.width + sep
    fondo.resize((w * escala, h * escala), Image.NEAREST).save(salida)
    print('vista', salida)


def abrir(nombre):
    return Image.open(AQUI / 'originales' / nombre).convert('RGBA')


def vacia(im):
    """Quita cajas, lampara y caja verde; deja postes, repisas y la tablilla de inventario."""
    im = im.copy()
    px = im.load()
    for y in range(0, 2):  # punta de la lampara
        for x in range(32):
            px[x, y] = (0, 0, 0, 0)
    for y in range(2, 29):
        # la tablilla cuelga sobre el poste derecho en las filas 7..15 (x >= 23)
        x_fin = 22 if 7 <= y <= 15 else 24
        for x in range(6, x_fin + 1):
            if y == 2:
                px[x, y] = ORILLA
            elif y in REPISAS:
                px[x, y] = REPISA_LUZ
            elif y - 1 in REPISAS:
                px[x, y] = REPISA
            elif y - 2 in REPISAS or y == 3:
                px[x, y] = SOMBRA
            else:
                px[x, y] = FONDO
    for y in range(2, 7):  # remate de arriba del poste derecho, igual que abajo
        px[25, y] = ORILLA
    px[25, 2] = ORILLA
    return im


if __name__ == '__main__':
    llena = abrir('bodega_v4.png')
    sin_nada = vacia(llena)
    guardar('STORAGE_SHELF', 'Bodega', llena, 2, 2, backgroundTiles=1)
    guardar('STORAGE_SHELF_EMPTY', 'Bodega vacía', sin_nada, 2, 2, backgroundTiles=1)
    vista([llena, sin_nada], AQUI / 'vista_x6.png')
