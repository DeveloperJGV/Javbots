# Taller DeLorean (Fase 4): arma los muebles a partir de los originales de PixelLab.
#
#   originales/delorean.png     create_image_pixen 80x48, view=side (v2 de 3)
#   originales/condensador.png  create_image_pixen 32x32
#   originales/banco.png        create_image_pixen 32x32, view=side (v3 de 3)
#   originales/gabinete.png     create_image_pixen 32x32, view=side (v3 de 3)
#   originales/ae86.png         create_image_pixen 80x48, view=side (Initial D; letras de la puerta por código)
#   originales/armadura.png     create_image_pixen 32x48, view=side (Iron Man)
#   dibujos.py                  hoverboard, caja de plutonio, llantas y letrero de tofu, dibujados por código
#
# Uso:  python arte/pixellab/taller/armar.py
# Escribe en webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json). No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import dibujos  # noqa: E402
from muebles import guardar  # noqa: E402

# Borde azul/morado que PixelLab deja suelto alrededor del coche
HALO = {(56, 62, 176), (82, 68, 122)}

# Ventana del condensador (interior, coordenadas del PNG de 32x32)
VENTANA = (9, 9, 22, 17)
FONDO = (10, 22, 28, 255)
BRILLO = (75, 172, 221, 255)
NUCLEO = (254, 255, 255, 255)


def abrir(nombre):
    return Image.open(AQUI / 'originales' / nombre).convert('RGBA')


def quitar_halo(im):
    """Borra los pixeles del halo que tocan transparencia (repite hasta que no quede)."""
    w, h = im.size
    px = im.load()
    while True:
        borrar = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] and px[x, y][:3] in HALO:
                    vecinos = ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                    if any(not (0 <= a < w and 0 <= b < h) or px[a, b][3] == 0 for a, b in vecinos):
                        borrar.append((x, y))
        if not borrar:
            return im
        for x, y in borrar:
            px[x, y] = (0, 0, 0, 0)


def linea(px, a, b, color):
    (x0, y0), (x1, y1) = a, b
    pasos = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(pasos + 1):
        px[round(x0 + (x1 - x0) * i / pasos), round(y0 + (y1 - y0) * i / pasos)] = color


def dibujar_y(im):
    """Cambia la 'psi' que dibujó PixelLab por la Y del condensador de flujo."""
    px = im.load()
    x0, y0, x1, y1 = VENTANA
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = FONDO
    cx = (x0 + x1) // 2  # el tallo mide 2 px: cx y cx+1
    cy = y0 + 5
    trazos = [((x0 + 1, y0), (cx, cy)), ((x1 - 1, y0), (cx + 1, cy)), ((cx, cy), (cx, y1)), ((cx + 1, cy), (cx + 1, y1))]
    for dx in (-1, 1):  # resplandor a los lados de cada tubo
        for a, b in trazos:
            linea(px, (a[0] + dx, a[1]), (b[0] + dx, b[1]), BRILLO)
    for a, b in trazos:
        linea(px, a, b, NUCLEO)
    return im


guardar('DELOREAN', 'DeLorean', quitar_halo(abrir('delorean.png')), 5, 3, backgroundTiles=1)
guardar('FLUX_CAPACITOR', 'Condensador de flujo', dibujar_y(abrir('condensador.png')), 2, 2,
        category='wall', canPlaceOnWalls=True)
guardar('WORKBENCH', 'Banco de herramientas', abrir('banco.png'), 2, 2, backgroundTiles=1)
guardar('TOOL_CHEST', 'Gabinete de herramientas', abrir('gabinete.png'), 2, 2, backgroundTiles=1)
guardar('AE86', 'AE86 (Initial D)', dibujos.letras_puerta(abrir('ae86.png')), 5, 3, backgroundTiles=1)
guardar('IRON_ARMOR', 'Armadura en vitrina', abrir('armadura.png'), 2, 3, backgroundTiles=1)
guardar('HOVERBOARD', 'Hoverboard', dibujos.hoverboard(), 2, 1, category='wall', canPlaceOnWalls=True)
guardar('PLUTONIUM_CASE', 'Caja de plutonio', dibujos.plutonio(), 1, 1)
guardar('TIRES', 'Llantas apiladas', dibujos.llantas(), 1, 2, backgroundTiles=1)
guardar('TOFU_SIGN', 'Letrero de tofu', dibujos.letrero_tofu(), 2, 1, category='wall', canPlaceOnWalls=True)
