# Boletos de concierto (sala de música, "Mis próximos conciertos"), 16×16, van sobre el mostrador junto a la radio.
# originales/boletos_1.png: create_image_pixen 16x16, view=side, seed 11 (la única de 4 que se lee como boleto:
# inclinado, con zigzag rosa). Se baja al piso para que se apoye en la cubierta.
# Un clic abrirá los próximos conciertos (se programa aparte).
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
from muebles import guardar  # noqa: E402


def al_piso(im):
    """Baja el dibujo hasta la última fila (PixelLab lo deja flotando)."""
    caja = im.getbbox()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im.crop(caja), (caja[0], im.height - (caja[3] - caja[1])))
    return out


def boletos():
    return al_piso(Image.open(AQUI / 'originales' / 'boletos_1.png').convert('RGBA'))


if __name__ == '__main__':
    guardar('CONCERT_TICKETS', 'Boletos de concierto', boletos(), 1, 1, category='decor', canPlaceOnSurfaces=True)
