# Light Labs, segunda tanda: consola del Dr. Light y E-Tank (por código).
#   originales/consola.png  create_image_pixen 48x32, view=side
# Uso: python arte/pixellab/lightlabs/armar_extra.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import dibujos  # noqa: E402
from muebles import abrir, guardar  # noqa: E402

guardar('LIGHT_CONSOLE', 'Consola del laboratorio', abrir(AQUI, 'consola.png'), 3, 2, backgroundTiles=1)
guardar('E_TANK', 'E-Tank', dibujos.etank(), 1, 1)
