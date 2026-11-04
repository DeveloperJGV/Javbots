# Cuarto de agenda ("centro de mando geek"): piezas extra para llenarlo, sin tocar los muebles AGENDA_* (esos los
# dibuja features/agenda/arte/armar.py y la página los anima). Misma paleta: azul marino, cian, ámbar.
#
#   originales/sillon_2.png   create_image_pixen 32x32, view=side, de espaldas (v2 de 2): sillón de mando
#   originales/consola_2.png  create_image_pixen 32x32, view=side (v2 de 2; la v1 salió en ángulo) -> pantallas por código
#   originales/antena_1.png   create_image_pixen 32x32, view=side (v1 de 2): antena parabólica
#   originales/globo_2.png    create_image_pixen 32x32, view=side (v2 de 2) -> el globo pasa a holograma (alfa parcial)
#   MANDO_STATUS (pantalla de pared con barras) y MANDO_BEACON (poste con luz de aviso): 100 % por código
#   2.ª tanda (para no reusar muebles de la oficina):
#   originales/lampara_1.png   32x32 (v1 de 2): lámpara de anillo cian -> recorte a 16x32
#   originales/planta_1.png    32x32 (v1 de 2): palma en maceta azul marino
#   originales/planta_2.png    32x32 (v2 de 2): bonsái en maceta con luces cian
#   originales/cafetera_2.png  32x32 (v2 de 2; la v1 salió rara): cafetera sci-fi
#   originales/servidor_1.png  32x32: servidor azul marino (salió ancho: 2x2)
#   MANDO_CLOCK (reloj digital de pared): 100 % por código
#   3.ª tanda ("mando cálido", para que no se parezca al cuarto de freelance):
#   originales/lampara_laton_1.png  32x32 (v1 de 2): lámpara de latón con pantalla crema -> recorte a 16x32
#   originales/archivero_1.png      32x32: archivero de madera con jaladeras de latón
#   originales/librero_1.png        32x32: librero de madera con carpetas
#
# Uso:  python arte/pixellab/mando/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, angosto, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return _abrir(AQUI, nombre)


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# Paleta de features/agenda/arte/armar.py
CONTORNO = rgb('#14161c')
MARCO = rgb('#3a3f4b')
MARCO_CLARO = rgb('#5a6172')
MARCO_OSCURO = rgb('#2a2e38')
PANTALLA = rgb('#0b1a2b')
REJILLA = rgb('#16324a')
CIAN = rgb('#22d3ee')
CIAN_OSCURO = rgb('#0e7490')
AMBAR = rgb('#fbbf24')
AMBAR_OSCURO = rgb('#b45309')
VERDE = rgb('#4ade80')
HOLO_ALFA = 190


def barras(px, x0, y0, x1, y1, alturas, colores):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = PANTALLA
    for i, h in enumerate(alturas):
        x = x0 + 1 + i * 2
        if x > x1 - 1:
            break
        for y in range(y1 - 1, max(y0, y1 - 1 - h), -1):
            px[x, y] = colores[i % len(colores)]


def sillon():
    return al_piso(limpiar(abrir('sillon_2.png')), 31)


def consola():
    im = limpiar(abrir('consola_2.png'))
    px = im.load()
    barras(px, 8, 2, 12, 5, (2, 3, 1), (CIAN, AMBAR))
    barras(px, 20, 2, 24, 5, (1, 3, 2), (VERDE, CIAN))
    return im


def antena():
    return al_piso(limpiar(abrir('antena_1.png')), 31)


def globo():
    """El globo de arriba (filas 3-16 del original) se vuelve holograma: alfa parcial, la mesa queda sólida."""
    im = limpiar(abrir('globo_2.png'))
    px = im.load()
    for y in range(0, 17):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r, g, b, HOLO_ALFA)
    return al_piso(im, 31)


def piso(nombre):
    return al_piso(limpiar(abrir(nombre)), 31)


DIGITOS = {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '###', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
    '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
}


def reloj(hora='09:30'):
    """Reloj digital de pared 2x1: caja oscura con dígitos cian de 3x5 (la hora es fija: es un dibujo)."""
    im = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    px = im.load()
    x0, y0, x1, y1 = 4, 3, 27, 12
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            borde = x in (x0, x1) or y in (y0, y1)
            marco = x in (x0 + 1, x1 - 1) or y in (y0 + 1, y1 - 1)
            px[x, y] = CONTORNO if borde else (MARCO if marco else PANTALLA)
    x = 8
    for ch in hora:
        if ch == ':':
            px[x, 6] = CIAN
            px[x, 8] = CIAN
            x += 2
            continue
        for fy, fila in enumerate(DIGITOS[ch]):
            for fx, c in enumerate(fila):
                if c == '#':
                    px[x + fx, 5 + fy] = CIAN
        x += 4
    return im


def estado():
    """Pantalla de pared 2x2: barras de la semana (cian) y una alarma ámbar arriba."""
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    x0, y0, x1, y1 = 3, 4, 28, 27
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            borde = x in (x0, x1) or y in (y0, y1)
            marco = x in (x0 + 1, x1 - 1) or y in (y0 + 1, y1 - 1)
            px[x, y] = CONTORNO if borde else (MARCO_CLARO if marco and y == y0 + 1 else MARCO if marco else PANTALLA)
    for x in range(x0 + 2, x1 - 1):
        for y in (12, 18):
            px[x, y] = REJILLA
    barras(px, 6, 9, 25, 24, (4, 7, 5, 10, 8, 12, 6, 9, 11), (CIAN, CIAN_OSCURO))
    for x in range(6, 12):
        px[x, 7] = AMBAR
    for x in range(14, 18):
        px[x, 7] = CIAN_OSCURO
    px[24, 7] = VERDE
    return im


def faro():
    """Poste 1x2 con luz de aviso ámbar arriba (como las de una pista)."""
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = im.load()
    # base
    for y in range(27, 31):
        for x in range(4, 12):
            px[x, y] = CONTORNO if y in (27, 30) or x in (4, 11) else MARCO
    # poste
    for y in range(10, 27):
        px[7, y] = CONTORNO
        px[8, y] = MARCO_CLARO
        px[9, y] = CONTORNO
    # foco
    for y in range(3, 10):
        for x in range(5, 11):
            borde = y in (3, 9) or x in (5, 10)
            px[x, y] = CONTORNO if borde else (AMBAR if y < 6 else AMBAR_OSCURO)
    px[6, 4] = rgb('#fff1c2')
    return im


PIEZAS = [
    ('MANDO_CHAIR', 'Sillón de mando', sillon, 2, 2, dict(category='misc', backgroundTiles=1)),
    ('MANDO_CONSOLE', 'Consola lateral', consola, 2, 2, dict(category='electronics', backgroundTiles=1)),
    ('MANDO_DISH', 'Antena parabólica', antena, 2, 2, dict(category='electronics', backgroundTiles=1)),
    ('MANDO_HOLO_GLOBE', 'Globo holográfico', globo, 2, 2, dict(category='electronics', backgroundTiles=1)),
    ('MANDO_STATUS', 'Pantalla de estado', estado, 2, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('MANDO_BEACON', 'Faro de aviso', faro, 1, 2, dict(category='decor', backgroundTiles=1)),
    ('MANDO_LAMP', 'Lámpara de anillo', lambda: angosto(limpiar(abrir('lampara_1.png'))), 1, 2,
     dict(category='decor', backgroundTiles=1)),
    ('MANDO_PALM', 'Palma de mando', lambda: piso('planta_1.png'), 2, 2, dict(category='decor', backgroundTiles=1)),
    ('MANDO_BONSAI', 'Bonsái con luces', lambda: piso('planta_2.png'), 2, 2, dict(category='decor', backgroundTiles=1)),
    ('MANDO_COFFEE', 'Cafetera sci-fi', lambda: piso('cafetera_2.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('MANDO_SERVER', 'Servidor de mando', lambda: piso('servidor_1.png'), 2, 2,
     dict(category='electronics', backgroundTiles=1)),
    ('MANDO_CLOCK', 'Reloj digital', reloj, 2, 1, dict(category='wall', canPlaceOnWalls=True)),
    ('MANDO_BRASS_LAMP', 'Lámpara de latón', lambda: angosto(limpiar(abrir('lampara_laton_1.png'))), 1, 2,
     dict(category='decor', backgroundTiles=1)),
    ('MANDO_FILE_CABINET', 'Archivero de madera', lambda: piso('archivero_1.png'), 2, 2,
     dict(category='storage', backgroundTiles=1)),
    ('MANDO_BOOKSHELF', 'Librero de carpetas', lambda: piso('librero_1.png'), 2, 2,
     dict(category='storage', backgroundTiles=1)),
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
