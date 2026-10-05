# Vitrina de Proto Man (2×2 = 32×32), dibujada por código. La de PixelLab (originales/vitrina_proto.png) traía un
# casco que parecía de Samus. Referencia (wikis de Mega Man): casco rojo con una cresta blanca que apunta hacia
# arriba, orejeras blancas con un punto verde, visor negro; bufanda amarilla.
# Uso: python arte/pixellab/lightlabs/vitrina_proto.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import contorno, guardar  # noqa: E402

METAL, METAL_LUZ, METAL_OSC = (150, 156, 168, 255), (196, 202, 212, 255), (98, 104, 118, 255)
VIDRIO, BRILLO = (168, 214, 238, 150), (236, 248, 255, 200)
ROJO, ROJO_LUZ, ROJO_OSC = (220, 36, 40, 255), (255, 110, 100, 255), (150, 20, 30, 255)
BLANCO, VERDE, NEGRO = (244, 244, 244, 255), (60, 200, 80, 255), (24, 24, 30, 255)
AMARILLO, AMARILLO_OSC = (252, 204, 40, 255), (200, 146, 20, 255)


def casco():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((9, 8, 22, 21), fill=ROJO)  # domo
    d.rectangle((9, 15, 22, 19), fill=ROJO)
    d.arc((9, 8, 22, 21), 200, 260, fill=ROJO_LUZ)
    d.line((19, 10, 21, 13), fill=ROJO_OSC)
    d.polygon([(15, 6), (16, 6), (18, 13), (13, 13)], fill=BLANCO)  # cresta blanca: pico que sube por la frente
    d.rectangle((11, 14, 20, 16), fill=NEGRO)  # visor negro
    d.rectangle((12, 17, 19, 19), fill=(44, 44, 54, 255))  # hueco de la cara
    for ox in (9, 22):  # orejeras blancas chicas con punto verde
        d.rectangle((ox - 1, 16, ox + 1, 18), fill=BLANCO)
        d.point((ox, 17), fill=VERDE)
    return contorno(im)


def bufanda():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((10, 20, 21, 21), fill=AMARILLO)  # alrededor del pedestal
    d.line((10, 21, 21, 21), fill=AMARILLO_OSC)
    d.polygon([(19, 21), (22, 21), (24, 25), (22, 26), (20, 23)], fill=AMARILLO)  # punta que cuelga
    d.line((22, 22, 23, 25), fill=AMARILLO_OSC)
    return contorno(im)


def vitrina_vacia():
    """Marco, vidrio y pedestal (lo usa cabezas.py para poner la cabeza de Proto Man)."""
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((5, 5, 26, 25), fill=VIDRIO)  # vidrio
    d.line((7, 12, 11, 7), fill=BRILLO)
    d.line((7, 15, 13, 8), fill=BRILLO)
    d.rectangle((12, 22, 19, 25), fill=METAL_OSC)  # pedestal
    d.rectangle((3, 2, 28, 4), fill=METAL)  # tapa
    d.line((3, 2, 28, 2), fill=METAL_LUZ)
    d.rectangle((3, 5, 4, 25), fill=METAL)  # postes
    d.rectangle((27, 5, 28, 25), fill=METAL_OSC)
    d.rectangle((2, 26, 29, 29), fill=METAL)  # base
    d.line((2, 26, 29, 26), fill=METAL_LUZ)
    d.line((2, 29, 29, 29), fill=METAL_OSC)
    return contorno(im)


if __name__ == '__main__':  # versión vieja (casco vacío); la actual la arma cabezas.py
    im = vitrina_vacia()
    im.alpha_composite(casco())
    im.alpha_composite(bufanda())
    guardar('PROTO_CASE', 'Vitrina de Proto Man', im, 2, 2, backgroundTiles=1)
