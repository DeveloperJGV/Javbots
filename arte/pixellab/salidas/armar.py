# Ideas de salida (cuarto de agenda, piso Personal): frasco de citas y tablero de polaroids. NO van en el plano aún.
#
#   originales/frasco_corcho.png, frasco_metal.png, frasco_lleno.png  create_image_pixen 32x32: salieron de 17-18 px de
#       ancho (no caben en 1x1 y se ven gigantes junto a un agente) -> el frasco se dibuja POR CÓDIGO a 10x14 px con la
#       paleta del de corcho; así la página puede escoger el nivel de papelitos (lleno, medio, casi vacío) y el brillo.
#   originales/corcho_2.png   create_image_pixen 32x32 (v2 de 2): tablero de corcho con polaroids genéricas (playa,
#       atardecer, café) y un hilo de corazones; sin personas.
#
# Uso:  python arte/pixellab/salidas/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import random
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, guardar, limpiar  # noqa: E402

CONTORNO = (28, 30, 58, 255)
VIDRIO = (150, 190, 210, 150)
VIDRIO_OSCURO = (110, 150, 175, 170)
BRILLO_VIDRIO = (235, 248, 255, 230)
CORCHO = (196, 140, 72, 255)
CORCHO_OSCURO = (140, 92, 44, 255)
HILO = (160, 40, 50, 255)
PAPELES = [(250, 160, 190, 255), (255, 214, 90, 255), (140, 230, 200, 255), (150, 200, 255, 255), (255, 240, 220, 255)]
RESPLANDOR = (255, 226, 130, 170)

# Interior del frasco (x 4..11, y 6..14): cuántas filas de papelitos lleva cada nivel, desde abajo
NIVELES = {'FULL': 9, 'HALF': 5, 'LOW': 2}


def frasco(filas, brilla=False, semilla=7):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    # cuerpo
    for y in range(5, 16):
        for x in range(3, 13):
            borde = x in (3, 12) or y == 15 or (y == 5 and x in (3, 4, 11, 12))
            px[x, y] = CONTORNO if borde else (VIDRIO_OSCURO if x in (4, 11) else VIDRIO)
    for x in (3, 12):  # hombros redondeados
        px[x, 5] = (0, 0, 0, 0)
    for x in range(4, 12):
        px[x, 5] = CONTORNO
    # cuello y corcho
    for y in (3, 4):
        px[5, y] = CONTORNO
        px[10, y] = CONTORNO
        for x in range(6, 10):
            px[x, y] = VIDRIO_OSCURO if y == 4 else HILO  # hilo atado al cuello
    for y in (0, 1, 2):
        for x in range(5, 11):
            borde = x in (5, 10) or y == 0
            px[x, y] = CONTORNO if borde else (CORCHO if y == 1 else CORCHO_OSCURO)
    px[5, 0] = px[10, 0] = (0, 0, 0, 0)
    # papelitos doblados (bloques de 2x1 de colores) desde abajo
    rnd = random.Random(semilla)
    for i in range(filas):
        y = 14 - i
        x = 4 + (i % 2)
        while x <= 11:
            c = rnd.choice(PAPELES)
            px[x, y] = c
            if x + 1 <= 11:
                px[x + 1, y] = c
            x += 2 + rnd.choice((0, 0, 1))
    # reflejo del vidrio por encima de todo
    for y in range(7, 13):
        px[5, y] = BRILLO_VIDRIO
    px[6, 7] = BRILLO_VIDRIO
    if brilla:  # resplandor cálido alrededor: "hoy toca salir"
        base = im.copy()
        bp = base.load()
        for y in range(16):
            for x in range(16):
                if bp[x, y][3]:
                    continue
                if any(0 <= x + dx < 16 and 0 <= y + dy < 16 and bp[x + dx, y + dy][3] and bp[x + dx, y + dy] == CONTORNO
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    px[x, y] = RESPLANDOR
    return im


PIEZAS = [
    ('AGENDA_SALIDAS_JAR_FULL', 'Frasco de citas (lleno)', lambda: frasco(NIVELES['FULL']), 1, 1,
     dict(category='decor', canPlaceOnSurfaces=True)),
    ('AGENDA_SALIDAS_JAR_HALF', 'Frasco de citas (a la mitad)', lambda: frasco(NIVELES['HALF']), 1, 1,
     dict(category='decor', canPlaceOnSurfaces=True)),
    ('AGENDA_SALIDAS_JAR_LOW', 'Frasco de citas (casi vacío)', lambda: frasco(NIVELES['LOW']), 1, 1,
     dict(category='decor', canPlaceOnSurfaces=True)),
    ('AGENDA_SALIDAS_JAR_GLOW', 'Frasco de citas (hoy toca salir)', lambda: frasco(NIVELES['FULL'], brilla=True), 1, 1,
     dict(category='decor', canPlaceOnSurfaces=True)),
    ('AGENDA_SALIDAS_BOARD', 'Tablero de polaroids', lambda: limpiar(_abrir(AQUI, 'corcho_2.png')), 2, 2,
     dict(category='wall', canPlaceOnWalls=True)),
]


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    k = 6
    ancho = sum(i.width * k + 12 for i in hechas) + 12
    alto = max(i.height for i in hechas) * k + 24
    hoja = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 12
    for i in hechas:
        hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 12 - i.height * k))
        x += i.width * k + 12
    hoja.save(AQUI / 'vista_x6.png')
    print('vista:', AQUI / 'vista_x6.png')


if __name__ == '__main__':
    main()
