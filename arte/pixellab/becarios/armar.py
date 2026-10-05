# Sala de becarios (cuarto de descanso): máquina de dulces.
#   originales/maquina_dulces.png  create_image_pixen 32x48, view=side (la azul, de 2 variantes)
# Uso: python arte/pixellab/becarios/armar.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir, guardar  # noqa: E402

guardar('VENDING_MACHINE', 'Máquina de dulces', abrir(AQUI, 'maquina_dulces.png'), 2, 3, backgroundTiles=1)
