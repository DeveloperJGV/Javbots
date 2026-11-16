# Arma el mueble de los accesos (features/accesos), dibujado por código (sin PixelLab).
# Uso: python features/accesos/arte/armar.py
#   ACCESOS_MAP_TABLE  mesa de cartógrafo de piso 2x2 (la fila de arriba es fondo): un mapa de pergamino desplegado
#                      con una ruta punteada y montañitas, un rollo de mapa atrás, una brújula, una lupa y una vela en
#                      su platito. La vela está apagada en el PNG; la página le pinta la flama (y su parpadeo) cuando
#                      una de las páginas está prendida (webview/accesosFurniture.ts, coordenadas en
#                      webview/constants.ts: ACCESOS_FLAME_*). Clic en ella abre el panel de los accesos.
# Escribe features/accesos/assets/furniture/ACCESOS_MAP_TABLE/ (PNG + manifest.json) y las vistas
# vista_x8.png (apagada) y vista_prendida_x8.png (con la flama, solo para revisar el dibujo).
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
W, H = 32, 32


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


T = (0, 0, 0, 0)
# Madera: la misma paleta que BOOKSHELF / COLECCION_SHELF
CONTORNO = rgb('#301c1c')
MADERA = rgb('#885c47')
MADERA_CLARA = rgb('#b38857')
MADERA_BRILLO = rgb('#cfa86d')
MADERA_OSCURA = rgb('#5e3b2e')
SOMBRA = rgb('#000000', 70)
# Pergamino
PERGAMINO = rgb('#ead7a4')
PERGAMINO_LUZ = rgb('#f6e8c3')
PERGAMINO_SOMBRA = rgb('#c9ad74')
PERGAMINO_BORDE = rgb('#9c7b4a')
TINTA = rgb('#5a3a22')
RUTA = rgb('#b3322c')
RIO = rgb('#4f7fa8')
BOSQUE = rgb('#5d7a3a')
# Latón (brújula, platito de la vela, aro de la lupa)
LATON = rgb('#c99a3c')
LATON_LUZ = rgb('#ecc66a')
LATON_OSCURO = rgb('#7d5a22')
CRISTAL = rgb('#bfe3ee', 200)
CRISTAL_BRILLO = rgb('#ffffff', 230)
AGUJA = rgb('#d1262f')
# Vela (apagada: la flama la pone la página)
CERA = rgb('#efe6d2')
CERA_SOMBRA = rgb('#c8bca2')
PABILO = rgb('#2a2220')


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def mesa():
    im = Image.new('RGBA', (W, H), T)
    px = im.load()

    # Sombra en el piso
    rect(px, 2, 30, 29, 31, SOMBRA)

    # Patas (adelante, se ven completas; atrás, asoman bajo la tabla)
    for x0 in (3, 26):
        rect(px, x0, 22, x0 + 2, 30, CONTORNO)
        rect(px, x0 + 1, 22, x0 + 1, 29, MADERA)
    for x0 in (6, 23):
        rect(px, x0, 22, x0 + 1, 27, CONTORNO)
        px[x0, 22] = MADERA_OSCURA
    # Travesaño entre las patas de adelante
    rect(px, 5, 26, 26, 27, CONTORNO)
    rect(px, 5, 26, 26, 26, MADERA_OSCURA)

    # Tabla de la mesa (vista desde arriba, inclinada) y su canto
    rect(px, 1, 9, 30, 22, CONTORNO)
    rect(px, 2, 10, 29, 19, MADERA)
    rect(px, 2, 10, 29, 10, MADERA_BRILLO)
    rect(px, 2, 11, 29, 11, MADERA_CLARA)
    rect(px, 2, 20, 29, 21, MADERA_OSCURA)  # canto de enfrente
    rect(px, 2, 20, 29, 20, MADERA_CLARA)
    # Vetas
    for x, y, n in ((4, 14, 4), (21, 17, 5), (12, 18, 3)):
        rect(px, x, y, x + n - 1, y, MADERA_OSCURA)

    # Rollo de mapa atrás, a la izquierda (acostado sobre la tabla, asoma por arriba)
    rect(px, 3, 6, 13, 9, CONTORNO)
    rect(px, 4, 7, 12, 8, PERGAMINO)
    rect(px, 4, 7, 12, 7, PERGAMINO_LUZ)
    rect(px, 4, 8, 12, 8, PERGAMINO_SOMBRA)
    px[13, 7] = PERGAMINO_BORDE  # la punta enrollada
    px[13, 8] = PERGAMINO_SOMBRA
    rect(px, 8, 6, 8, 9, RUTA)  # el listón que lo amarra

    # Mapa de pergamino desplegado
    rect(px, 4, 11, 21, 19, PERGAMINO_BORDE)
    rect(px, 5, 12, 20, 18, PERGAMINO)
    rect(px, 5, 12, 20, 12, PERGAMINO_LUZ)
    rect(px, 12, 12, 12, 18, PERGAMINO_SOMBRA)  # doblez
    px[4, 11] = T  # esquinas un poco enrolladas
    px[21, 19] = MADERA_OSCURA
    px[21, 11] = PERGAMINO_LUZ
    # Montañitas (arriba a la izquierda)
    for x in (6, 9):
        px[x + 1, 13] = TINTA
        px[x, 14] = TINTA
        px[x + 2, 14] = TINTA
    # Bosquecito (abajo a la izquierda)
    for x, y in ((6, 17), (8, 17), (7, 16)):
        px[x, y] = BOSQUE
    # Río que baja por la derecha
    for x, y in ((19, 12), (19, 13), (20, 14)):
        px[x, y] = RIO
    # Ruta punteada de abajo a la izquierda hasta la X de arriba
    for x, y in ((9, 18), (11, 18), (13, 17), (14, 15)):
        px[x, y] = RUTA
    # La X
    for x, y in ((15, 13), (17, 13), (16, 14), (15, 15), (17, 15)):
        px[x, y] = RUTA
    px[14, 15] = PERGAMINO

    # Lupa en la orilla del mapa (aro de latón, cristal, mango hacia adelante)
    aro = [(18, 15), (19, 15), (20, 15), (17, 16), (21, 16), (17, 17), (21, 17), (18, 18), (19, 18), (20, 18)]
    for x, y in aro:
        px[x, y] = LATON_OSCURO
    rect(px, 18, 16, 20, 17, CRISTAL)
    px[18, 16] = CRISTAL_BRILLO
    for x, y in ((21, 18), (22, 19)):
        px[x, y] = CONTORNO
    px[22, 18] = MADERA_OSCURA

    # Brújula (adelante a la derecha)
    rect(px, 24, 15, 28, 19, CONTORNO)
    px[24, 15] = MADERA
    px[28, 15] = MADERA
    px[24, 19] = MADERA_OSCURA
    px[28, 19] = MADERA_OSCURA
    rect(px, 25, 16, 27, 18, LATON_LUZ)
    px[25, 16] = LATON
    px[27, 18] = LATON
    px[26, 16] = AGUJA  # norte
    px[26, 17] = CONTORNO
    px[26, 18] = PERGAMINO_LUZ  # sur

    # Vela en su platito (atrás a la derecha; sube a la fila de fondo)
    rect(px, 23, 11, 29, 13, CONTORNO)
    rect(px, 24, 12, 28, 12, LATON)
    px[24, 12] = LATON_LUZ
    rect(px, 24, 13, 28, 13, LATON_OSCURO)
    px[29, 12] = LATON_OSCURO  # asa
    rect(px, 24, 4, 28, 11, CONTORNO)
    rect(px, 25, 5, 27, 11, CERA)
    rect(px, 27, 6, 27, 11, CERA_SOMBRA)
    px[25, 5] = CERA_SOMBRA  # escurrido de cera
    px[24, 7] = CERA
    px[24, 8] = CERA_SOMBRA
    rect(px, 26, 3, 26, 4, PABILO)
    return im


# La flama, como la pinta la página (webview/constants.ts, ACCESOS_FLAME_A / _B / _GLOW): solo para la vista.
FLAMA_A = {(26, 0): '#fff2a8', (26, 1): '#ffd24a', (25, 1): '#ff9a2e', (27, 1): '#ff9a2e', (26, 2): '#ff7a1e'}
BRILLO = {(24, 3): '#ffd24a50', (28, 3): '#ffd24a50', (24, 9): '#ffd24a30', (28, 9): '#ffd24a30'}


def con_flama(im):
    out = im.copy()
    px = out.load()
    for (x, y), c in {**BRILLO, **FLAMA_A}.items():
        a = int(c[7:9], 16) if len(c) == 9 else 255
        base = px[x, y]
        if base[3] == 0 or a == 255:
            px[x, y] = rgb(c[:7], a)
    return out


def escribir(carpeta, im, manifest):
    d = MUEBLES / carpeta
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{carpeta}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    print('listo', carpeta, im.size)


def vista(im, nombre):
    fondo = Image.new('RGBA', (W + 4, H + 4), rgb('#6b4a32'))
    fondo.alpha_composite(im, (2, 2))
    fondo.resize((fondo.width * 8, fondo.height * 8), Image.NEAREST).save(AQUI / nombre)
    print('vista', AQUI / nombre)


if __name__ == '__main__':
    mueble = mesa()
    escribir('ACCESOS_MAP_TABLE', mueble, {
        'id': 'ACCESOS_MAP_TABLE',
        'name': 'Mesa de mapas',
        'category': 'misc',
        'canPlaceOnWalls': False,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': 1,
        'type': 'asset',
        'width': W,
        'height': H,
        'footprintW': 2,
        'footprintH': 2,
    })
    vista(mueble, 'vista_x8.png')
    vista(con_flama(mueble), 'vista_prendida_x8.png')
