# Azotea, piezas extra (tanda A, 2026-11-03): huerto de chef, rincón de té, laboratorio de plantas raras y estanque.
# Originales en originales_extra/ (lista de trabajos en originales_extra/trabajos.txt). Todos create_image_pixen,
# view=side, plantilla de muebles de frente (PIXELLAB.md §3), 2 variantes por pieza (sin seed y seed=7).
#
#   chile_2            32x32 (v2 de 2)  la v1 se leía como arbusto de bayas
#   jitomate_1         32x32 (v1 de 2)  -> recorte a 16 de ancho (1x2)
#   albahaca_1         20x20 (v1 de 2)  -> 1x1 quitando una fila repetida de la maceta
#   cosecha_2          48x32 (v2 de 2)  se borra el jitomate suelto que pintó bajo la mesa
#   huevo_2            32x48 (v2 de 2)  la v1 llenaba el lienzo
#   pergola_te_2       48x48 (v2 de 2)  -> recorte a 32 de ancho (2x3); la v1 era más chata que un agente
#   te_mesa_3          32x32 (3.er intento) la 1 tenía la tetera enorme y la 2 salió isométrica
#   vitrina_*_2        32x48 (seed 7: las tres salen del mismo mueble) + placa de latón con etiqueta por código
#   koi_2              48x32 (v2 de 2)
#   fuente_1           32x32 (v1 de 2)
#
# Uso:  python arte/pixellab/jardin/armar_extra.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y vista_extra_x4.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import al_piso, guardar, limpiar, recortar_ancho  # noqa: E402

ORIGINALES = AQUI / 'originales_extra'


def abrir(nombre):
    return limpiar(Image.open(ORIGINALES / nombre).convert('RGBA'))


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def piso(nombre):
    im = abrir(nombre)
    return al_piso(im, im.height - 1)


def en_lienzo(im, w, h):
    """Lo dibujado, abajo al centro de un lienzo de w x h (sin escalar)."""
    pieza = im.crop(im.getbbox())
    assert pieza.width <= w and pieza.height <= h, (pieza.size, w, h)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - pieza.height))
    return out


def sin_fila_repetida(im):
    """Quita la fila de la mitad de abajo (cuerpo de una maceta) que más se parece a la siguiente, para que la pieza
    mida 1 px menos de alto sin escalar."""
    pieza = im.crop(im.getbbox())
    filas = [[pieza.getpixel((x, y)) for x in range(pieza.width)] for y in range(pieza.height)]

    def diferencia(y):
        return sum(a != b for a, b in zip(filas[y], filas[y + 1]))

    y = min(range(pieza.height // 2, pieza.height - 2), key=diferencia)
    out = Image.new('RGBA', (pieza.width, pieza.height - 1), (0, 0, 0, 0))
    out.alpha_composite(pieza.crop((0, 0, pieza.width, y)), (0, 0))
    out.alpha_composite(pieza.crop((0, y + 1, pieza.width, pieza.height)), (0, y))
    return out


# ── Piezas ───────────────────────────────────────────────────────────────────────────────────────────────────────

def jitomate():
    return al_piso(recortar_ancho(abrir('jitomate_1.png'), 16), 31)


def albahaca():
    return en_lienzo(sin_fila_repetida(abrir('albahaca_1.png')), 16, 16)


def cosecha():
    im = abrir('cosecha_2.png')
    px = im.load()
    for y in range(24, 31):  # el jitomate suelto que pintó bajo la mesa, entre las patas
        for x in range(15, 33):
            px[x, y] = (0, 0, 0, 0)
    return al_piso(im, 31)


def pergola():
    return al_piso(recortar_ancho(abrir('pergola_te_2.png'), 32), 47)


def mesa_te():
    return en_lienzo(abrir('te_mesa_3.png'), 32, 16)


LATON = rgb('#d4a72c')
LATON_CLARO = rgb('#f0cf6a')
LATON_OSCURO = rgb('#6e5210')


def placa(im, y, renglon):
    """Placa de latón de 10x3 al centro del cajón de la vitrina; `renglon` = largo de la 'letra' grabada (la
    etiqueta se lee distinta en cada vitrina sin escribir texto)."""
    px = im.load()
    x0 = 11
    for x in range(x0, x0 + 10):
        for dy in range(3):
            borde = dy in (0, 2) or x in (x0, x0 + 9)
            px[x, y + dy] = LATON_OSCURO if borde else LATON
    for x in range(x0 + 1, x0 + 9):  # brillo arriba
        px[x, y] = LATON_CLARO
    for x in range(x0 + 2, x0 + 2 + renglon):
        px[x, y + 1] = LATON_OSCURO
    return im


def vitrina(nombre, y_placa, renglon):
    return placa(al_piso(abrir(nombre), 47), y_placa, renglon)


D = dict(category='decor', backgroundTiles=1)
PIEZAS = [
    # ── Huerto de chef ──
    ('JARDIN_CHILI_POT', 'Chiles en maceta', lambda: piso('chile_2.png'), 2, 2, D),
    ('JARDIN_TOMATO_STAKE', 'Jitomatera con tutor', jitomate, 1, 2, D),
    ('JARDIN_BASIL', 'Albahaca', albahaca, 1, 1, dict(category='decor')),
    ('JARDIN_HARVEST_TABLE', 'Mesa de cosecha', cosecha, 3, 2, dict(category='storage', backgroundTiles=1)),
    # ── Rincón de té ──
    ('JARDIN_TEA_PERGOLA', 'Pérgola de glicinas', pergola, 2, 3, dict(category='decor', backgroundTiles=2)),
    ('JARDIN_EGG_CHAIR', 'Sillón colgante de mimbre', lambda: piso('huevo_2.png'), 2, 3,
     dict(category='misc', backgroundTiles=2)),
    ('JARDIN_TEA_TABLE', 'Mesita de té', mesa_te, 2, 1, dict(category='misc')),
    # ── Laboratorio de plantas raras ──
    ('JARDIN_VITRINE_CARNIVORE', 'Vitrina de carnívoras', lambda: vitrina('vitrina_carnivoras_2.png', 42, 4), 2, 3,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_VITRINE_ORCHID', 'Vitrina de orquídeas', lambda: vitrina('vitrina_orquideas_2.png', 42, 6), 2, 3,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_VITRINE_BONSAI', 'Vitrina de bonsáis', lambda: vitrina('vitrina_bonsais_2.png', 41, 5), 2, 3,
     dict(category='decor', backgroundTiles=2)),
    # ── Estanque ──
    ('JARDIN_KOI_POND', 'Estanque de kois', lambda: piso('koi_2.png'), 3, 2, D),
    ('JARDIN_FOUNTAIN', 'Fuente de piedra', lambda: piso('fuente_1.png'), 2, 2, D),
]


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    k = 4
    ancho = sum(i.width * k + 8 for i in hechas) + 8
    alto = max(i.height for i in hechas) * k + 16
    hoja = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
    x = 8
    for i in hechas:
        hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
        x += i.width * k + 8
    hoja.save(AQUI / 'vista_extra_x4.png')
    print(len(hechas), 'piezas; vista en', AQUI / 'vista_extra_x4.png')


if __name__ == '__main__':
    main()
