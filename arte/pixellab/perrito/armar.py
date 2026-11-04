# Rincón de perrito en el cuarto de Código (en lugar del servidor): cama y juguetes GENÉRICOS (nada de los perros del
# usuario: su arte es privado y esto va al repo público).
#
#   originales/cama_1.png     create_image_pixen 32x32, view=side (v1 de 2): cama redonda beige
#   originales/cama_2.png     (v2 de 2): cama ovalada azul marino -> DOG_BED_2
#   originales/pelota_1.png   16x16: pelota de tenis
#   originales/hueso_1.png    16x16: hueso blanco
#   originales/cuerda_1.png   16x16 (v1 de 2): cuerda roja y blanca
#
# Uso:  python arte/pixellab/perrito/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def piso(nombre, ultima):
    return al_piso(limpiar(_abrir(AQUI, nombre)), ultima)


PIEZAS = [
    ('DOG_BED', 'Cama de perrito', lambda: piso('cama_1.png', 30), 2, 2, dict(category='misc', backgroundTiles=1)),
    # la segunda ("son dos amigos"): la v2 azul marino que ya se había generado
    ('DOG_BED_2', 'Cama de perrito azul', lambda: piso('cama_2.png', 30), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('DOG_BALL', 'Pelota', lambda: piso('pelota_1.png', 14), 1, 1, dict(category='misc')),
    ('DOG_BONE', 'Hueso de juguete', lambda: piso('hueso_1.png', 14), 1, 1, dict(category='misc')),
    ('DOG_ROPE', 'Cuerda de juguete', lambda: piso('cuerda_1.png', 14), 1, 1, dict(category='misc')),
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
