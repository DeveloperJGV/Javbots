# Pedestal del Anillo (El Señor de los Anillos). originales/pedestal.png: create_image_pixen 32x32, view=side
# Uso: python arte/pixellab/anillo/armar.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, guardar  # noqa: E402

guardar('RING_PEDESTAL', 'Pedestal del Anillo', abrir(AQUI, 'pedestal.png'), 2, 2, backgroundTiles=1)
