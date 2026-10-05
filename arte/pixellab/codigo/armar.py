# Cuarto de Código (2026-10-05): Matrix, Tron y detalles geek. Todo por código (sin PixelLab).
#   MATRIX_SCREEN  pantalla de pared 2×2 con lluvia verde; la página la hace caer (kind 'cycle', MATRIX_BANDS)
#   TRON_DISC      disco de luz de pared 1×2 (brilla de noche)       FSOCIETY_MASK  máscara de Mr. Robot (pared 1×2)
#   SERVER_RACK    rack de servidores 1×2 (lucecitas: kind 'pulse', RACK_LED_*)
#   COFFEE_MAKER   cafetera de oficina 1×2 (echa vapor)
#   Sobre escritorios (1×1): POKEBALL, GAMEBOY, BABY_GROOT (antes eran patitos de hule) y RUBIK_CUBE
#   carpet_3 en cian alrededor de la mesa grande = línea de neón de Tron (en oficina.cjs)
# Uso: python arte/pixellab/codigo/armar.py
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import contorno, guardar  # noqa: E402


def hexa(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


MATRIX = [hexa(c) for c in ('#d8ffd8', '#4dff6a', '#1fa83a', '#0b4a1a')]  # = MATRIX_BANDS (cabeza → cola)
LED_VERDE, LED_AMBAR = hexa('#3dff6a'), hexa('#ffb43c')  # = RACK_LED_GREEN / RACK_LED_AMBER
NEGRO, MARCO, MARCO_LUZ = (12, 14, 18, 255), (70, 76, 90, 255), (110, 118, 134, 255)


def pantalla_matrix():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 4, 30, 27), fill=MARCO)
    d.rectangle((3, 6, 28, 25), fill=(4, 14, 6, 255))
    rnd = random.Random(3)
    for x in range(4, 28, 2):  # columnas de "caracteres"; cada una con su desfase
        off = rnd.randrange(8)
        for y in range(7, 25):
            if rnd.random() < 0.8:
                im.putpixel((x, y), MATRIX[(off - y) % 4])
    d.line((1, 4, 30, 4), fill=MARCO_LUZ)
    return contorno(im)


def disco_tron():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((1, 9, 14, 22), fill=(30, 34, 44, 255))
    d.ellipse((2, 10, 13, 21), outline=hexa('#5ff3ff'))
    d.ellipse((5, 13, 10, 18), fill=(16, 18, 24, 255), outline=hexa('#2bb8d8'))
    d.point([(7, 15), (8, 16)], fill=hexa('#bfffff'))
    return contorno(im)


def mascara():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    blanco, negro, rojo = (240, 236, 228, 255), (24, 22, 24, 255), (230, 120, 120, 255)
    d.ellipse((2, 6, 13, 25), fill=blanco)
    d.line((4, 11, 6, 10), fill=negro)  # cejas
    d.line((9, 10, 11, 11), fill=negro)
    d.rectangle((4, 13, 6, 14), fill=negro)  # ojos
    d.rectangle((9, 13, 11, 14), fill=negro)
    d.point([(3, 17), (12, 17)], fill=rojo)  # cachetes
    d.line((4, 19, 11, 19), fill=negro)  # bigote
    d.line((4, 20, 6, 19), fill=negro)
    d.line((9, 19, 11, 20), fill=negro)
    d.line((6, 22, 9, 22), fill=(150, 60, 60, 255))  # sonrisa
    d.line((7, 3, 7, 6), fill=(150, 150, 150, 255))  # clavo y liga
    return contorno(im)


def rack():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 2, 13, 30), fill=(28, 30, 38, 255))
    d.line((2, 2, 13, 2), fill=MARCO_LUZ)
    for i, y in enumerate(range(5, 28, 4)):
        d.rectangle((3, y, 12, y + 2), fill=(52, 56, 68, 255))
        d.line((4, y + 1, 8, y + 1), fill=(36, 38, 46, 255))  # rejilla
        d.point((10, y + 1), fill=LED_VERDE)
        d.point((11, y + 1), fill=LED_AMBAR if i % 2 else LED_VERDE)
    return contorno(im)


def cafetera():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 18, 14, 30), fill=(120, 84, 52, 255))  # mueble
    d.line((1, 18, 14, 18), fill=(156, 112, 72, 255))
    d.line((7, 20, 7, 29), fill=(90, 62, 38, 255))
    d.rectangle((3, 7, 12, 17), fill=(44, 46, 54, 255))  # cafetera
    d.rectangle((4, 8, 11, 10), fill=(80, 84, 96, 255))
    d.point((10, 9), fill=(255, 80, 60, 255))  # foco rojo
    d.rectangle((5, 12, 10, 16), fill=(20, 20, 24, 255))
    d.rectangle((6, 14, 8, 16), fill=(240, 240, 236, 255))  # taza
    return contorno(im)


def pokebola():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 7, 11, 14), fill=(244, 244, 244, 255))
    d.pieslice((4, 7, 11, 14), 180, 360, fill=(226, 40, 40, 255))
    d.line((4, 10, 11, 10), fill=(20, 20, 24, 255))
    d.ellipse((6, 9, 9, 12), fill=(20, 20, 24, 255))
    d.point((7, 10), fill=(250, 250, 250, 255))
    d.point((6, 8), fill=(255, 140, 140, 255))
    return contorno(im)


def gameboy():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((4, 4, 11, 15), fill=(200, 200, 192, 255))  # carcasa gris
    d.rectangle((5, 5, 10, 9), fill=(70, 70, 90, 255))  # marco de pantalla
    d.rectangle((6, 6, 9, 8), fill=(150, 180, 60, 255))  # pantalla verde
    d.point([(5, 12), (6, 11), (6, 12), (6, 13), (7, 12)], fill=(40, 40, 48, 255))  # cruz
    d.point([(9, 12), (10, 11)], fill=(150, 30, 80, 255))  # botones A y B
    return contorno(im)


def groot():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(4, 11), (11, 11), (10, 15), (5, 15)], fill=(196, 110, 60, 255))  # maceta
    d.line((4, 11, 11, 11), fill=(222, 140, 84, 255))
    madera, osc = (150, 100, 56, 255), (100, 64, 34, 255)
    d.ellipse((5, 3, 10, 8), fill=madera)  # cabeza
    d.rectangle((6, 8, 9, 10), fill=madera)  # cuerpo
    d.point([(6, 5), (9, 5)], fill=(20, 16, 12, 255))  # ojos
    d.point((7, 7), fill=osc)
    d.point([(5, 2), (10, 2), (8, 1)], fill=(90, 170, 60, 255))  # hojitas
    return contorno(im)


def rubik():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    colores = [(230, 50, 50, 255), (250, 210, 40, 255), (60, 120, 230, 255), (70, 200, 80, 255),
               (250, 250, 250, 255), (250, 140, 30, 255)]
    rnd = random.Random(7)
    for fy in range(3):
        for fx in range(3):
            c = colores[rnd.randrange(6)]
            for y in range(2):
                for x in range(2):
                    im.putpixel((5 + fx * 2 + x, 8 + fy * 2 + y), c)
    return contorno(im)


guardar('MATRIX_SCREEN', 'Pantalla de código verde', pantalla_matrix(), 2, 2, category='wall', canPlaceOnWalls=True)
guardar('TRON_DISC', 'Disco de luz', disco_tron(), 1, 2, category='wall', canPlaceOnWalls=True)
guardar('FSOCIETY_MASK', 'Máscara de hacker', mascara(), 1, 2, category='wall', canPlaceOnWalls=True)
guardar('SERVER_RACK', 'Rack de servidores', rack(), 1, 2, category='electronics', backgroundTiles=1)
guardar('COFFEE_MAKER', 'Cafetera', cafetera(), 1, 2, backgroundTiles=1)
guardar('POKEBALL', 'Pokébola', pokebola(), 1, 1, canPlaceOnSurfaces=True)
guardar('GAMEBOY', 'Consola de bolsillo', gameboy(), 1, 1, canPlaceOnSurfaces=True)
guardar('BABY_GROOT', 'Arbolito bailarín', groot(), 1, 1, canPlaceOnSurfaces=True)
guardar('RUBIK_CUBE', 'Cubo Rubik', rubik(), 1, 1, canPlaceOnSurfaces=True)

piezas = [pantalla_matrix(), disco_tron(), mascara(), rack(), cafetera(), pokebola(), gameboy(), groot(), rubik()]
hoja = Image.new('RGBA', (sum(p.width + 3 for p in piezas), 32), (150, 156, 170, 255))
x = 0
for p in piezas:
    hoja.alpha_composite(p, (x, 32 - p.height))
    x += p.width + 3
hoja.resize((hoja.width * 6, hoja.height * 6), Image.NEAREST).save(AQUI / 'vista_x6.png')
