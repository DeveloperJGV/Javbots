# Light Labs (Fase 4, Mega Man): arma los muebles a partir de los originales de PixelLab.
#
#   originales/capsula.png      create_image_pixen 32x48, view=side (cápsula de teletransporte)
#   originales/mesa_casco.png   create_image_pixen 32x32, view=side (casco retocado en casco.py)
#   originales/monitor.png      create_image_pixen 32x32, view=side (monitor de jefes, pared)
#
# Uso:  python arte/pixellab/lightlabs/armar.py   (no gasta generaciones)
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))

from muebles import guardar  # noqa: E402


def abrir(nombre):
    return Image.open(AQUI / 'originales' / nombre).convert('RGBA')


guardar('TELEPORTER', 'Cápsula de teletransporte', abrir('capsula.png'), 2, 3, backgroundTiles=1)
# HELMET_TABLE: ahora la arma cabezas.py (cabeza estilo 1-UP de Mega Man sobre la mesa)
guardar('BOSS_MONITOR', 'Monitor de jefes', abrir('monitor.png'), 2, 2, category='wall', canPlaceOnWalls=True)
