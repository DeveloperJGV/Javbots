# Bodega ordenada (el Sótano de la Planta baja): estantes, tarima, cajas, escalera y diablito.
#
#   originales/estante_1.png     create_image_pixen 32x32, view=side (v1 de 2): estante con cajas de colores etiquetadas
#   originales/rack_azul_1.png   32x32: rack azul con travesaños naranjas y contenedores
#   originales/tarima_1.png      32x32 (v1 de 2): tarima con cajas emplayadas
#   originales/cajas_1.png       16x16: dos cajas de cartón con etiqueta
#   originales/escalera_1.png    32x32: escalera de tijera de aluminio
#   originales/diablito_1.png    32x32: diablito rojo con dos cajas
#
# Uso:  python arte/pixellab/almacen/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def piso(nombre, ultima=31):
    return al_piso(limpiar(_abrir(AQUI, nombre)), ultima)


PIEZAS = [
    ('ALMACEN_SHELF', 'Estante de cajas de colores', lambda: piso('estante_1.png'), 2, 2,
     dict(category='storage', backgroundTiles=1)),
    ('ALMACEN_RACK', 'Rack de contenedores', lambda: piso('rack_azul_1.png'), 2, 2,
     dict(category='storage', backgroundTiles=1)),
    ('ALMACEN_PALLET', 'Tarima con cajas', lambda: piso('tarima_1.png'), 2, 2, dict(category='storage', backgroundTiles=1)),
    ('ALMACEN_BOXES', 'Cajas etiquetadas', lambda: piso('cajas_1.png', 15), 1, 1, dict(category='storage')),
    ('ALMACEN_LADDER', 'Escalera de tijera', lambda: piso('escalera_1.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('ALMACEN_DOLLY', 'Diablito', lambda: piso('diablito_1.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
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
