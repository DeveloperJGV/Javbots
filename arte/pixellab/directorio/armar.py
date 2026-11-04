# Directorio (tercer cuarto del piso Personal), estilo vestíbulo de edificio elegante: arte bueno con PixelLab.
#
# Los 4 muebles que abren el panel conservan ID y tamaño; aquí solo se reemplaza su PNG (el manifest.json de
# features/directorio/assets/furniture/<ID>/ no se toca). Los muebles nuevos van en webview-ui/public/assets/furniture/.
#   originales/tablero_1.png    48x32 (v1 de 2): directorio de fieltro negro con marco de latón -> renglones por código
#   originales/mostrador_2.png  48x32 (v2 de 2): mostrador de nogal con cubierta de mármol, campanita y libro de visitas
#   originales/llaves_1.png     32x32 (v1 de 2): tablero de llaves de latón
#   originales/telefono_1.png   20x20 (v1 de 2): teléfono de disco -> recorte a 16x16
#   sofa_1, mesita_1, lampara_1, palma_1, topiario_1, banca_1, reloj_1, buzones_1: sala de espera y pared (1 de 1)
#
# Uso:  python arte/pixellab/directorio/armar.py
# Escribe los PNG y la vista previa vista_x4.png (con un agente al lado para la escala). No gasta.
import random
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402
from digital import reloj_laton  # noqa: E402  (reloj sin manecillas; reloj_1.png ya no se usa)

DIRECTORIO = RAIZ / 'features' / 'directorio' / 'assets' / 'furniture'
LETRA = (236, 236, 236, 255)


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def piso(nombre):
    im = abrir(nombre)
    return al_piso(im, im.height - 1)


def chico(nombre):
    """Pieza pedida en 20x20: se recorta lo dibujado (a 16 de ancho si hace falta) y va abajo al centro de 16x16
    o 16x32 si es más alta."""
    im = abrir(nombre)
    x0, y0, x1, y1 = im.getbbox()
    if x1 - x0 > 16:
        x0 += (x1 - x0 - 16) // 2
        x1 = x0 + 16
    pieza = im.crop((x0, y0, x1, y1))
    alto = 16 if pieza.height <= 16 else 32
    out = Image.new('RGBA', (16, alto), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((16 - pieza.width) // 2, alto - 1 - pieza.height))
    return out


def renglon(px, rnd, x0, x1, y):
    """Letras blancas de fieltro vistas de lejos: palabras de 3-7 px, 2 de alto, con huecos."""
    x = x0
    while x < x1 - 2:
        palabra = rnd.randint(3, 7)
        for i in range(min(palabra, x1 - x)):
            arriba, abajo = rnd.choice([(1, 1), (1, 0), (0, 1), (1, 1)])
            if arriba:
                px[x + i, y] = LETRA
            if abajo:
                px[x + i, y + 1] = LETRA
        x += palabra + 2


def directorio():
    """El fieltro del original va de x 3..44, y 8..26: nombre a la izquierda y número de piso a la derecha."""
    im = abrir('tablero_1.png')
    px = im.load()
    rnd = random.Random(7)
    for y in range(10, 25, 3):
        renglon(px, rnd, 6, 33, y)
        for x in range(37, 42):
            px[x, y] = LETRA
        px[38, y + 1] = LETRA
        px[40, y + 1] = LETRA
    return im


def reemplazar(id_, im):
    """Cambia solo el PNG de un mueble del Directorio, comprobando que conserve su tamaño."""
    destino = DIRECTORIO / id_ / f'{id_}.png'
    viejo = Image.open(destino)
    assert viejo.size == im.size, f'{id_}: {im.size} no mide lo mismo que antes {viejo.size}'
    im.save(destino)
    print('ok', id_, im.size, '(reemplazado)')


DEL_PANEL = [
    ('DIRECTORIO_BOARD', directorio),
    ('DIRECTORIO_DESK', lambda: abrir('mostrador_2.png')),
    ('DIRECTORIO_KEYS', lambda: abrir('llaves_1.png')),
    ('DIRECTORIO_PHONE', lambda: chico('telefono_1.png')),
]

NUEVOS = [
    ('DIRECTORIO_SOFA', 'Sofá chesterfield', lambda: piso('sofa_1.png'), 3, 2, dict(category='misc', backgroundTiles=1)),
    ('DIRECTORIO_COFFEE_TABLE', 'Mesita de latón', lambda: piso('mesita_1.png'), 2, 2,
     dict(category='desks', backgroundTiles=1)),
    ('DIRECTORIO_LAMP', 'Lámpara art déco', lambda: piso('lampara_1.png'), 2, 2, dict(category='decor', backgroundTiles=1)),
    ('DIRECTORIO_PALM', 'Palma en maceta de latón', lambda: piso('palma_1.png'), 2, 2,
     dict(category='decor', backgroundTiles=1)),
    ('DIRECTORIO_TOPIARY', 'Topiario', lambda: chico('topiario_1.png'), 1, 2, dict(category='decor', backgroundTiles=1)),
    ('DIRECTORIO_SETTEE', 'Sillón de terciopelo', lambda: piso('banca_1.png'), 3, 2, dict(category='misc', backgroundTiles=1)),
    ('DIRECTORIO_CLOCK', 'Reloj digital de latón', reloj_laton, 1, 1, dict(category='wall', canPlaceOnWalls=True)),
    ('DIRECTORIO_MAILBOXES', 'Buzones de latón', lambda: abrir('buzones_1.png'), 2, 2,
     dict(category='wall', canPlaceOnWalls=True)),
]


def main():
    hechas = []
    for id_, fn in DEL_PANEL:
        im = fn()
        reemplazar(id_, im)
        hechas.append(im)
    for id_, nombre, fn, fw, fh, extra in NUEVOS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    agente = Image.open(RAIZ / 'webview-ui/public/assets/characters/char_0.png').convert('RGBA').crop((0, 0, 24, 44))
    k = 4
    piezas = [agente] + hechas
    ancho = sum(i.width * k + 8 for i in piezas) + 8
    alto = max(i.height for i in piezas) * k + 16
    hoja = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in piezas:
        hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    hoja.save(AQUI / 'vista_x4.png')
    print('vista:', AQUI / 'vista_x4.png')


if __name__ == '__main__':
    main()
