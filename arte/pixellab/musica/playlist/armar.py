# Sala de música: piezas de la "playlist del día" (la función y sus animaciones van después, por código).
#
#   originales/prensa_2.png  create_image_pixen 32x48, view=side (v2 de 2): prensa de vinilos retro-industrial
#   originales/bote_2.png    create_image_pixen 16x16 (v2 de 2): bote con vinilos rotos y uno derretido
#   neón "HOY SUENA": 100 % por código (tabla oscura con tubo cian y letras rosas, como NEON_DISCOS)
#
# Uso:  python arte/pixellab/musica/playlist/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y la vista previa vista_x6.png. No gasta.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402

CONTORNO = (27, 27, 34, 255)
# Mismos colores que NEON_DISCOS (musica/tienda/armar.py), para que se vean de la misma familia
NEON_TABLA = (30, 20, 40, 255)
NEON_ROSA, NEON_ROSA_BRILLO, NEON_ROSA_HALO = (255, 105, 200, 255), (255, 200, 240, 255), (120, 30, 95, 255)
NEON_CIAN, NEON_CIAN_HALO = (90, 235, 245, 255), (25, 95, 115, 255)

# Letras de tubo de 3x5 (la N de 4x5)
LETRAS = {
    'H': ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
    'O': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    'Y': ['X.X', 'X.X', '.X.', '.X.', '.X.'],
    'S': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
    'U': ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
    'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    'N': ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],  # 4 de ancho: en 3 la diagonal no cabe y se lee M
    'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    ' ': ['..', '..', '..', '..', '..'],
}


def neon_hoy_suena():
    """3x1 de pared: tabla con tubo cian en la orilla y "HOY SUENA" en rosa (brillo arriba, resplandor solo abajo)."""
    im = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 2, 47, 13], fill=CONTORNO)
    d.rectangle([1, 3, 46, 12], fill=NEON_TABLA)
    for x, y in ((0, 2), (47, 2), (0, 13), (47, 13)):
        im.putpixel((x, y), (0, 0, 0, 0))
    d.rectangle([2, 3, 45, 12], outline=NEON_CIAN)
    for x, y in ((2, 3), (45, 3), (2, 12), (45, 12)):
        im.putpixel((x, y), NEON_TABLA)
    px = im.load()
    texto = 'HOY SUENA'
    ancho = sum(len(LETRAS[c][0]) for c in texto) + (len(texto) - 1)
    x, y0 = (48 - ancho) // 2, 5
    puntos = set()
    for c in texto:
        for dy, fila in enumerate(LETRAS[c]):
            for dx, ch in enumerate(fila):
                if ch == 'X':
                    puntos.add((x + dx, y0 + dy))
        x += len(LETRAS[c][0]) + 1
    for x, y in puntos:  # resplandor solo bajo la base de las letras: adentro de la N o la A las engorda
        if y == y0 + 4 and px[x, y + 1] == NEON_TABLA:
            px[x, y + 1] = NEON_ROSA_HALO
    for x, y in puntos:
        px[x, y] = NEON_ROSA_BRILLO if (x, y - 1) not in puntos else NEON_ROSA
    return im


def piso(nombre):
    im = limpiar(_abrir(AQUI, nombre))
    return al_piso(im, im.height - 1)


PIEZAS = [
    ('MUSICA_PLAYLIST_PRESS', 'Prensa de vinilos del día', lambda: piso('prensa_2.png'), 2, 3,
     dict(category='electronics', backgroundTiles=2)),
    ('MUSICA_PLAYLIST_REJECT_BIN', 'Bote de "esta no"', lambda: piso('bote_2.png'), 1, 1, dict(category='misc')),
    ('MUSICA_PLAYLIST_NEON', 'Neón HOY SUENA', neon_hoy_suena, 3, 1, dict(category='wall', canPlaceOnWalls=True)),
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
