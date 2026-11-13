# Arma el quiosco de ofertas (features/ofertas), dibujado por código (sin PixelLab).
# Uso: python features/ofertas/arte/armar.py
#   OFERTAS_KIOSK     quiosco de piso 1x2 (la loseta de arriba es fondo): pedestal con pantalla y etiqueta de precio.
#                     Apagado: pantalla oscura, etiqueta gris, foco apagado. Es el que se guarda en el plano.
#   OFERTAS_KIOSK_ON  el mismo, prendido: "%" en la pantalla, etiqueta ámbar con "$" y foco rojo. La página cambia
#                     el tipo por este id cuando hay avisos sin ver. Su manifest es un grupo de estado con un solo
#                     miembro "on": así existe en el catálogo con su id pero no sale en la paleta del editor (y, al no
#                     tener pareja "off", el editor no lo alterna ni se prende solo junto a un agente).
# Escribe webview-ui/public/assets/furniture/OFERTAS_KIOSK*/ (PNG + manifest.json) y la vista vista_x8.png.
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
MUEBLES = RAIZ / 'webview-ui' / 'public' / 'assets' / 'furniture'
W, H = 16, 32


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


T = (0, 0, 0, 0)
CONTORNO = rgb('#14161c')
MARCO = rgb('#3a3f4b')
MARCO_CLARO = rgb('#5a6172')
MARCO_OSCURO = rgb('#2a2e38')
PANTALLA = rgb('#0b1a2b')
PANTALLA_BRILLO = rgb('#16324a')
PANTALLA_ON = rgb('#06281a')
VERDE = rgb('#4ade80')
VERDE_OSCURO = rgb('#15803d')
AMBAR = rgb('#fbbf24')
AMBAR_OSCURO = rgb('#b45309')
GRIS = rgb('#8a92a6')
GRIS_OSCURO = rgb('#5a6172')
GRIS_CLARO = rgb('#b7bdca')
ROJO = rgb('#ef4444')
ROJO_CLARO = rgb('#fca5a5')
FOCO_APAGADO = rgb('#3b3b3b')
SOMBRA = rgb('#000000', 70)

# "%" de 6x6 y "$" de 3x5 (filas de arriba abajo)
PORCIENTO = [
    'XX...X',
    'XX..X.',
    '...X..',
    '..X...',
    '.X..XX',
    'X...XX',
]
PESOS = [
    '.X.',
    'XXX',
    'X..',
    'XXX',
    '..X',
    'XXX',
    '.X.',
]


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def glifo(px, x0, y0, filas, c):
    for dy, fila in enumerate(filas):
        for dx, ch in enumerate(fila):
            if ch == 'X':
                px[x0 + dx, y0 + dy] = c


def quiosco(prendido):
    im = Image.new('RGBA', (W, H), T)
    px = im.load()

    # Sombra en el piso
    rect(px, 2, 30, 13, 31, SOMBRA)

    # Base ancha
    rect(px, 2, 26, 13, 30, CONTORNO)
    rect(px, 3, 27, 12, 29, MARCO)
    rect(px, 3, 27, 12, 27, MARCO_CLARO)
    rect(px, 3, 29, 12, 29, MARCO_OSCURO)

    # Pedestal (columna) con la etiqueta de precio al frente
    rect(px, 4, 15, 11, 26, CONTORNO)
    rect(px, 5, 16, 10, 26, MARCO)
    rect(px, 5, 16, 5, 25, MARCO_CLARO)
    rect(px, 10, 16, 10, 25, MARCO_OSCURO)
    # Etiqueta de precio con "$" (el hoyito del hilo arriba a la izquierda)
    tag, tag_osc, signo = (AMBAR, AMBAR_OSCURO, CONTORNO) if prendido else (GRIS, GRIS_OSCURO, GRIS_OSCURO)
    rect(px, 6, 17, 10, 25, tag)
    rect(px, 6, 25, 10, 25, tag_osc)
    rect(px, 10, 17, 10, 25, tag_osc)
    glifo(px, 7, 18, PESOS, signo)
    px[6, 17] = MARCO  # esquina recortada
    px[7, 17] = MARCO_OSCURO if prendido else MARCO

    # Caja de la pantalla (más ancha que el pedestal)
    rect(px, 1, 2, 14, 15, CONTORNO)
    rect(px, 2, 3, 13, 14, MARCO)
    rect(px, 2, 3, 13, 3, MARCO_CLARO)
    rect(px, 2, 3, 2, 14, MARCO_CLARO)
    rect(px, 2, 14, 13, 14, MARCO_OSCURO)
    rect(px, 13, 4, 13, 14, MARCO_OSCURO)
    # Pantalla
    rect(px, 3, 4, 12, 13, CONTORNO)
    rect(px, 4, 5, 11, 12, PANTALLA_ON if prendido else PANTALLA)
    if prendido:
        # líneas de barrido tenues y el "%" encima
        for y in range(5, 13, 2):
            rect(px, 4, y, 11, y, VERDE_OSCURO if y == 12 else PANTALLA_ON)
        rect(px, 4, 12, 11, 12, VERDE_OSCURO)
        glifo(px, 5, 5, PORCIENTO, VERDE)
    else:
        # reflejo tenue arriba-izquierda
        px[5, 6] = PANTALLA_BRILLO
        px[6, 6] = PANTALLA_BRILLO
        px[5, 7] = PANTALLA_BRILLO

    # Foco de aviso arriba de la caja
    rect(px, 6, 0, 9, 2, CONTORNO)
    if prendido:
        rect(px, 7, 0, 8, 1, ROJO)
        px[7, 0] = ROJO_CLARO
        # resplandor
        px[5, 1] = rgb('#ef4444', 110)
        px[10, 1] = rgb('#ef4444', 110)
        px[5, 0] = rgb('#ef4444', 60)
        px[10, 0] = rgb('#ef4444', 60)
    else:
        rect(px, 7, 0, 8, 1, FOCO_APAGADO)
        px[7, 0] = GRIS_OSCURO
    rect(px, 6, 2, 9, 2, MARCO_OSCURO)
    px[6, 2] = CONTORNO
    px[9, 2] = CONTORNO

    # Botoncito a un lado de la pantalla
    px[12, 13] = GRIS_CLARO if not prendido else VERDE
    return im


def escribir(carpeta, im, manifest):
    d = MUEBLES / carpeta
    d.mkdir(parents=True, exist_ok=True)
    im.save(d / f'{carpeta}.png')
    (d / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n',
                                     encoding='utf-8', newline='\n')
    print('listo', carpeta, im.size)


COMUN = {
    'category': 'decor',
    'canPlaceOnWalls': False,
    'canPlaceOnSurfaces': False,
    'backgroundTiles': 1,
}
TAM = {'width': W, 'height': H, 'footprintW': 1, 'footprintH': 2}

if __name__ == '__main__':
    apagado = quiosco(False)
    prendido = quiosco(True)
    escribir('OFERTAS_KIOSK', apagado, {
        'id': 'OFERTAS_KIOSK',
        'name': 'Quiosco de ofertas',
        **COMUN,
        'type': 'asset',
        **TAM,
    })
    escribir('OFERTAS_KIOSK_ON', prendido, {
        'id': 'OFERTAS_KIOSK_ON',
        'name': 'Quiosco de ofertas (con avisos)',
        **COMUN,
        'type': 'group',
        'groupType': 'state',
        'members': [
            {'type': 'asset', 'id': 'OFERTAS_KIOSK_ON', 'file': 'OFERTAS_KIOSK_ON.png', **TAM, 'state': 'on'},
        ],
    })
    # Vista ampliada x8: apagado y prendido lado a lado, sobre un piso de muestra
    fondo = Image.new('RGBA', (W * 2 + 12, H + 4), rgb('#6b4a32'))
    fondo.alpha_composite(apagado, (2, 2))
    fondo.alpha_composite(prendido, (W + 10, 2))
    fondo.resize((fondo.width * 8, fondo.height * 8), Image.NEAREST).save(AQUI / 'vista_x8.png')
    print('vista', AQUI / 'vista_x8.png')
