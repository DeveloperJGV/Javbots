# Chamarra roja de Kaneda (Akira) colgada de un gancho, vista de espalda con la píldora (pared 1×2 = 16×32).
# Homenaje dibujado por código (sin texto: a este tamaño no se lee). Reemplaza el cuadro chico de la sala de becarios.
# Uso: python arte/pixellab/becarios/chamarra.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from muebles import CONTORNO, guardar, pintar  # noqa: E402

CHAMARRA = [
    '................',
    '................',
    '................',
    '................',
    '.......gg.......',
    '......g..g......',
    '.........g......',
    '........g.......',
    '.....oooooo.....',
    '....oKRRRRKo....',
    '..ooRoKKKKoRoo..',
    '.oRRRRRRRRRRRRo.',
    '.oRRoRRRRRRoRRo.',
    '.oRRooooooooRRo.',
    '.oRRoWWWrrroRRo.',
    '.oRRoWBWrrroRRo.',
    '.oRRoWWWrrroRRo.',
    '.oRRooooooooRRo.',
    '.oRRoRRRRRRoRRo.',
    '.oRRoRRRRRRoRRo.',
    '.oDRoRRRRRRoRDo.',
    '.oDRoRRRRRRoRDo.',
    '.oKKoRRRRRRoKKo.',
    '..oooDRRRRDooo..',
    '....oKKKKKKo....',
    '....oooooooo....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
]
COLORES = {
    'o': CONTORNO, 'g': (150, 154, 162, 255), 'R': (208, 40, 44, 255), 'D': (160, 26, 32, 255),
    'K': (120, 20, 26, 255), 'W': (240, 240, 232, 255), 'B': (70, 120, 200, 255), 'r': (236, 92, 70, 255),
}

im = pintar(CHAMARRA, COLORES)
guardar('KANEDA_JACKET', 'Chamarra de Kaneda', im, 1, 2, category='wall', canPlaceOnWalls=True)
im.resize((160, 320), 0).save(Path(__file__).resolve().parent / 'chamarra_x10.png')
