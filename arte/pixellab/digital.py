# Relojes digitales (sin manecillas): el usuario los prefiere digitales siempre.
#
# Los dígitos son de 3x5 (la misma letra que MANDO_CLOCK). El PNG trae una hora fija (09:30); en la oficina la hora
# real la pinta webview-ui/src/office/effects/ambientFurniture.ts (kind 'digital'), con las MISMAS posiciones que aquí:
# si mueves un dígito en este archivo, muévelo también allá (DIGITAL_SPECS).
#
#   RELOJ_DIGITAL        16x32, de pared (1x2, como CLOCK): caja gris, dígitos cyan, horas arriba y minutos abajo.
#   DIRECTORIO_CLOCK     16x16: el de latón del Directorio, ahora digital (dígitos ámbar).
#   POMODORO_TIMER_WALL  32x32: al jitomate de pared se le cambia la carátula por una pantalla (dígitos rojos).
#
# Uso:  python arte/pixellab/digital.py   (escribe RELOJ_DIGITAL; los otros dos los usan directorio/ y pomodoro/armar.py)
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

T = (0, 0, 0, 0)

FUENTE = {
    '0': ['###', '#.#', '#.#', '#.#', '###'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '###', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'],
    '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '..#', '..#', '..#'],
    '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'],
}


def hex_(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def digito(im, x, y, d, prendido, apagado):
    for dy, fila in enumerate(FUENTE[d]):
        for dx, ch in enumerate(fila):
            im.putpixel((x + dx, y + dy), prendido if ch == '#' else apagado)


def apilado(im, x, y, prendido, apagado, hora='0930'):
    """Horas arriba y minutos abajo: dígitos en (x, y), (x+4, y), (x, y+7), (x+4, y+7)."""
    for (dx, dy), d in zip(((0, 0), (4, 0), (0, 7), (4, 7)), hora):
        digito(im, x + dx, y + dy, d, prendido, apagado)


def caja(w, h, y0, contorno, marco, pantalla):
    """Caja de 13x16 (x=2..14) con pantalla de 9x14 (x=4..12, y0+1..y0+14) en un lienzo w x h."""
    im = Image.new('RGBA', (w, h), T)
    for y in range(y0, y0 + 16):
        for x in range(2, 15):
            borde = x in (2, 14) or y in (y0, y0 + 15)
            im.putpixel((x, y), contorno if borde else marco if x in (3, 13) else pantalla)
    return im


# Gris como el reloj del cuarto de mando.
GRIS = dict(contorno=hex_('14161c'), marco=hex_('3a3f4b'), pantalla=hex_('0b1a2b'), digito=hex_('22d3ee'))
# Latón del Directorio.
LATON = dict(contorno=hex_('29101f'), marco=hex_('b97448'), pantalla=hex_('1c0e0a'), digito=hex_('ffb347'))


def reloj_digital():
    """RELOJ_DIGITAL: 16x32, la caja en y=5..20 (donde CLOCK tenía la carátula); dígitos en (5,7) y (9,7)."""
    c = GRIS
    im = caja(16, 32, 5, c['contorno'], c['marco'], c['pantalla'])
    apilado(im, 5, 7, c['digito'], c['pantalla'])
    return im


def reloj_laton():
    """DIRECTORIO_CLOCK: 16x16, la caja en y=0..15, con brillo de latón arriba; dígitos en (5,2) y (9,2)."""
    c = LATON
    im = caja(16, 16, 0, c['contorno'], c['marco'], c['pantalla'])
    for x in range(4, 13):
        im.putpixel((x, 1), hex_('c78555'))  # brillo del latón sobre la pantalla
    apilado(im, 5, 2, c['digito'], c['pantalla'])
    return im


JITOMATE_BISEL = hex_('a8a9bf')
JITOMATE_PANTALLA = hex_('1d1d22')
JITOMATE_DIGITO = hex_('ff6b5a')


def jitomate_digital(im):
    """Al jitomate de pared (32x32) le quita la carátula de manecillas: bisel gris y pantalla en x=11..20, y=13..25;
    dígitos en (13,14) y (17,14)."""
    im = im.copy()
    bisel = JITOMATE_BISEL[:3]
    for y in range(12, 27):
        xs = [x for x in range(im.width) if im.getpixel((x, y))[:3] == bisel]
        if len(xs) < 2:
            continue
        for x in range(min(xs), max(xs) + 1):
            im.putpixel((x, y), JITOMATE_BISEL)
    for y in range(13, 26):
        for x in range(11, 21):
            im.putpixel((x, y), JITOMATE_PANTALLA)
    apilado(im, 13, 14, JITOMATE_DIGITO, JITOMATE_PANTALLA)
    return im


def main():
    from muebles import guardar
    guardar('RELOJ_DIGITAL', 'Reloj digital (pared)', reloj_digital(), 1, 2, category='wall', canPlaceOnWalls=True)


if __name__ == '__main__':
    main()
