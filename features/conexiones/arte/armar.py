# Arma el tablero de conexiones (features/conexiones), dibujado por código.
# Uso: python features/conexiones/arte/armar.py
#   CONNECTIONS_RACK  rack de piso 1x2 con 12 focos de 2x2 (2 columnas x 6 filas); en cada fila un cable de color une
#                     dos conectores. Los focos van apagados: la página prende cada uno con el estado de su conexión.
# Las posiciones de los focos tienen que coincidir con RACK_LEDS en features/conexiones/webview/constants.ts.
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
VISTAS = AQUI / 'vistas'


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


CONTORNO = rgb('#14161c')
MARCO = rgb('#3a3f4b')
MARCO_CLARO = rgb('#5a6172')
PANEL = rgb('#22252e')
RANURA = rgb('#0b0c10')
TORNILLO = rgb('#8a92a6')
ETIQUETA = rgb('#d8d2bc')
ETIQUETA_TEXTO = rgb('#6b6455')
FOCO_APAGADO = rgb('#2b2b2b')
CABLES = [rgb('#e8475f'), rgb('#4fb3ff'), rgb('#ffd04a'), rgb('#5fd38a'), rgb('#c47bff'), rgb('#ff8a3d')]
PATA = rgb('#1c1e24')

# Focos: (x, y) del pixel de arriba a la izquierda de cada foco de 2x2, en orden (columna izquierda, luego derecha)
COLUMNAS = (3, 11)
FILA0, PASO = 8, 3
FOCOS = [(x, FILA0 + i * PASO) for x in COLUMNAS for i in range(6)]


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def rack():
    im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    px = im.load()
    # Cuerpo
    rect(px, 1, 2, 14, 29, CONTORNO)
    rect(px, 2, 3, 13, 28, MARCO)
    rect(px, 2, 3, 13, 3, MARCO_CLARO)
    rect(px, 2, 3, 2, 28, MARCO_CLARO)
    # Etiqueta arriba
    rect(px, 3, 4, 12, 6, ETIQUETA)
    for x in (4, 5, 7, 8, 9, 11):
        px[x, 5] = ETIQUETA_TEXTO
    # Panel de conectores
    rect(px, 3, 7, 12, 25, PANEL)
    for x, y in FOCOS:
        rect(px, x, y, x + 1, y + 1, FOCO_APAGADO)
    # Un cable por fila: de un conector a otro, colgando un poco
    for i in range(6):
        y = FILA0 + i * PASO
        c = CABLES[i % len(CABLES)]
        px[6, y] = RANURA
        px[9, y] = RANURA
        for x, yy in ((6, y + 1), (7, y + 2), (8, y + 2), (9, y + 1)):
            px[x, yy] = c
    # Tornillos
    for x, y in ((3, 26), (12, 26), (3, 27), (12, 27)):
        px[x, y] = TORNILLO
    # Patas
    rect(px, 2, 29, 3, 30, PATA)
    rect(px, 12, 29, 13, 30, PATA)
    return im


def guardar(nombre, im, manifest):
    d = MUEBLES / nombre
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{nombre}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    VISTAS.mkdir(parents=True, exist_ok=True)
    im.resize((im.width * 10, im.height * 10), Image.NEAREST).save(VISTAS / f'{nombre}.png')


guardar('CONNECTIONS_RACK', rack(), {
    'id': 'CONNECTIONS_RACK',
    'type': 'asset',
    'canPlaceOnWalls': False,
    'canPlaceOnSurfaces': False,
    'backgroundTiles': 1,
    'width': 16,
    'height': 32,
    'footprintW': 1,
    'footprintH': 2,
    'name': 'Tablero de conexiones',
    'category': 'electronics',
})
print('focos', FOCOS)
