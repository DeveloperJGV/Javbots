"""Arma el tráiler 2 con lo que grabó grabar.mjs.

Uso: python docs/trailer/v2/editar.py --version completa|publica [--sin-musica] [--mosaico]
Salida: docs/trailer/salida/v2-<version>/javbots-trailer-<version>.mp4

La oficina se graba entera a zoom 2 (cada pixel del juego = 2x2 px; el mapa de
44x30 cuadros ocupa 1408x960 en (256, 60) de una pantalla de 1920x1080). Las
tomas de cerca recortan 768x432 y lo escalan x2.5 sin suavizar; la toma "tres"
pone tres recortes de 256x432 lado a lado. La cámara sigue a un personaje (por
el nombre de su carpeta), a un becario, a una mascota o se queda en un punto.
El video sale comprimido para caber en los 10 MB que GitHub acepta.
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
REPO = AQUI.parents[2]
FUENTE = REPO / 'webview-ui' / 'public' / 'fonts' / 'FSPixelSansUnicode-Regular.ttf'
ICONO = REPO / 'webview-ui' / 'public' / 'favicon.png'
PERSONAJES = REPO / 'webview-ui' / 'public' / 'assets' / 'characters'
MUSICA = AQUI.parent / 'musica' / 'Juhani Junkala [Chiptune Adventures] 2. Stage 2.ogg'

VERSION = sys.argv[sys.argv.index('--version') + 1] if '--version' in sys.argv else 'publica'
SALIDA = AQUI.parent / 'salida' / f'v2-{VERSION}'
VIDEO = SALIDA / f'javbots-trailer-{VERSION}.mp4'
LIMITE_MB = 9.5  # GitHub acepta videos de hasta 10 MB

ANCHO, ALTO, FPS = 1920, 1080, 30
MAPA_X, MAPA_Y, ZOOM = 256, 60, 2
MAPA_W, MAPA_H = 44 * 16 * ZOOM, 30 * 16 * ZOOM
VENTANA_W, VENTANA_H = 768, 432
SUAVE_SEG = 0.45  # qué tan rápido alcanza la cámara a su objetivo
CRUCE = 0.25  # fundido entre tomas
PANEL_Y0, PANEL_Y1 = 120, 420  # recorrido vertical del panel del pizarrón (px de pantalla)

# Colores de la interfaz del juego (webview-ui/src/index.css)
FONDO = (30, 30, 46)
ACENTO = (90, 140, 255)
SOMBRA = (10, 10, 20)
TEXTO_SUAVE = (190, 200, 230)

# Cámaras: ('toda',) · ('sigue', carpeta) · ('becario',) · ('mascota', n) ·
# ('punto', col, fila[, aumento]) · ('panel',) · ('tres', [(etiqueta, cámara), ...]).
# Cada toma: (desde, hasta, cámara, título, subtítulo, solo_en_version).
TOMAS = [
    (None, 4.5, ('intro',), '', '', None),
    (3.5, 9.5, ('toda',), 'Cada sesión de Claude Code', 'es un personaje que llega a trabajar', None),
    (8.0, 14.0, ('mascota', 0), 'Las mascotas', 'también andan por la oficina', 'completa'),
    (13.6, 20.0, ('sigue', 'blog-viajes'), 'Le escribes…', 'y se queda pensando', None),
    (21.0, 27.5, ('tres', [('Programa', ('sigue', 'mi-juego')), ('Lee', ('sigue', 'pagina-web')), ('Corre comandos', ('sigue', 'app-recetas'))]),
     'Cada tarea tiene su cuarto', 'y cada agente camina al suyo', None),
    (28.5, 36.0, ('becario',), 'Si delega una tarea…', 'llega uno de sus becarios', None),
    (34.0, 39.5, ('sigue', 'blog-viajes'), 'Cada turno terminado', 'se festeja', None),
    (41.0, 47.0, ('sigue', 'pagina-web'), 'Cada commit…', 'va al pedestal del Anillo', None),
    (52.0, 57.5, ('punto', 14, 10, 4), 'El pizarrón del pasillo', 'una rayita por agente, crece si trabaja', None),
    (57.5, 64.5, ('sigue', 'app-recetas'), 'Si necesita tu permiso…', 'va a esperarte con Senku', None),
    (66.5, 74.5, ('sigue', 'app-recetas'), 'Si algo falla…', 'baja llorando al Sótano', None),
    (77.5, 83.0, ('toda',), 'De noche', 'se prenden las luces', None),
    (99.0, 108.0, ('punto', 30, 22), 'Y cuando todos terminan…', '¡fiesta!', None),
    (113.0, 121.0, ('panel',), 'Y en el pizarrón', 'ves lo que hizo cada uno', None),
    (124.5, 133.0, ('punto', 39, 22, 4), 'Y hay secretos…', 'pista: once clics', 'completa'),
    # El tiempo libre es al azar: cada versión tiene su momento (la completa se graba con --segundos 190).
    (154.5, 161.5, ('punto', 28, 24, 3), 'Sin trabajo…', 'tiempo libre: consola, tele, Pac-Man', 'publica'),
    (168.0, 175.0, ('punto', 31, 24, 3), 'Sin trabajo…', 'tiempo libre: consola, tele, Pac-Man', 'completa'),
    (None, 6.0, ('cierre',), '', '', None),
]
TOMAS = [t for t in TOMAS if t[5] in (None, VERSION)]


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
    """Dónde estaba cada personaje o mascota en el segundo `t` (interpolado)."""

    def __init__(self, pistas):
        self.lista = pistas
        self.ts = [p['t'] for p in pistas]
        self.ids = {}
        for p in pistas:
            for ident, carpeta in p.get('carpetas', {}).items():
                self.ids.setdefault(carpeta, int(ident))
        self.mascotas = []
        for p in pistas:
            for m in p.get('pets', []):
                if m['id'] not in self.mascotas:
                    self.mascotas.append(m['id'])

    def _pos(self, i, quien):
        tipo, valor = quien
        if tipo == 'mascota':
            fuente_ = self.lista[i].get('pets', [])
        else:
            fuente_ = self.lista[i]['chars']
        for c in fuente_:
            if tipo == 'becario' and c['id'] < 0:
                return c['x'], c['y']
            if c['id'] == valor:
                return c['x'], c['y']
        return None

    def en(self, t, quien):
        i = bisect.bisect_right(self.ts, t)
        antes = next((k for k in range(min(i, len(self.ts)) - 1, -1, -1) if self._pos(k, quien)), None)
        despues = next((k for k in range(i, len(self.ts)) if self._pos(k, quien)), None)
        if antes is None and despues is None:
            return None
        if antes is None or despues is None:
            return self._pos(antes if despues is None else despues, quien)
        (x0, y0), (x1, y1) = self._pos(antes, quien), self._pos(despues, quien)
        t0, t1 = self.ts[antes], self.ts[despues]
        f = 0 if t1 == t0 else min(1, max(0, (t - t0) / (t1 - t0)))
        return x0 + (x1 - x0) * f, y0 + (y1 - y0) * f

    def objetivo(self, t, camara):
        """Punto del mundo (px) que la cámara quiere centrar, o None."""
        tipo = camara[0]
        if tipo == 'punto':
            return camara[1] * 16 + 8, camara[2] * 16 + 8 + 14
        if tipo == 'sigue':
            return self.en(t, ('char', self.ids.get(camara[1])))
        if tipo == 'becario':
            return self.en(t, ('becario', None))
        if tipo == 'mascota':
            n = camara[1]
            return self.en(t, ('mascota', self.mascotas[n])) if n < len(self.mascotas) else None
        return None


def ventana_para(x, y, w=VENTANA_W, h=VENTANA_H):
    """Esquina de la ventana centrada en un punto (pies → torso), sin salirse del mapa."""
    cx = MAPA_X + x * ZOOM
    cy = MAPA_Y + (y - 14) * ZOOM
    vx = min(max(cx - w / 2, MAPA_X), MAPA_X + MAPA_W - w)
    vy = min(max(cy - h / 2, MAPA_Y), MAPA_Y + MAPA_H - h)
    return vx, vy


class Camara:
    """Ventana que persigue su objetivo con suavidad."""

    def __init__(self, w, h):
        self.w, self.h, self.pos = w, h, None

    def mover(self, objetivo):
        meta = ventana_para(*objetivo, self.w, self.h) if objetivo else (self.pos or ventana_para(352, 240, self.w, self.h))
        if self.pos is None:
            self.pos = meta
        else:
            f = 1 - math.exp(-1 / (FPS * SUAVE_SEG))
            self.pos = (self.pos[0] + (meta[0] - self.pos[0]) * f, self.pos[1] + (meta[1] - self.pos[1]) * f)
        return int(round(self.pos[0])), int(round(self.pos[1]))


def fuente(tam):
    return ImageFont.truetype(str(FUENTE), tam)


F_GRANDE, F_TITULO, F_SUB, F_CHICA = fuente(120), fuente(72), fuente(40), fuente(30)


def suave(x):
    """Ease-out cúbico de 0 a 1."""
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def poner_titulo(img, titulo, sub, t, dur):
    """Cartel con estilo del juego que sube desde abajo: fondo sólido, barra de
    acento a la izquierda y sombra dura."""
    entra, sale = 0.3, min(dur, 4.8)
    if t < entra or t > sale:
        return img
    a_in = suave((t - entra) / 0.4)
    a_out = suave((sale - t) / 0.3)
    alfa = min(a_in, a_out)
    if alfa <= 0:
        return img
    d = ImageDraw.Draw(img)
    tw = d.textlength(titulo, font=F_TITULO)
    sw = d.textlength(sub, font=F_SUB) if sub else 0
    w = int(max(tw, sw)) + 120
    h = 72 + 40 + 76
    x0 = 72
    y0 = ALTO - h - 72 + int((1 - a_in) * 60)
    capa = Image.new('RGBA', img.size, (0, 0, 0, 0))
    c = ImageDraw.Draw(capa)
    a = int(255 * alfa)
    c.rectangle([x0 + 8, y0 + 8, x0 + w + 8, y0 + h + 8], fill=SOMBRA + (a,))
    c.rectangle([x0, y0, x0 + w, y0 + h], fill=FONDO + (int(a * 0.95),), outline=SOMBRA + (a,), width=4)
    # La barra de acento crece de arriba a abajo al entrar.
    c.rectangle([x0 + 4, y0 + 4, x0 + 20, y0 + 4 + int((h - 8) * a_in)], fill=ACENTO + (a,))
    c.text((x0 + 56, y0 + 22), titulo, font=F_TITULO, fill=(255, 255, 255, a))
    if sub:
        c.text((x0 + 58, y0 + 22 + 92), sub, font=F_SUB, fill=TEXTO_SUAVE + (a,))
    base = img.convert('RGBA')
    base.alpha_composite(capa)
    return base.convert('RGB')


def etiqueta(img, texto, x_centro, y):
    """Etiqueta chica (para la toma de tres)."""
    d = ImageDraw.Draw(img)
    tw = d.textlength(texto, font=F_CHICA)
    x0 = int(x_centro - tw / 2 - 20)
    d.rectangle([x0 + 4, y + 4, x0 + tw + 44, y + 60], fill=SOMBRA)
    d.rectangle([x0, y, x0 + tw + 40, y + 56], fill=FONDO, outline=ACENTO, width=3)
    d.text((x0 + 20, y + 10), texto, font=F_CHICA, fill=(255, 255, 255))


# ── Tarjetas de inicio y cierre ────────────────────────────────

def jefes():
    """Los 6 jefes (char_0..5) de frente, con sus 4 cuadros de caminar, x5."""
    hojas = []
    for n in range(6):
        hoja = Image.open(PERSONAJES / f'char_{n}.png').convert('RGBA')
        hojas.append([hoja.crop((k * 24, 0, k * 24 + 24, 44)).resize((120, 220), Image.NEAREST) for k in range(4)])
    return hojas


def tarjeta(t, dur, titulo, lineas, hojas, icono):
    img = Image.new('RGB', (ANCHO, ALTO), FONDO)
    d = ImageDraw.Draw(img)
    # Cuadrícula tenue de fondo, como el piso del editor.
    for x in range(0, ANCHO, 64):
        d.line([(x, 0), (x, ALTO)], fill=(36, 36, 54))
    for y in range(0, ALTO, 64):
        d.line([(0, y), (ANCHO, y)], fill=(36, 36, 54))
    a = suave(t / 0.6)
    # Ícono + título
    ico = icono.resize((160, 160), Image.NEAREST)
    tw = d.textlength(titulo, font=F_GRANDE)
    total = 160 + 40 + tw
    x0 = int((ANCHO - total) / 2)
    y_t = int(150 + (1 - a) * 40)
    img.paste(ico, (x0, y_t), ico)
    d.text((x0 + 200, y_t + 10), titulo, font=F_GRANDE, fill=(255, 255, 255))
    for k, linea in enumerate(lineas):
        lw = d.textlength(linea, font=F_SUB)
        d.text(((ANCHO - lw) / 2, y_t + 210 + k * 58), linea, font=F_SUB, fill=TEXTO_SUAVE if k else ACENTO)
    # Los jefes entran uno por uno caminando en su lugar.
    paso = int(t / 0.18) % 4
    ancho = 6 * 120 + 5 * 60
    for n, cuadros in enumerate(hojas):
        aparece = suave((t - 0.3 - n * 0.12) / 0.4)
        if aparece <= 0:
            continue
        x = int((ANCHO - ancho) / 2 + n * 180)
        y = int(ALTO - 330 + (1 - aparece) * 80)
        d.rectangle([x + 20, y + 206, x + 100, y + 218], fill=SOMBRA)
        img.paste(cuadros[(paso + n) % 4], (x, y), cuadros[(paso + n) % 4])
    # Fundido de salida
    if dur - t < 0.4:
        img = Image.blend(img, Image.new('RGB', img.size), 1 - (dur - t) / 0.4)
    return img


# ── Composición ────────────────────────────────────────────────

def componer(cuadros, pistas, tomas=TOMAS):
    """Genera los cuadros del video, uno por uno."""
    hojas = jefes()
    icono = Image.open(ICONO).convert('RGBA')
    anterior = None
    for desde, hasta, camara, titulo, sub, _ in tomas:
        tipo = camara[0]
        dur = hasta if desde is None else hasta - desde
        n = int(round(dur * FPS))
        if tipo == 'tres':
            camaras = [Camara(256, VENTANA_H) for _ in camara[1]]
        elif tipo == 'punto' and len(camara) > 3:
            cam = Camara(int(ANCHO / camara[3]), int(ALTO / camara[3]))
        else:
            cam = Camara(VENTANA_W, VENTANA_H)
        img = None
        for k in range(n):
            t_local = k / FPS
            if tipo == 'intro':
                img = tarjeta(t_local, dur, 'Javbots', ['Tus agentes de IA, trabajando en una oficina de pixeles'], hojas, icono)
            elif tipo == 'cierre':
                img = tarjeta(t_local, dur, 'Javbots', ['github.com/DeveloperJGV/Javbots',
                                                      'Basado en Pixel Agents de Pablo De Lucca · música: Juhani Junkala (CC0)'], hojas, icono)
            else:
                t = desde + t_local
                base = cuadros.en(t)
                if tipo == 'toda':
                    img = base.copy()
                elif tipo == 'tres':
                    img = Image.new('RGB', (ANCHO, ALTO), SOMBRA)
                    for j, (nombre, sub_cam) in enumerate(camara[1]):
                        vx, vy = camaras[j].mover(pistas.objetivo(t, sub_cam))
                        trozo = base.crop((vx, vy, vx + 256, vy + VENTANA_H)).resize((632, ALTO), Image.NEAREST)
                        img.paste(trozo, (j * 644, 0))
                        etiqueta(img, nombre, j * 644 + 316, 40)
                elif tipo == 'panel':
                    # El panel del pizarrón a x2, bajando despacio de arriba a abajo.
                    y = int(PANEL_Y0 + (PANEL_Y1 - PANEL_Y0) * suave(t_local / dur * 1.15))
                    img = base.crop((480, y, 1440, y + 540)).resize((ANCHO, ALTO), Image.NEAREST)
                else:
                    vx, vy = cam.mover(pistas.objetivo(t, camara))
                    img = base.crop((vx, vy, vx + cam.w, vy + cam.h)).resize((ANCHO, ALTO), Image.NEAREST)
                img = poner_titulo(img, titulo, sub, t_local, dur)
            # Fundido cruzado desde el último cuadro de la toma anterior.
            if anterior is not None and t_local < CRUCE:
                img = Image.blend(anterior, img, t_local / CRUCE)
            yield img
        anterior = img
    # Un último fundido a negro
    for k in range(int(0.5 * FPS)):
        yield Image.blend(anterior, Image.new('RGB', anterior.size), k / (0.5 * FPS))


def main():
    sin_musica = '--sin-musica' in sys.argv
    cuadros, pistas = cargar()
    cuadros, pistas = Cuadros(cuadros), Pistas(pistas)
    print(f'[trailer] personajes: {pistas.ids} · mascotas: {pistas.mascotas}')
    total = sum(h if d is None else h - d for d, h, *_ in TOMAS) + 0.5
    # Tasa para caber en el límite de GitHub (con el audio a 96 kbps).
    kbps = int(LIMITE_MB * 8000 / total) - 96 - 20
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{ANCHO}x{ALTO}', '-r', str(FPS), '-i', '-']
    if not sin_musica:
        cmd += ['-stream_loop', '-1', '-i', str(MUSICA), '-map', '0:v', '-map', '1:a',
                '-af', f'afade=t=in:st=0:d=0.3,afade=t=out:st={total - 3:.2f}:d=3', '-c:a', 'aac', '-b:a', '96k', '-t', f'{total:.2f}']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-b:v', f'{kbps}k', '-maxrate', f'{kbps * 2}k',
            '-bufsize', f'{kbps * 4}k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(VIDEO)]
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
    print(f'[trailer] {VIDEO.name}: {total:.1f} s, {VIDEO.stat().st_size / 1e6:.1f} MB ({kbps} kbps de video)')

    if '--mosaico' in sys.argv:
        mosaico(cuadros, pistas)


def mosaico(cuadros, pistas):
    """Un cuadro a la mitad de cada toma, en una hoja de 4 columnas."""
    w, h = ANCHO // 4, ALTO // 4
    filas = math.ceil(len(TOMAS) / 4)
    hoja = Image.new('RGB', (w * 4, h * filas))
    for k, toma in enumerate(TOMAS):
        d, hst = toma[0], toma[1]
        dur = hst if d is None else hst - d
        img = next(itertools.islice(componer(cuadros, pistas, [toma]), int(min(dur, 4.0) * FPS * 0.6), None))
        hoja.paste(img.resize((w, h), Image.LANCZOS), ((k % 4) * w, (k // 4) * h))
    hoja.save(SALIDA / 'mosaico.png')
    print('[trailer] mosaico.png')


if __name__ == '__main__':
    main()
