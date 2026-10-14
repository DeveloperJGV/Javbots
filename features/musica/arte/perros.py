# Hunter y Tango corriendo: la tira del loader de las letras.
# Lee las hojas de las mascotas (arte/privado/assets/pets/<perro>/pet.png: 96x96, la fila de abajo = de lado,
# 3 cuadros de 32 px viendo a la derecha) y escribe features/musica/webview/assets/perros-corriendo.png:
# una fila por perro (Hunter arriba, Tango abajo) con la secuencia de caminar 0,1,0,2 (como PET_WALK_SEQUENCE).
# Uso: python features/musica/arte/perros.py
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
PERROS = ['hunter', 'tango']
SECUENCIA = [0, 1, 0, 2]
CUADRO = 32

hoja = Image.new('RGBA', (CUADRO * len(SECUENCIA), CUADRO * len(PERROS)), (0, 0, 0, 0))
for fila, perro in enumerate(PERROS):
    pet = Image.open(REPO / 'arte' / 'privado' / 'assets' / 'pets' / perro / 'pet.png').convert('RGBA')
    for i, cuadro in enumerate(SECUENCIA):
        hoja.alpha_composite(pet.crop((cuadro * CUADRO, 2 * CUADRO, (cuadro + 1) * CUADRO, 3 * CUADRO)), (i * CUADRO, fila * CUADRO))
salida = REPO / 'features' / 'musica' / 'webview' / 'assets' / 'perros-corriendo.png'
hoja.save(salida)
print('ok', salida.relative_to(REPO), hoja.size)
