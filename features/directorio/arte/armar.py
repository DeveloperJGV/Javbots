# Arma los muebles provisionales del Directorio (features/directorio), dibujados por código.
# Estilo de vestíbulo de edificio: madera oscura, latón y fieltro negro con letras blancas.
# Uso: python features/directorio/arte/armar.py
#   DIRECTORIO_BOARD  directorio de edificio de pared 3x2: fieltro negro con renglones de letras blancas y placa de latón.
#   DIRECTORIO_DESK   mostrador de piso 3x2 (escritorio) con su campanita de latón y un libro de visitas.
#   DIRECTORIO_KEYS   tablero de llaves de pared 2x2: ganchos, llaves de latón y etiquetas.
#   DIRECTORIO_PHONE  teléfono de disco 1x1 que va encima del mostrador.
# Un clic en cualquiera abre el panel. El arte bueno vendrá después; esto solo marca el lugar.
import json
import random
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
VISTAS = AQUI / 'vistas'


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


CONTORNO = rgb('#1a120c')
NOGAL = rgb('#3b2416')
NOGAL_CLARO = rgb('#5a3a24')
MADERA = rgb('#7a4a26')
MADERA_OSCURA = rgb('#5e381c')
MADERA_CLARA = rgb('#a0683a')
CUBIERTA = rgb('#b07a45')
CUBIERTA_BRILLO = rgb('#c99560')
FIELTRO = rgb('#131313')
RANURA = rgb('#1f1f1f')
LETRA = rgb('#ececec')
LATON = rgb('#c9a227')
LATON_OSCURO = rgb('#8a6d12')
LATON_BRILLO = rgb('#f3dc7a')
NEGRO = rgb('#1b1b1f')
NEGRO_BRILLO = rgb('#4a4a55')
CREMA = rgb('#efe6cf')
PAPEL = rgb('#f4f1e8')
PAPEL_SOMBRA = rgb('#cfc8b6')
TINTA = rgb('#6b6b7a')
ROJO = rgb('#b3262d')
SOMBRA = rgb('#000000', 70)


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def marco_madera(px, x0, y0, x1, y1):
    """Caja con contorno, nogal y brillo arriba/izquierda."""
    rect(px, x0, y0, x1, y1, CONTORNO)
    rect(px, x0 + 1, y0 + 1, x1 - 1, y1 - 1, NOGAL)
    rect(px, x0 + 1, y0 + 1, x1 - 1, y0 + 1, NOGAL_CLARO)
    rect(px, x0 + 1, y0 + 1, x0 + 1, y1 - 1, NOGAL_CLARO)


def renglon(px, rnd, x0, x1, y, color=LETRA):
    """Un renglón de letras blancas de 2 px de alto: palabras con huecos, como letras de fieltro vistas de lejos."""
    x = x0
    while x < x1 - 2:
        palabra = rnd.randint(3, 7)
        for i in range(palabra):
            if x + i >= x1:
                break
            arriba, abajo = rnd.choice([(1, 1), (1, 0), (0, 1), (1, 1)])
            if arriba:
                px[x + i, y] = color
            if abajo:
                px[x + i, y + 1] = color
        x += palabra + 2


def tablero_directorio():
    im = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    px = im.load()
    rnd = random.Random(7)
    marco_madera(px, 1, 1, 46, 30)
    rect(px, 4, 4, 43, 27, FIELTRO)
    for y in range(5, 27, 2):
        rect(px, 4, y, 43, y, RANURA)
    # Placa de latón arriba
    rect(px, 12, 2, 35, 5, LATON_OSCURO)
    rect(px, 13, 2, 34, 4, LATON)
    rect(px, 13, 2, 34, 2, LATON_BRILLO)
    for x in range(16, 32, 2):
        px[x, 3] = LATON_OSCURO
    # Renglones: nombre a la izquierda, número de piso a la derecha
    for y in range(8, 26, 3):
        renglon(px, rnd, 6, 33, y)
        rect(px, 37, y, 41, y, LETRA)
        px[38, y + 1] = LETRA
        px[40, y + 1] = LETRA
    # Sombra abajo, sobre la pared
    rect(px, 2, 31, 46, 31, SOMBRA)
    return im


def mostrador():
    im = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    px = im.load()
    # Cubierta
    rect(px, 0, 9, 47, 15, CONTORNO)
    rect(px, 1, 10, 46, 14, CUBIERTA)
    rect(px, 1, 10, 46, 10, CUBIERTA_BRILLO)
    # Frente con tres tableros
    rect(px, 1, 15, 46, 30, CONTORNO)
    rect(px, 2, 15, 45, 29, MADERA)
    rect(px, 2, 15, 45, 15, MADERA_OSCURA)
    for x0 in (4, 18, 32):
        rect(px, x0, 18, x0 + 11, 26, MADERA_OSCURA)
        rect(px, x0 + 1, 19, x0 + 10, 25, MADERA)
        rect(px, x0 + 1, 19, x0 + 10, 19, MADERA_CLARA)
    # Zoclo de latón
    rect(px, 2, 28, 45, 29, LATON_OSCURO)
    rect(px, 2, 28, 45, 28, LATON)
    rect(px, 2, 31, 46, 31, SOMBRA)
    # Campanita (izquierda): base negra, domo de latón y botón
    rect(px, 5, 12, 11, 13, NEGRO)
    rect(px, 6, 9, 10, 11, LATON)
    rect(px, 7, 8, 9, 8, LATON)
    px[8, 7] = LATON_OSCURO
    px[8, 6] = NEGRO
    px[7, 9] = LATON_BRILLO
    px[6, 10] = LATON_BRILLO
    rect(px, 6, 11, 10, 11, LATON_OSCURO)
    # Libro de visitas abierto (derecha)
    rect(px, 33, 10, 44, 13, PAPEL_SOMBRA)
    rect(px, 33, 10, 38, 12, PAPEL)
    rect(px, 39, 10, 44, 12, PAPEL)
    px[38, 11] = PAPEL_SOMBRA
    for x in range(34, 38):
        px[x, 11] = TINTA if x % 2 else PAPEL
    for x in range(40, 44, 2):
        px[x, 11] = TINTA
    px[44, 13] = ROJO  # listón
    return im


def tablero_llaves():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    rnd = random.Random(3)
    rect(px, 2, 3, 29, 29, CONTORNO)
    rect(px, 3, 4, 28, 28, MADERA)
    rect(px, 3, 4, 28, 4, MADERA_CLARA)
    rect(px, 3, 4, 3, 28, MADERA_CLARA)
    # Placa
    rect(px, 11, 6, 20, 8, LATON)
    rect(px, 11, 6, 20, 6, LATON_BRILLO)
    # 3 filas de 4 ganchos
    for fila, y in enumerate((11, 17, 23)):
        for col, x in enumerate((6, 12, 18, 24)):
            px[x, y] = LATON_OSCURO
            px[x + 1, y] = LATON_OSCURO
            if rnd.random() < 0.25 or (fila, col) == (1, 2):
                continue  # gancho vacío: alguien salió
            # etiqueta blanca y llave de latón
            rect(px, x - 1, y + 1, x, y + 2, PAPEL)
            px[x - 1, y + 2] = PAPEL_SOMBRA
            rect(px, x + 1, y + 1, x + 2, y + 2, LATON)
            px[x + 2, y + 1] = LATON_BRILLO
            px[x + 1, y + 3] = LATON
            px[x + 1, y + 4] = LATON_OSCURO
    rect(px, 3, 30, 29, 30, SOMBRA)
    return im


def telefono():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    rect(px, 3, 14, 13, 14, SOMBRA)
    # Cuerpo
    rect(px, 3, 8, 12, 13, NEGRO)
    rect(px, 4, 7, 11, 7, NEGRO)
    rect(px, 4, 8, 11, 8, NEGRO_BRILLO)
    # Disco
    rect(px, 6, 9, 9, 12, CREMA)
    px[6, 9] = NEGRO
    px[9, 9] = NEGRO
    px[6, 12] = NEGRO
    px[9, 12] = NEGRO
    px[7, 10] = NEGRO_BRILLO
    px[8, 11] = NEGRO_BRILLO
    # Bocina encima
    rect(px, 2, 4, 13, 5, NEGRO)
    rect(px, 1, 5, 3, 6, NEGRO)
    rect(px, 12, 5, 14, 6, NEGRO)
    rect(px, 3, 4, 12, 4, NEGRO_BRILLO)
    # Cable rizado
    for y in range(9, 13):
        px[13 + (y % 2), y] = NEGRO
    return im


def guardar(nombre, im, manifest):
    d = MUEBLES / nombre
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{nombre}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    VISTAS.mkdir(exist_ok=True)
    im.resize((im.width * 10, im.height * 10), Image.NEAREST).save(VISTAS / f'{nombre}.png')
    print('listo', nombre, im.size)


def manifest(id_, nombre, w, h, categoria, pared=False, bg=0, superficie=False, **extra):
    m = {
        'id': id_,
        'type': 'asset',
        'canPlaceOnWalls': pared,
        'canPlaceOnSurfaces': superficie,
        'backgroundTiles': bg,
        'width': w,
        'height': h,
        'footprintW': w // 16,
        'footprintH': h // 16,
        'name': nombre,
        'category': categoria,
    }
    m.update(extra)
    return m


if __name__ == '__main__':
    guardar('DIRECTORIO_BOARD', tablero_directorio(),
            manifest('DIRECTORIO_BOARD', 'Directorio del edificio', 48, 32, 'wall', pared=True))
    guardar('DIRECTORIO_DESK', mostrador(),
            manifest('DIRECTORIO_DESK', 'Mostrador con campanita', 48, 32, 'desks', bg=1, isDesk=True))
    guardar('DIRECTORIO_KEYS', tablero_llaves(),
            manifest('DIRECTORIO_KEYS', 'Tablero de llaves', 32, 32, 'wall', pared=True))
    guardar('DIRECTORIO_PHONE', telefono(),
            manifest('DIRECTORIO_PHONE', 'Teléfono de disco', 16, 16, 'electronics', superficie=True))
