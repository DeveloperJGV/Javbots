# Arma los muebles de la sala de GitHub (features/github), dibujados por código (cajas planas: salen mejor así).
# Uso: python features/github/arte/armar.py
#   GITHUB_CABINET  archivero 1x2 (madera). La página lo pinta de metal u oro según los commits del repo, le pone
#                   hojas encima, el foco verde si hubo push esta semana y la etiqueta roja si es privado.
#   GITHUB_GRAPH    tablero de pared 2x2 con la cuadrícula de contribuciones vacía (la página pinta los verdes).
#   GITHUB_PRS      corcho de pared 2x2 (la página pega una nota por PR abierto).
# Los colores tienen que coincidir con features/github/webview/constants.ts.
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
VISTAS = AQUI / 'vistas'


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


# Archivero (madera)
CONTORNO = rgb('#3a2418')
OSCURO = rgb('#6e442a')
MEDIO = rgb('#96603a')
CLARO = rgb('#ba804e')
BRILLO = rgb('#d6a468')
JALADERA = rgb('#e6d6aa')
ETIQUETA = rgb('#ece4ce')
RAYA = rgb('#968c78')
FOCO_APAGADO = rgb('#2b2b2b')
PATA = rgb('#3c2c24')

# Tablero de contribuciones
MARCO = rgb('#30363d')
MARCO_CLARO = rgb('#484f58')
FONDO = rgb('#0d1117')
CELDA = rgb('#161b22')

# Corcho
CORCHO = rgb('#b98a52')
CORCHO_OSCURO = rgb('#9c7040')
CORCHO_PUNTO = rgb('#a77c48')
MADERA = rgb('#6e442a')
MADERA_CLARA = rgb('#96603a')


def lienzo(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def archivero():
    im = lienzo(16, 32)
    p = im.load()
    # cuerpo y tapa
    rect(p, 1, 6, 14, 29, CONTORNO)
    rect(p, 2, 7, 13, 8, BRILLO)
    rect(p, 2, 8, 13, 8, CLARO)
    rect(p, 2, 9, 13, 9, OSCURO)
    p[12, 7] = FOCO_APAGADO
    # tres cajones
    for d in range(3):
        y0 = 10 + d * 6
        rect(p, 2, y0, 13, y0 + 4, MEDIO)
        rect(p, 2, y0, 2, y0 + 4, CLARO)
        rect(p, 13, y0, 13, y0 + 4, OSCURO)
        rect(p, 2, y0 + 5, 13, y0 + 5, OSCURO)
        rect(p, 4, y0 + 1, 7, y0 + 2, ETIQUETA)
        rect(p, 5, y0 + 2, 6, y0 + 2, RAYA)
        rect(p, 9, y0 + 2, 11, y0 + 2, JALADERA)
        rect(p, 9, y0 + 3, 11, y0 + 3, OSCURO)
    # zoclo y patas
    rect(p, 2, 28, 13, 28, OSCURO)
    rect(p, 2, 30, 3, 31, PATA)
    rect(p, 12, 30, 13, 31, PATA)
    return im


def grafica():
    im = lienzo(32, 32)
    p = im.load()
    rect(p, 1, 3, 30, 28, MARCO)
    rect(p, 1, 3, 30, 3, MARCO_CLARO)
    rect(p, 2, 4, 29, 27, FONDO)
    # 9 semanas x 7 días, celdas de 2 px con 1 px de separación
    for semana in range(9):
        for dia in range(7):
            x = 3 + semana * 3
            y = 5 + dia * 3
            rect(p, x, y, x + 1, y + 1, CELDA)
    return im


def corcho():
    im = lienzo(32, 32)
    p = im.load()
    rect(p, 1, 3, 30, 28, MADERA)
    rect(p, 1, 3, 30, 3, MADERA_CLARA)
    rect(p, 3, 5, 28, 26, CORCHO)
    rect(p, 3, 26, 28, 26, CORCHO_OSCURO)
    for i, (x, y) in enumerate((x, y) for y in range(6, 26, 3) for x in range(4, 28, 4)):
        p[x + (y // 3) % 2, y] = CORCHO_PUNTO
    return im


def guardar(nombre, im, **extra):
    carpeta = MUEBLES / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    im.save(carpeta / f'{nombre}.png')
    manifest = {
        'id': nombre,
        'type': 'asset',
        'canPlaceOnWalls': False,
        'canPlaceOnSurfaces': False,
        'backgroundTiles': 0,
        'width': im.width,
        'height': im.height,
        'footprintW': im.width // 16,
        'footprintH': im.height // 16,
    }
    manifest.update(extra)
    (carpeta / 'manifest.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', newline='\n', encoding='utf-8'
    )
    VISTAS.mkdir(exist_ok=True)
    im.resize((im.width * 10, im.height * 10), Image.NEAREST).save(VISTAS / f'{nombre}_x10.png')


guardar('GITHUB_CABINET', archivero(), name='Archivero de repo', category='storage', backgroundTiles=1)
guardar('GITHUB_GRAPH', grafica(), name='Tablero de contribuciones', category='wall', canPlaceOnWalls=True)
guardar('GITHUB_PRS', corcho(), name='Corcho de PRs', category='wall', canPlaceOnWalls=True)
print('listo', MUEBLES)
