# Light Labs, segunda vuelta (2026-10-06): Proto Man, Rush y banco de laboratorio.
#   por código: LAB_STOOL (banco azul y blanco estilo Mega Man, asiento)
#   PROTO_CASE y RUSH: los de PixelLab (originales/vitrina_proto.png y rush.png) no se usan (casco tipo Samus, Rush
#   tipo zorro); ahora los dibujan vitrina_proto.py y rush.py.
# Uso: python arte/pixellab/lightlabs/armar_v2.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import contorno, guardar  # noqa: E402

AZUL, AZUL_OSC, CIAN = (0, 112, 236, 255), (0, 72, 168, 255), (0, 232, 216, 255)
BLANCO, CROMO, CROMO_OSC = (236, 240, 248, 255), (176, 184, 196, 255), (110, 118, 132, 255)


def banco():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((7, 8, 8, 12), fill=CROMO)  # poste
    d.line((8, 8, 8, 12), fill=CROMO_OSC)
    d.line((3, 13, 12, 13), fill=CROMO_OSC)  # patas
    d.point([(3, 14), (12, 14), (7, 14), (8, 14)], fill=CROMO_OSC)
    d.rectangle((3, 4, 12, 7), fill=BLANCO)  # asiento: orilla blanca
    d.rectangle((4, 4, 11, 6), fill=AZUL)  # cojín azul
    d.line((4, 7, 11, 7), fill=AZUL_OSC)
    d.line((5, 4, 8, 4), fill=CIAN)
    return contorno(im)


guardar('LAB_STOOL', 'Banco de laboratorio', banco(), 1, 1, category='chairs')
banco().resize((160, 160), Image.NEAREST).save(AQUI / 'banco_x10.png')
