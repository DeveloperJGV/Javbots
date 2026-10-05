# Taller, segunda tanda (2026-10-05): cabeza del Gigante de hierro, brazo robot y gato hidráulico.
#   originales/gigante.png  create_image_pixen 48x48, view=side (variante a de 4)
#   originales/brazo.png    create_image_pixen 32x32, view=side (v2)
#   gato: dibujado por código (dibujos.py)
# Uso: python arte/pixellab/taller/armar_extra.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import dibujos  # noqa: E402
from muebles import abrir, guardar  # noqa: E402

guardar('IRON_GIANT_HEAD', 'Cabeza del gigante de hierro', abrir(AQUI, 'gigante.png'), 3, 3, backgroundTiles=1)
guardar('ROBOT_ARM', 'Brazo robot', abrir(AQUI, 'brazo.png'), 2, 2, backgroundTiles=1)
guardar('FLOOR_JACK', 'Gato hidráulico', dibujos.gato(), 2, 1)
