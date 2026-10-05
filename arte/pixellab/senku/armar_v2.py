# Laboratorio de Senku, segunda vuelta (2026-10-06): mesa y asientos de la edad de piedra + cambiar lo genérico.
#   originales/mesa_tablones.png  create_image_pixen 32x32, view=side  -> SENKU_PLANK_TABLE (mesa, isDesk)
#   originales/tocon.png          create_image_pixen 16x16, view=side  -> SENKU_STUMP (asiento, category chairs)
#   por código: SENKU_BULB (foco hecho a mano en poste de bambú, alumbra de noche) y SENKU_TALLY (tabla de pared con
#   rayitas: Senku contó los días de su petrificación)
# Totoro de piedra: totoro_piedra.py
# Uso: python arte/pixellab/senku/armar_v2.py
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, contorno, guardar  # noqa: E402

BAMBU, BAMBU_OSC, NUDO = (176, 184, 96, 255), (128, 138, 64, 255), (96, 104, 48, 255)
VIDRIO, VIDRIO_LUZ = (198, 228, 236, 255), (240, 252, 255, 255)
FILAMENTO, BRILLO = (255, 176, 60, 255), (255, 230, 140, 255)
PIEDRA, PIEDRA_OSC = (132, 128, 116, 255), (96, 92, 84, 255)
MADERA, MADERA_OSC, MADERA_LUZ = (150, 104, 62, 255), (110, 74, 42, 255), (180, 132, 84, 255)
CUERDA, MARCA = (196, 170, 120, 255), (62, 40, 24, 255)


def foco():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((7, 13, 8, 28), fill=BAMBU)  # poste
    d.line((8, 13, 8, 28), fill=BAMBU_OSC)
    for y in (17, 22, 26):
        d.line((7, y, 8, y), fill=NUDO)
    d.rectangle((6, 11, 9, 13), fill=PIEDRA_OSC)  # casquillo
    d.ellipse((4, 3, 11, 11), fill=VIDRIO)  # foco
    d.point([(5, 5), (6, 4)], fill=VIDRIO_LUZ)
    d.line((7, 9, 7, 7), fill=FILAMENTO)
    d.line((8, 9, 8, 7), fill=FILAMENTO)
    d.line((7, 6, 8, 6), fill=BRILLO)
    d.rectangle((4, 28, 11, 30), fill=PIEDRA)  # base de piedras
    d.line((4, 30, 11, 30), fill=PIEDRA_OSC)
    return contorno(im)


def tabla():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line((4, 6, 7, 3), fill=CUERDA)  # cuerda de colgar
    d.line((8, 3, 11, 6), fill=CUERDA)
    d.rectangle((2, 6, 13, 28), fill=MADERA)
    d.line((2, 6, 13, 6), fill=MADERA_LUZ)
    d.line((2, 17, 13, 17), fill=MADERA_OSC)  # junta de las dos tablas
    for fila in (8, 12, 19, 23):  # grupos de 5 rayitas
        for x in (4, 6, 8, 10):
            d.line((x, fila, x, fila + 2), fill=MARCA)
        d.line((3, fila + 2, 11, fila), fill=MARCA)
    return contorno(im)


guardar('SENKU_PLANK_TABLE', 'Mesa de tablones', abrir(AQUI, 'mesa_tablones.png'), 2, 2, backgroundTiles=1, isDesk=True)
guardar('SENKU_STUMP', 'Tocón', abrir(AQUI, 'tocon.png'), 1, 1, category='chairs')
guardar('SENKU_BULB', 'Foco de Senku', foco(), 1, 2, category='decor', backgroundTiles=1)
guardar('SENKU_TALLY', 'Tabla de días contados', tabla(), 1, 2, category='wall', canPlaceOnWalls=True)

hoja = Image.new('RGBA', (36, 32), (70, 60, 50, 255))
hoja.alpha_composite(foco(), (0, 0))
hoja.alpha_composite(tabla(), (18, 0))
hoja.resize((360, 320), Image.NEAREST).save(AQUI / 'v2_x10.png')
