# Rockola de la sala de musica: tres estilos intercambiables, misma huella 2x2 (32x32 px), groupId JUKEBOX.
#
#   originales/clasica_v1.png  create_image_pixen 32x32, view=side (v1 de 5)  -> JUKEBOX_CLASSIC
#   originales/retro_v4.png    create_image_pixen 32x32, view=side (v4 de 5)  -> JUKEBOX_RETRO
#   originales/digital_v1.png  create_image_pixen 32x32, view=side (v1 de 3)  -> JUKEBOX_MODERN
#
# Retoques por codigo:
#   - Clasica: los tubos de luz (lados + arco) se repintan en bandas de 3 px con EXACTAMENTE 3 colores
#     (TUBOS_CLASICA) para animarlos con kind 'cycle'. Contorno casi negro -> CONTORNO.
#   - Setentera: el panel ambar queda con 4 colores exactos (PANEL_RETRO); se une el naranja suelto.
#   - Digital: pantalla cuadrada de 8x8 en PANTALLA (ahi va la caratula), bocina limpia, tiras LED en
#     bandas de 2 px con 4 colores exactos (LED_DIGITAL) para 'cycle'. Contorno negro -> CONTORNO.
#
# Uso:  python arte/pixellab/musica/rockola/armar.py
# Escribe features/musica/assets/furniture/JUKEBOX_*/ (PNG + manifest.json) y vista_x6.png. No gasta generaciones.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
import muebles  # noqa: E402

muebles.MUEBLES = AQUI.parents[3] / 'features' / 'musica' / 'assets' / 'furniture'

CONTORNO = (27, 27, 34, 255)


def hexa(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


# Anillos de color para animar (en este orden; 'cycle' los rota un lugar por paso)
TUBOS_CLASICA = ['#ff5ffd', '#ffc94a', '#4fe3f0']  # rosa, ambar, cian
PANEL_RETRO = ['#c13c04', '#fa560b', '#f06f08', '#ffd268']  # borde, naranja, franja, foco amarillo
LED_DIGITAL = ['#f500ef', '#ac00f2', '#43f2ff', '#02acea']  # magenta, violeta, cian, azul
PANTALLA = (12, 7, 8, 8)  # x, y, ancho, alto (px del PNG de 32x32) de la pantalla de la digital


def abrir(nombre):
    return Image.open(AQUI / 'originales' / nombre).convert('RGBA')


def suavizar_contorno(im, umbral=40):
    """La orilla casi negra pura (la que toca transparencia) pasa a CONTORNO, como el resto de los muebles."""
    px = im.load()
    w, h = im.size
    cambiar = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r + g + b < umbral:
                vecinos = ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if any(not (0 <= u < w and 0 <= v < h) or px[u, v][3] == 0 for u, v in vecinos):
                    cambiar.append((x, y))
    for p in cambiar:
        px[p] = CONTORNO
    return im


# --- Clasica -------------------------------------------------------------------------------------------
TUBO_ORIGINAL = {'cc0b00', 'c50b00', 'e55100', 'd72e00', 'fd05c8', 'ff5ffd', 'dfaf40', 'e0bb51', 'de9f2d'}


def clasica():
    im = abrir('clasica_v1.png')
    px = im.load()
    # el tubo de cada lado es continuo de la fila 8 a la 25 (tenia huecos oscuros); hueco del arco arriba
    tubo = set()
    for y in range(32):
        for x in range(32):
            p = px[x, y]
            if p[3] and '%02x%02x%02x' % p[:3] in TUBO_ORIGINAL:
                tubo.add((x, y))
    for y in range(8, 26):
        tubo.add((6, y))
        tubo.add((25, y))
    tubo.add((16, 2))
    ring = [hexa(c) for c in TUBOS_CLASICA]
    for x, y in tubo:
        # recorrido: sube por el lado y da vuelta por el arco hacia el centro
        s = (30 - y) + (15.5 - abs(x - 15.5))
        px[x, y] = ring[int(s // 3) % 3]
    return suavizar_contorno(im)


# --- Setentera -----------------------------------------------------------------------------------------
def retro():
    im = abrir('retro_v4.png')
    px = im.load()
    for y in range(32):
        for x in range(32):
            if px[x, y][3] and px[x, y][:3] == (0xee, 0x70, 0x07):
                px[x, y] = hexa('#f06f08')
    return im


# --- Digital -------------------------------------------------------------------------------------------
CUERPO = hexa('#201c32')
CUERPO_2 = hexa('#221e34')
BISEL = hexa('#02010d')
REJILLA = (hexa('#373649'), hexa('#110c23'))
# brillo de reposo de la pantalla (arriba -> abajo); colores que no estan en LED_DIGITAL
PANTALLA_GRADIENTE = ['#2a2a78', '#33349a', '#3d42b8', '#4652cc', '#4f62dc', '#5a74e8', '#6688f0', '#7299f4']


def digital():
    im = abrir('digital_v1.png')
    px = im.load()
    sx, sy, sw, sh = PANTALLA
    # bisel alrededor de la pantalla
    for x in range(sx - 1, sx + sw + 1):
        px[x, sy - 1] = BISEL
        px[x, sy + sh] = BISEL
    for y in range(sy - 1, sy + sh + 1):
        px[sx - 1, y] = BISEL
        px[sx + sw, y] = BISEL
    for j in range(sh):
        for i in range(sw):
            px[sx + i, sy + j] = hexa(PANTALLA_GRADIENTE[j])
    # cuerpo de abajo: liso, con una bocina de rejilla horizontal (quita los botones de maquinita)
    for y in range(sy + sh + 1, 28):
        for x in range(11, 21):
            px[x, y] = CUERPO_2 if x in (11, 20) else CUERPO
    for y in range(19, 27):
        for x in range(12, 20):
            px[x, y] = REJILLA[(y - 19) % 2]
    for x in range(12, 20):  # marco de la bocina
        px[x, 18] = CUERPO_2
    # tiras LED continuas en x=10 y x=21, filas 3..27, bandas de 2 px
    ring = [hexa(c) for c in LED_DIGITAL]
    for y in range(3, 28):
        for x in (10, 21):
            px[x, y] = ring[((27 - y) // 2) % 4]
    return suavizar_contorno(im)


def piso(w, h):
    """Piso de madera oscura para las vistas previas (tablas de 4 px con junta)."""
    im = Image.new('RGBA', (w, h))
    px = im.load()
    tonos = [(58, 40, 30, 255), (64, 45, 33, 255), (54, 37, 28, 255)]
    for y in range(h):
        tabla = y // 4
        for x in range(w):
            if y % 4 == 3 or (x + tabla * 11) % 24 == 0:
                px[x, y] = (38, 26, 20, 255)
            else:
                px[x, y] = tonos[tabla % 3]
    return im


def vista(ims, salida, escala=6, sep=8):
    w = sep + sum(i.width + sep for i in ims)
    h = max(i.height for i in ims) + 2 * sep
    fondo = piso(w, h)
    x = sep
    for i in ims:
        fondo.alpha_composite(i, (x, sep))
        x += i.width + sep
    fondo.resize((w * escala, h * escala), Image.NEAREST).save(salida)
    print('vista', salida)


if __name__ == '__main__':
    piezas = [
        ('JUKEBOX_CLASSIC', 'Rockola clásica', clasica()),
        ('JUKEBOX_RETRO', 'Rockola setentera', retro()),
        ('JUKEBOX_MODERN', 'Rockola digital', digital()),
    ]
    for id_, nombre, im in piezas:
        muebles.guardar(id_, nombre, im, 2, 2, backgroundTiles=1, groupId='JUKEBOX')
    vista([im for _, _, im in piezas], AQUI / 'vista_x6.png')
