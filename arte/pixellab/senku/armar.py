# Laboratorio de Senku (Dr. Stone): mesa con matraces, estante de frascos, pizarrón, bandera,
# estatuas petrificadas (homenajes), telescopio de bambú, rueda de agua y caja de cola.
#   originales/*.png  create_image_pixen, view=side
#   estatua.png: la estatua dorada de antes (STONE_STATUE), se deja por si se quiere conservar
#   estatua_<nombre>.png: figuras a color 32×32; se pasan a piedra con grietas por código (piedra.py)
#   pizarrón, bandera, rueda de agua y caja de cola: dibujados por código (dibujos.py)
# Uso: python arte/pixellab/senku/armar.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
import dibujos  # noqa: E402
import piedra  # noqa: E402
from muebles import a_piedra, abrir, guardar  # noqa: E402

guardar('SENKU_TABLE', 'Mesa de química', abrir(AQUI, 'mesa.png'), 2, 2, backgroundTiles=1)
guardar('SENKU_SHELF', 'Estante de frascos', abrir(AQUI, 'estante.png'), 2, 2, backgroundTiles=1)
guardar('STONE_STATUE', 'Estatua de piedra', a_piedra(abrir(AQUI, 'estatua.png')), 2, 2, backgroundTiles=1)
guardar('FORMULA_BOARD', 'Pizarrón de fórmulas', dibujos.pizarron(), 2, 2, category='wall', canPlaceOnWalls=True)
guardar('SCIENCE_FLAG', 'Bandera del Reino de la Ciencia', dibujos.bandera(), 2, 2, category='wall',
        canPlaceOnWalls=True)

# Estatuas petrificadas (homenajes, sin nombres ni logos). (id, nombre, original, semilla y número de grietas)
ESTATUAS = [
    ('STATUE_GOKU', 'Estatua del guerrero de pelo de punta', 'estatua_goku.png', 3, 3),
    # STATUE_TOTORO: ahora lo arma totoro_piedra.py (2×3, piedra cálida con base)
    ('STATUE_RANMA', 'Estatua del artista marcial de trenza', 'estatua_ranma.png', 7, 3),
    ('STATUE_LINK', 'Estatua del héroe de gorro verde', 'estatua_link.png', 11, 3),
    ('STATUE_MARIO', 'Estatua del plomero saltarín', 'estatua_mario.png', 13, 2),
    ('STATUE_KIRBY', 'Estatua de la bolita rosa', 'estatua_kirby.png', 17, 1),
    ('STATUE_CHIEF', 'Estatua del soldado de armadura', 'estatua_chief.png', 19, 3),
]
for id_, nombre, archivo, semilla, cuantas in ESTATUAS:
    guardar(id_, nombre, piedra.estatua(abrir(AQUI, archivo), semilla, cuantas), 2, 2, backgroundTiles=1)

guardar('SENKU_TELESCOPE', 'Telescopio de bambú', abrir(AQUI, 'telescopio.png'), 2, 2, backgroundTiles=1)
guardar('SENKU_WATERWHEEL', 'Rueda de agua con generador', dibujos.rueda(), 2, 2, backgroundTiles=1)
guardar('SENKU_COLA', 'Caja de cola de Senku', dibujos.cola(), 1, 1)
