"""Hoja del Moogle (comodín): flota como Wheatley, sin caminar. Mismo formato que armar.py (8 cuadros de 24x44 x 3
direcciones). Sale de 2 imágenes de PixelLab (moogle/frente_b.png y moogle/lado_c.png); la espalda es el frente sin
cara. Todo el movimiento es por código:
  - caminar: sube y baja (0, -1, -2, -1 px) y aletea (las alas suben 1 px en los pasos 2 y 4);
  - teclear: vaivén de 1 px aleteando; leer: quieto con una hojita entre las manos (de espaldas no se ve la hoja).
Uso: python armar_moogle.py   -> moogle/hoja.png y moogle/hoja_x8.png
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent / 'moogle'
W, H = 24, 44
ABAJO = 33  # última fila del cuerpo: flota un poco más abajo que Wheatley (es bajito)
FONDO = (70, 70, 90, 255)
PELO = (247, 231, 202, 255)
PAPEL = (236, 228, 204, 255)
PAPEL_RENGLON = (150, 140, 120, 255)
PAPEL_BORDE = (60, 50, 50, 255)


def es_ala(c):
    r, g, b, a = c
    return a and r > 50 and g < 45 and b > 25  # magentas/morados de las alas (y vino oscuro de lado)


def es_cara(c):
    """Ojos, boca, nariz y chapitas del frente (para la espalda)."""
    r, g, b, a = c
    if not a:
        return False
    oscuro_cara = r < 70 and 10 < g < 25 and b < 35 and r > 40  # (58, 16, 29) ojos y boca
    rosa = r > 230 and 80 < g < 170 and 60 < b < 180  # chapitas y lengua
    return oscuro_cara or rosa


def espalda(frente):
    out = frente.copy()
    px = out.load()
    top = out.getbbox()[1]
    for y in range(top + 9, out.height):  # debajo del pompón y del tallo
        for x in range(out.width):
            c = px[x, y]
            # la raya oscura entre los ojos (tallo que baja) también es cara
            if es_cara(c) or (c[:3] == (112, 21, 74) and y > top + 9):
                px[x, y] = PELO
    return out


def aletear(im, lado=False):
    """Las alas suben 1 px (lo que dejan abajo se borra si era fondo de ala)."""
    out = im.copy()
    src, dst = im.load(), out.load()
    alas = [(x, y) for y in range(im.height) for x in range(im.width) if es_ala(src[x, y])]
    # solo las alas de los lados (lejos del centro): el tallo y la nariz quedan
    cx = im.width // 2
    alas = [(x, y) for x, y in alas if (x < cx - 2 if lado else abs(x - cx) >= 4)]  # de lado el ala va atrás
    for x, y in alas:
        if (x, y + 1) not in alas:
            dst[x, y] = (0, 0, 0, 0) if not src[x, y + 1][3] or es_ala(src[x, y + 1]) else src[x, y]
    for x, y in alas:
        if y > 0:
            dst[x, y - 1] = src[x, y]
    return out


def hoja_papel(im, ancho):
    out = im.copy()
    px = out.load()
    x0, _, x1, y1 = out.getbbox()
    x = (x0 + x1) // 2 - ancho // 2
    y = y1 - 7
    for yy in range(y, y + 5):
        for xx in range(x, x + ancho):
            borde = xx in (x, x + ancho - 1) or yy in (y, y + 4)
            px[xx, yy] = PAPEL_BORDE if borde else (PAPEL_RENGLON if (yy - y) % 2 == 0 else PAPEL)
    return out


def a_cuadro(im, dy):
    x0, y0, x1, y1 = im.getbbox()
    pieza = im.crop((x0, y0, x1, y1))
    cuadro = Image.new('RGBA', (W, H))
    cuadro.alpha_composite(pieza, ((W - pieza.width) // 2, ABAJO - pieza.height + dy))
    return cuadro


def main():
    frente = Image.open(AQUI / 'frente_b.png').convert('RGBA')
    lado = Image.open(AQUI / 'lado_c.png').convert('RGBA')
    hoja = Image.new('RGBA', (W * 8, H * 3))
    for fila, im in enumerate((frente, espalda(frente), lado)):
        arriba = aletear(im, lado=fila == 2)
        cuadros = [a_cuadro(im, 0), a_cuadro(arriba, -1), a_cuadro(im, -2), a_cuadro(arriba, -1)]  # caminar
        cuadros += [a_cuadro(im, 0), a_cuadro(arriba, -1)]  # teclear
        if fila == 1:
            cuadros += [a_cuadro(im, 0), a_cuadro(arriba, 0)]  # leer de espaldas: la hoja no se ve
        else:
            con_hoja = hoja_papel(im, 6 if fila == 0 else 3)
            cuadros += [a_cuadro(con_hoja, 0), a_cuadro(aletear(con_hoja, lado=fila == 2), 0)]
        for col, c in enumerate(cuadros):
            hoja.alpha_composite(c, (col * W, fila * H))
    hoja.save(AQUI / 'hoja.png')
    vista = Image.new('RGBA', hoja.size, FONDO)
    vista.alpha_composite(hoja)
    vista.resize((hoja.width * 8, hoja.height * 8), Image.NEAREST).save(AQUI / 'hoja_x8.png')
    print('moogle', hoja.size)


if __name__ == '__main__':
    main()
