# Sótano de Isaac (homenaje a The Binding of Isaac). Sin logos y sin popó.
#   originales/*.png  create_image_pixen, view=side, no_background
#     isaac 16x16, pedestal 32x32, cofre 16x16 (sesión anterior)
#     puerta 32x32, antorcha 32x32, bomba 16x16, roca 16x16, cebolla 16x16, fogata 16x16
#   dibujados por código (dibujos.py): trampilla, monedas y llave, manchas de lágrimas
# Uso: python arte/pixellab/sotano/armar.py
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import dibujos  # noqa: E402
from muebles import a_piedra, abrir, guardar, recortar_ancho  # noqa: E402

guardar('ISAAC', 'Isaac llorando', abrir(AQUI, 'isaac.png'), 1, 1)
pedestal = recortar_ancho(abrir(AQUI, 'pedestal.png'), 16)
guardar('HEART_PEDESTAL', 'Pedestal con corazón', pedestal, 1, 2, backgroundTiles=1)
guardar('ISAAC_CHEST', 'Cofre', abrir(AQUI, 'cofre.png'), 1, 1)
guardar('TRAPDOOR', 'Trampilla', dibujos.trampilla(), 2, 2, backgroundTiles=2)

# Puerta del sótano: madera con marco de piedra (la piedra azulada se pasa a gris tibio).
guardar('BASEMENT_DOOR', 'Puerta del sótano', dibujos.entibiar_piedra(abrir(AQUI, 'puerta.png')), 2, 2,
        category='wall', canPlaceOnWalls=True)
# Antorcha de pared: el lienzo de 32 se recorta a 16 de ancho (sin reducir); el soporte azulado pasa a fierro gris.
antorcha = dibujos.entibiar_piedra(recortar_ancho(abrir(AQUI, 'antorcha.png'), 16), (96, 94, 96))
guardar('BASEMENT_TORCH', 'Antorcha', antorcha, 1, 2,
        category='wall', canPlaceOnWalls=True)

# Bomba: PixelLab la dejó hueca por dentro; se rellena de gris carbón.
bomba = dibujos.rellenar_hueco(abrir(AQUI, 'bomba.png'), 8, 10, (46, 46, 56, 255))
guardar('ISAAC_BOMB', 'Bomba', bomba, 1, 1)

# Rocas del sótano: piedra gris tibia; la "marcada" lleva una X azul.
roca = a_piedra(abrir(AQUI, 'roca.png'), (120, 112, 104))
guardar('BASEMENT_ROCK', 'Roca', roca, 1, 1)
guardar('BASEMENT_ROCK_MARKED', 'Roca marcada', dibujos.marcar_roca(roca), 1, 1)

# Pedestal con la cebolla triste flotando: la base del pedestal del corazón + la cebolla arriba.
cebolla_ped = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
cebolla_ped.alpha_composite(pedestal.crop((0, 17, 16, 32)), (0, 17))
cebolla_ped.alpha_composite(abrir(AQUI, 'cebolla.png'), (0, 1))
guardar('ONION_PEDESTAL', 'Pedestal con cebolla triste', cebolla_ped, 1, 2, backgroundTiles=1)

guardar('BASEMENT_FIRE', 'Fogata', abrir(AQUI, 'fogata.png'), 1, 1)

# Cosas planas del piso: se puede caminar encima (backgroundTiles=1).
guardar('ISAAC_COINS', 'Monedas y llave', dibujos.monedas(), 1, 1, backgroundTiles=1)
guardar('TEAR_STAINS', 'Manchas de lágrimas', dibujos.lagrimas(), 1, 1, backgroundTiles=1)
