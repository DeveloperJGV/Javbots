# Laboratorio Aperture (Portal): mesa de pruebas, portales, cubo de compañía y torreta.
#   originales/*.png  create_image_pixen, view=side (torreta: v2)
# Uso: python arte/pixellab/aperture/armar.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, guardar  # noqa: E402

portales = abrir(AQUI, 'portales.png')  # los dos lado a lado: se parten a la mitad
guardar('PORTAL_BLUE', 'Portal azul', portales.crop((0, 0, 16, 32)), 1, 2, category='wall', canPlaceOnWalls=True)
guardar('PORTAL_ORANGE', 'Portal naranja', portales.crop((16, 0, 32, 32)), 1, 2, category='wall',
        canPlaceOnWalls=True)
guardar('TEST_TABLE', 'Mesa de pruebas', abrir(AQUI, 'mesa.png'), 2, 2, backgroundTiles=1)
guardar('COMPANION_CUBE', 'Cubo de compañía', abrir(AQUI, 'cubo.png'), 1, 1)
guardar('TURRET', 'Torreta', abrir(AQUI, 'torreta.png'), 2, 2, backgroundTiles=1)
