# Archivo Jedi (homenaje a Star Wars, sin logos ni nombres).
#   originales/*.png  create_image_pixen, view=side, no_background, 32×32
#     estante.png            estante de holocrones (reemplaza los libreros)
#     consola.png            consola de archivo
#     mesa_holo.png          mesa holográfica (seed 51); el disco que puso arriba se cambia por una galaxia
#     fantasma_capucha.png   espíritu encapuchado (seed 43), 18 px de ancho -> se recorta a 16
#     fantasma_barba.png     espíritu anciano (seed 42), cabe en 16
#     brasero.png            brasero de piedra con flama azul (seed 71), 20 px -> se le quitan 4 columnas del centro
#     cojin.png              cojín de meditación 16×16 (seed 1): ASIENTO (category chairs, mira a la mesa de al lado)
#     mesa_estudio.png       mesa de estudio de piedra con libro, vela y tableta (seed 3): escritorio (isDesk)
#   Dibujado por código (dibujos.py): sables de luz (estante + vitrina roja) y el droide astromecánico.
#   Las piezas privadas viven fuera de git (arte/privado/).
# Uso: python arte/pixellab/jedi/armar.py
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
from muebles import abrir, guardar, recortar_ancho  # noqa: E402
from dibujos import (a_espiritu, angostar, centrar, cerrar_orillas, droide, estante_sables,  # noqa: E402
                     holograma, vitrina_sable_rojo)

guardar('HOLOCRON_SHELF', 'Estante de holocrones', abrir(AQUI, 'estante.png'), 2, 2, category='wall',
        canPlaceOnWalls=True)
guardar('ARCHIVE_CONSOLE', 'Consola de archivo', abrir(AQUI, 'consola.png'), 2, 2, backgroundTiles=1)

# Pared
guardar('LIGHTSABER_RACK', 'Sables de luz', estante_sables(), 2, 2, category='wall', canPlaceOnWalls=True)
guardar('LIGHTSABER_RED', 'Sable rojo', vitrina_sable_rojo(), 1, 2, category='wall', canPlaceOnWalls=True)

# Piso
guardar('HOLO_TABLE', 'Mesa holográfica', holograma(abrir(AQUI, 'mesa_holo.png')), 2, 2, backgroundTiles=1, isDesk=True)
guardar('JEDI_STUDY_TABLE', 'Mesa de estudio', abrir(AQUI, 'mesa_estudio.png'), 2, 2, backgroundTiles=1, isDesk=True)
guardar('JEDI_CUSHION', 'Cojín de meditación', abrir(AQUI, 'cojin.png'), 1, 1, category='chairs')
guardar('ASTROMECH_DROID', 'Droide astromecánico', droide(), 1, 2, category='decor', backgroundTiles=1)
guardar('JEDI_GHOST_HOOD', 'Espíritu encapuchado',
        a_espiritu(cerrar_orillas(recortar_ancho(abrir(AQUI, 'fantasma_capucha.png'), 16))), 1, 2,
        category='decor', backgroundTiles=1)
guardar('JEDI_GHOST_ELDER', 'Espíritu anciano', a_espiritu(centrar(abrir(AQUI, 'fantasma_barba.png'), 16, 32)),
        1, 2, category='decor', backgroundTiles=1)
guardar('JEDI_BRAZIER', 'Brasero azul', centrar(angostar(abrir(AQUI, 'brasero.png'), 14, 4), 16, 32), 1, 2,
        category='decor', backgroundTiles=1)
