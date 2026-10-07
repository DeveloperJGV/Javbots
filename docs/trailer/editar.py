"""Arma el tráiler con lo que grabó grabar.mjs.

Uso: python docs/trailer/editar.py [--sin-musica] [--mosaico]
Salida: docs/trailer/salida/pixel-agents-trailer.mp4 (+ mosaico.png con --mosaico)

La oficina se graba entera a zoom 2 (cada pixel del juego = 2x2 px; el mapa de
44x30 cuadros ocupa 1408x960 en (256, 60) de una pantalla de 1920x1080). Las
tomas de cerca recortan 768x432 y lo escalan x2.5 sin suavizar (5 px por pixel,
parejo); la cámara sigue a un personaje con las pistas de pistas.json. Los
cuadros se mandan crudos a ffmpeg, que pone la música en bucle.
"""

import bisect
import itertools
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / 'salida'
FUENTE = AQUI.parents[1] / 'webview-ui' / 'public' / 'fonts' / 'FSPixelSansUnicode-Regular.ttf'
MUSICA = AQUI / 'musica' / 'Juhani Junkala [Chiptune Adventures] 1. Stage 1.ogg'
VIDEO = SALIDA / 'pixel-agents-trailer.mp4'

ANCHO, ALTO, FPS = 1920, 1080, 30
MAPA_X, MAPA_Y, ZOOM = 256, 60, 2
MAPA_W, MAPA_H = 44 * 16 * ZOOM, 30 * 16 * ZOOM
VENTANA_W, VENTANA_H = 768, 432
SUAVE_SEG = 0.45  # qué tan rápido alcanza la cámara a su personaje
FUNDIDO = 0.3

# Colores de la interfaz del juego (webview-ui/src/index.css)
FONDO_TITULO = (30, 30, 46)
BORDE_TITULO = (90, 140, 255)
SOMBRA_TITULO = (10, 10, 20)

# (desde, hasta) en segundos de la grabación, a quién sigue la cámara
# (id del personaje; None = oficina completa), título y subtítulo.
TOMAS = [
    (1.0, 7.0, None, 'Pixel Agents', 'Tus agentes de IA, trabajando en una oficina de pixeles'),
    (7.0, 14.0, None, 'Cada sesión de Claude Code', 'es un personaje que llega a la oficina'),
    (14.0, 21.0, 1, 'Si edita código…', 'se sienta a programar'),
    (19.0, 26.0, 2, 'Si lee o busca…', 'se va a la biblioteca Jedi'),
    (19.5, 26.5, 3, 'Si corre comandos…', 'al taller del DeLorean'),
    (35.0, 42.0, 2, 'Si busca en internet…', 'a Light Labs'),
    (42.0, 48.5, 2, 'Cada commit', 'va al pedestal del Anillo'),
    (28.0, 39.0, -1, 'Y cuando delega…', 'llega su becario'),
    (56.5, 65.0, 3, 'Si necesita tu permiso…', 'te espera con Senku'),
    (67.0, 76.0, 3, 'Si algo falla…', 'baja llorando al Sótano'),
    (73.0, 81.5, -1, 'El becario descansa', 'y luego regresa con su jefe'),
    (84.0, 92.0, 1, 'Sin trabajo…', 'hay tiempo para Pac-Man'),
    (104.0, 113.0, None, 'Y de noche', 'se prenden las luces'),
    (118.0, 126.0, None, 'Javbots', 'Basado en Pixel Agents · arte con PixelLab'),
]


def cargar():
    cuadros = json.loads((SALIDA / 'cuadros.json').read_text(encoding='utf-8'))
    pistas = json.loads((SALIDA / 'pistas.json').read_text(encoding='utf-8'))
    return cuadros, pistas


class Cuadros:
    """El cuadro grabado que se veía en el segundo `t` (con caché del último)."""

    def __init__(self, cuadros):
        self.lista = cuadros
        self.ts = [c['t'] for c in cuadros]
        self.ultimo = (None, None)

    def en(self, t):
        i = max(0, bisect.bisect_right(self.ts, t) - 1)
        if self.ultimo[0] != i:
            img = Image.open(SALIDA / 'cuadros' / self.lista[i]['nombre']).convert('RGB')
            self.ultimo = (i, img)
        return self.ultimo[1]


class Pistas:
    """Dónde estaba cada personaje en el segundo `t` (interpolado)."""

    def __init__(self, pistas):
        self.lista = pistas
        self.ts = [p['t'] for p in pistas]

    def _pos(self, i, ident):
        for c in self.lista[i]['chars']:
            if c['id'] == ident:
                return c['x'], c['y']
        return None

    def en(self, t, ident):
        i = bisect.bisect_right(self.ts, t)
        antes = next((k for k in range(min(i, len(self.ts)) - 1, -1, -1) if self._pos(k, ident)), None)
        despues = next((k for k in range(i, len(self.ts)) if self._pos(k, ident)), None)
        if antes is None and despues is None:
            return None
        if antes is None or despues is None:
            return self._pos(antes if despues is None else despues, ident)
        (x0, y0), (x1, y1) = self._pos(antes, ident), self._pos(despues, ident)
        t0, t1 = self.ts[antes], self.ts[despues]
        f = 0 if t1 == t0 else min(1, max(0, (t - t0) / (t1 - t0)))
        return x0 + (x1 - x0) * f, y0 + (y1 - y0) * f


def ventana_para(x, y):
    """Esquina de la ventana centrada en un personaje (pies → torso), sin salirse del mapa."""
    cx = MAPA_X + x * ZOOM
    cy = MAPA_Y + (y - 14) * ZOOM
    vx = min(max(cx - VENTANA_W / 2, MAPA_X), MAPA_X + MAPA_W - VENTANA_W)
    vy = min(max(cy - VENTANA_H / 2, MAPA_Y), MAPA_Y + MAPA_H - VENTANA_H)
    return vx, vy


def fuente(tam):
    return ImageFont.truetype(str(FUENTE), tam)


F_TITULO, F_SUB = fuente(80), fuente(44)


def poner_titulo(img, titulo, sub, alfa):
    """Cartel con estilo del juego: fondo sólido, borde de 4 px y sombra dura."""
    if alfa <= 0:
        return img
    d = ImageDraw.Draw(img)
    tw = d.textlength(titulo, font=F_TITULO)
    sw = d.textlength(sub, font=F_SUB) if sub else 0
    w = int(max(tw, sw)) + 96
    h = 80 + 44 + (64 if sub else 0)
    x0 = (ANCHO - w) // 2
    y0 = ALTO - h - 64
    capa = Image.new('RGBA', img.size, (0, 0, 0, 0))
    c = ImageDraw.Draw(capa)
    a = int(255 * alfa)
    c.rectangle([x0 + 8, y0 + 8, x0 + w + 8, y0 + h + 8], fill=SOMBRA_TITULO + (a,))
    c.rectangle([x0, y0, x0 + w, y0 + h], fill=FONDO_TITULO + (int(a * 0.94),), outline=BORDE_TITULO + (a,), width=4)
    c.text(((ANCHO - tw) / 2, y0 + 20), titulo, font=F_TITULO, fill=(255, 255, 255, a))
    if sub:
        c.text(((ANCHO - sw) / 2, y0 + 22 + 92), sub, font=F_SUB, fill=(190, 200, 230, a))
    base = img.convert('RGBA')
    base.alpha_composite(capa)
    return base.convert('RGB')


def alfa_titulo(t, dur):
    entra, sale = 0.35, min(dur, 5.0)
    if t < entra:
        return 0.0
    if t < entra + 0.35:
        return (t - entra) / 0.35
    if t < sale - 0.35:
        return 1.0
    return max(0.0, (sale - t) / 0.35)


def componer(cuadros, pistas, tomas=TOMAS):
    """Genera los cuadros del video, uno por uno."""
    for desde, hasta, quien, titulo, sub in tomas:
        dur = hasta - desde
        n = int(round(dur * FPS))
        cam = None
        for k in range(n):
            t_local = k / FPS
            t = desde + t_local
            img = cuadros.en(t)
            if quien is not None:
                pos = pistas.en(t, quien)
                objetivo = ventana_para(*pos) if pos else (cam or ventana_para(352, 240))
                if cam is None:
                    cam = objetivo
                else:
                    f = 1 - math.exp(-1 / (FPS * SUAVE_SEG))
                    cam = (cam[0] + (objetivo[0] - cam[0]) * f, cam[1] + (objetivo[1] - cam[1]) * f)
                vx, vy = int(round(cam[0])), int(round(cam[1]))
                img = img.crop((vx, vy, vx + VENTANA_W, vy + VENTANA_H)).resize((ANCHO, ALTO), Image.NEAREST)
            else:
                img = img.copy()
            img = poner_titulo(img, titulo, sub, alfa_titulo(t_local, dur))
            # Fundido a negro en cada corte
            borde = min(t_local, dur - t_local)
            if borde < FUNDIDO:
                img = Image.blend(Image.new('RGB', img.size), img, max(0.0, borde / FUNDIDO))
            yield img


def main():
    sin_musica = '--sin-musica' in sys.argv
    cuadros, pistas = cargar()
    cuadros, pistas = Cuadros(cuadros), Pistas(pistas)
    total = sum(h - d for d, h, *_ in TOMAS)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{ANCHO}x{ALTO}', '-r', str(FPS), '-i', '-']
    if not sin_musica:
        cmd += ['-stream_loop', '-1', '-i', str(MUSICA), '-map', '0:v', '-map', '1:a',
                '-af', f'afade=t=in:st=0:d=0.5,afade=t=out:st={total - 3:.2f}:d=3', '-c:a', 'aac', '-b:a', '192k', '-t', f'{total:.2f}']
    cmd += ['-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(VIDEO)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for img in componer(cuadros, pistas):
        ff.stdin.write(img.tobytes())
        n += 1
        if n % 300 == 0:
            print(f'[trailer] {n / FPS:.0f} / {total:.0f} s', flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit('ffmpeg falló')
    print(f'[trailer] {VIDEO.name}: {total:.1f} s, {VIDEO.stat().st_size / 1e6:.1f} MB')

    if '--mosaico' in sys.argv:
        mosaico(cuadros, pistas)


def mosaico(cuadros, pistas):
    """6 cuadros representativos (a la mitad de su toma) en una hoja de 2x3."""
    elegidas = [0, 2, 7, 8, 9, 12]
    w, h = ANCHO // 2, ALTO // 2
    hoja = Image.new('RGB', (w * 2, h * 3))
    for k, i in enumerate(elegidas):
        d, hst, *resto = TOMAS[i]
        mitad = (d + min(hst, d + 5.0)) / 2 + 1.0
        img = next(itertools.islice(componer(cuadros, pistas, [(d, hst, *resto)]), int((mitad - d) * FPS), None))
        hoja.paste(img.resize((w, h), Image.LANCZOS), ((k % 2) * w, (k // 2) * h))
    hoja.save(SALIDA / 'mosaico.png')
    print('[trailer] mosaico.png')


if __name__ == '__main__':
    main()
