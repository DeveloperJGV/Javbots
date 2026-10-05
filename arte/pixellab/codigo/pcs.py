# Computadoras nuevas (2026-10-05). Reemplazan los PNG del grupo PC
# (los del set original eran beige de los 90) con los MISMOS nombres y tamaños, así siguen prendiéndose solas:
#   PC_FRONT_OFF, PC_FRONT_ON_1..3 (código que se recorre), PC_SIDE, PC_BACK.
# Monitor negro delgado con código de colores, tira de luz, teclado mecánico de colores y mouse.
# La lucecita de espera de la apagada va en (12, 12), en el marco: ambientFurniture.ts → PC_FRONT_OFF led.
# Uso: python arte/pixellab/codigo/pcs.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import contorno  # noqa: E402

PC = Path(__file__).resolve().parents[3] / 'webview-ui' / 'public' / 'assets' / 'furniture' / 'PC'
MARCO, MARCO_LUZ, PIE = (30, 32, 40, 255), (64, 68, 82, 255), (90, 96, 110, 255)
FONDO, APAGADA, REFLEJO = (22, 24, 38, 255), (14, 15, 22, 255), (40, 44, 60, 255)
SINTAXIS = [(198, 120, 221, 255), (97, 175, 239, 255), (152, 195, 121, 255), (229, 192, 123, 255),
            (224, 108, 117, 255), (86, 182, 194, 255)]
# Renglones de "código": (sangría, largo, color) — se recorren hacia arriba en cada cuadro
RENGLONES = [(0, 6, 0), (1, 8, 1), (2, 5, 2), (2, 7, 3), (1, 4, 4), (0, 3, 0), (1, 9, 5), (2, 6, 2), (1, 5, 1)]
TECLAS = [(230, 70, 70, 255), (240, 170, 50, 255), (90, 200, 90, 255), (80, 150, 240, 255), (180, 100, 230, 255)]


def base(d):
    d.rectangle((1, 1, 14, 13), fill=MARCO)  # monitor
    d.line((1, 1, 14, 1), fill=MARCO_LUZ)
    d.rectangle((7, 14, 8, 15), fill=PIE)  # pie
    d.rectangle((5, 16, 10, 16), fill=PIE)
    d.rectangle((1, 18, 10, 21), fill=(36, 38, 46, 255))  # teclado
    for i, x in enumerate(range(2, 10, 2)):
        d.point((x, 19), fill=TECLAS[i % 5])
        d.point((x + 1, 20), fill=TECLAS[(i + 2) % 5])
    d.rectangle((12, 18, 14, 21), fill=(52, 54, 64, 255))  # mouse
    d.point((13, 19), fill=(80, 220, 255, 255))


def pc(cuadro=None):
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base(d)
    if cuadro is None:
        d.rectangle((2, 2, 13, 11), fill=APAGADA)
        d.line((2, 9, 5, 3), fill=REFLEJO)
    else:
        d.rectangle((2, 2, 13, 11), fill=FONDO)
        for fila in range(4):
            sangria, largo, color = RENGLONES[(fila + cuadro) % len(RENGLONES)]
            y = 3 + fila * 2
            d.line((3 + sangria, y, min(12, 3 + sangria + largo), y), fill=SINTAXIS[color])
        d.point((12, 10), fill=(240, 240, 240, 255) if cuadro != 1 else FONDO)  # cursor
    out = contorno(im)
    return out


def lado():
    """Monitor visto en ángulo (de canto era una rayita y parecía poste)."""
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(4, 3), (12, 1), (12, 13), (4, 12)], fill=MARCO)  # monitor girado
    d.polygon([(5, 4), (11, 3), (11, 11), (5, 11)], fill=FONDO)  # pantalla
    for k, y in enumerate((5, 7, 9)):
        d.line((6, y, 6 + (4 - k), y - 1), fill=SINTAXIS[k + 1])
    d.rectangle((8, 13, 9, 15), fill=PIE)
    d.rectangle((5, 16, 12, 16), fill=PIE)
    d.rectangle((3, 19, 13, 21), fill=(36, 38, 46, 255))  # teclado
    for i, x in enumerate(range(4, 13, 2)):
        d.point((x, 20), fill=TECLAS[i % 5])
    return contorno(im)


def espalda():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 1, 14, 13), fill=(44, 46, 56, 255))
    d.rectangle((5, 4, 10, 9), fill=(54, 56, 68, 255))  # tapa trasera
    d.line((2, 12, 13, 12), fill=(110, 60, 200, 255))  # tira de luz
    d.rectangle((7, 14, 8, 15), fill=PIE)
    d.rectangle((5, 16, 10, 16), fill=PIE)
    return contorno(im)


piezas = {'PC_FRONT_OFF': pc(), 'PC_FRONT_ON_1': pc(0), 'PC_FRONT_ON_2': pc(1), 'PC_FRONT_ON_3': pc(2),
          'PC_SIDE': lado(), 'PC_BACK': espalda()}
for nombre, im in piezas.items():
    im.save(PC / f'{nombre}.png')
    print('ok', nombre)
hoja = Image.new('RGBA', (len(piezas) * 20, 32), (150, 156, 170, 255))
for i, im in enumerate(piezas.values()):
    hoja.alpha_composite(im, (i * 20, 0))
hoja.resize((hoja.width * 8, 256), Image.NEAREST).save(Path(__file__).resolve().parent / 'pcs_x8.png')
