# Genera el ícono de Javbots (un monitor con carita de bot) en todos los tamaños.
#
#   python scripts/generar-icono.py
#
# Se dibuja a 16×16 y se agranda sin suavizar (cada pixel → un bloque), así queda nítido en todos los tamaños.
# Escribe:
#   webview-ui/public/favicon.ico   favicon de la página (16, 32, 48)
#   webview-ui/public/favicon.png   32×32 para navegadores que prefieren PNG
#   scripts/javbots.ico             acceso directo y consola del servidor (16 a 256)
#   icon.png                        128×128 (paquete de npm y extensión de VS Code)
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]

# Colores de la interfaz (webview-ui/src/index.css)
COLORES = {
    '.': (0, 0, 0, 0),
    'K': (24, 24, 40, 255),  # contorno (--color-bg-dark)
    'G': (74, 74, 106, 255),  # marco (--color-border)
    'S': (44, 43, 109, 255),  # pantalla (--color-active-bg)
    'E': (159, 216, 255, 255),  # ojos (luz de pantalla)
    'M': (137, 209, 133, 255),  # sonrisa (--color-status-success)
}

DIBUJO = [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KGGGGGGGGGGGGK.',
    '.KGSSSSSSSSSSGK.',
    '.KGSSSSSSSSSSGK.',
    '.KGSSEESSEESSGK.',
    '.KGSSEESSEESSGK.',
    '.KGSSSSSSSSSSGK.',
    '.KGSSMSSSSMSSGK.',
    '.KGSSSMMMMSSSGK.',
    '.KGSSSSSSSSSSGK.',
    '.KGGGGGGGGGGGGK.',
    '.KKKKKKGGKKKKKK.',
    '......KGGK......',
    '....KKGGGGKK....',
    '....KKKKKKKK....',
]


def base() -> Image.Image:
    im = Image.new('RGBA', (16, 16))
    for y, fila in enumerate(DIBUJO):
        assert len(fila) == 16, f'fila {y} mide {len(fila)}'
        for x, c in enumerate(fila):
            im.putpixel((x, y), COLORES[c])
    return im


def tam(im: Image.Image, lado: int) -> Image.Image:
    return im.resize((lado, lado), Image.NEAREST)


def ico(im: Image.Image, ruta: Path, lados: list[int]) -> None:
    imgs = [tam(im, n) for n in lados]
    imgs[-1].save(ruta, format='ICO', sizes=[(n, n) for n in lados], append_images=imgs[:-1])
    print(f'{ruta.relative_to(RAIZ)}: {lados}')


if __name__ == '__main__':
    im = base()
    ico(im, RAIZ / 'webview-ui' / 'public' / 'favicon.ico', [16, 32, 48])
    tam(im, 32).save(RAIZ / 'webview-ui' / 'public' / 'favicon.png')
    ico(im, RAIZ / 'scripts' / 'javbots.ico', [16, 24, 32, 48, 64, 128, 256])
    tam(im, 128).save(RAIZ / 'icon.png')
    print('webview-ui/public/favicon.png, icon.png')
