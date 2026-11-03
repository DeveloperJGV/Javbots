# Arma los muebles del cuarto de agenda (features/agenda), dibujados por código (estilo "centro de mando").
# Uso: python features/agenda/arte/armar.py
#   AGENDA_WEEK_MAP  pantalla de pared 4x2: mapa de la semana, 7 columnas (hoy + 6 días). La página pinta un bloque
#                    por evento (cian) o tarea (ámbar), el encabezado de hoy y una marca roja en los días con choques.
#   AGENDA_CONSOLE   consola de piso 3x2 (escritorio): 3 monitores, teclado y botones. Su foco se pone rojo
#                    (parpadea) si hay choques de horario, verde si no.
#   AGENDA_RADAR     pantalla de pared 2x2: radar redondo; la página gira la línea de barrido.
#   AGENDA_TASKS     pantalla de pared 2x2: lista con 5 casillas; la página prende una por tarea pendiente.
# Las posiciones que la página pinta tienen que coincidir con features/agenda/webview/constants.ts.
import json
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).parent
MUEBLES = AQUI.parent / 'assets' / 'furniture'
VISTAS = AQUI / 'vistas'


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


CONTORNO = rgb('#14161c')
MARCO = rgb('#3a3f4b')
MARCO_CLARO = rgb('#5a6172')
MARCO_OSCURO = rgb('#2a2e38')
PANTALLA = rgb('#0b1a2b')
REJILLA = rgb('#16324a')
REJILLA_CLARA = rgb('#1f4766')
CIAN = rgb('#22d3ee')
CIAN_OSCURO = rgb('#0e7490')
VERDE = rgb('#4ade80')
VERDE_OSCURO = rgb('#14532d')
RADAR_FONDO = rgb('#062b1a')
RADAR_ANILLO = rgb('#16a34a')
AMBAR = rgb('#fbbf24')
ROJO = rgb('#ef4444')
TECLA = rgb('#c9ced8')
TECLA_OSCURA = rgb('#8a92a6')
BOTONES = [rgb('#ef4444'), rgb('#fbbf24'), rgb('#4ade80'), rgb('#60a5fa')]
FOCO_APAGADO = rgb('#2b2b2b')
PATA = rgb('#1c1e24')


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = c


def marco(px, x0, y0, x1, y1):
    """Caja con contorno oscuro, marco metálico con brillo arriba/izquierda."""
    rect(px, x0, y0, x1, y1, CONTORNO)
    rect(px, x0 + 1, y0 + 1, x1 - 1, y1 - 1, MARCO)
    rect(px, x0 + 1, y0 + 1, x1 - 1, y0 + 1, MARCO_CLARO)
    rect(px, x0 + 1, y0 + 1, x0 + 1, y1 - 1, MARCO_CLARO)
    rect(px, x0 + 1, y1 - 1, x1 - 1, y1 - 1, MARCO_OSCURO)


# ── Mapa de la semana ──────────────────────────────────────────────
MAPA_X0, MAPA_PASO, MAPA_ANCHO = 4, 8, 7  # columna i: x = 4 + 8*i .. +6
MAPA_ENCABEZADO_Y = 6  # fila del encabezado (2 px de alto)
MAPA_FONDO_Y = 26  # último pixel de abajo de las barras
MAPA_ALARMA_Y = 9  # marca de choque (1 px)


def mapa_semana():
    im = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    px = im.load()
    marco(px, 1, 2, 62, 30)
    rect(px, 3, 4, 60, 28, PANTALLA)
    # Encabezados apagados y rejilla de las columnas
    for i in range(7):
        x = MAPA_X0 + MAPA_PASO * i
        rect(px, x, MAPA_ENCABEZADO_Y, x + MAPA_ANCHO - 1, MAPA_ENCABEZADO_Y + 1, REJILLA_CLARA)
        for y in range(11, MAPA_FONDO_Y + 1, 3):
            px[x + 3, y] = REJILLA
    # Líneas horizontales tenues
    for y in (13, 19, 25):
        for x in range(4, 60, 2):
            if px[x, y] == PANTALLA:
                px[x, y] = REJILLA
    # Tornillos y antena de señal
    for x in (2, 61):
        px[x, 3] = TECLA_OSCURA
        px[x, 29] = TECLA_OSCURA
    rect(px, 30, 0, 33, 1, CONTORNO)
    px[31, 1] = CIAN_OSCURO
    px[32, 1] = CIAN_OSCURO
    return im


# ── Consola ────────────────────────────────────────────────────────
CONSOLA_FOCO = (42, 18)  # 2x2


def monitor(px, x0, y0, x1, y1, dibujo):
    rect(px, x0, y0, x1, y1, CONTORNO)
    rect(px, x0 + 1, y0 + 1, x1 - 1, y1 - 1, MARCO)
    rect(px, x0 + 2, y0 + 2, x1 - 2, y1 - 2, PANTALLA)
    dibujo(px, x0 + 2, y0 + 2, x1 - 2, y1 - 2)


def ondas(px, x0, y0, x1, y1):
    alturas = [2, 4, 3, 5, 2, 3, 4, 1, 3, 5]
    for i, x in enumerate(range(x0 + 1, x1)):
        h = alturas[i % len(alturas)]
        for y in range(y1 - h, y1):
            px[x, y] = CIAN if y == y1 - h else CIAN_OSCURO


def calendario(px, x0, y0, x1, y1):
    for y in range(y0 + 1, y1, 2):
        for x in range(x0 + 1, x1, 2):
            px[x, y] = REJILLA_CLARA
    px[x0 + 3, y0 + 3] = AMBAR
    px[x0 + 5, y0 + 1] = CIAN


def texto(px, x0, y0, x1, y1):
    largos = [8, 5, 7, 4]
    for i, y in enumerate(range(y0 + 1, y1, 2)):
        for x in range(x0 + 1, min(x1, x0 + 1 + largos[i % 4])):
            px[x, y] = VERDE if i == 0 else VERDE_OSCURO


def consola():
    im = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    px = im.load()
    # Tres monitores arriba (el de en medio, más alto)
    monitor(px, 3, 3, 16, 13, ondas)
    monitor(px, 17, 1, 30, 13, calendario)
    monitor(px, 31, 3, 44, 13, texto)
    # Mueble
    rect(px, 1, 14, 46, 29, CONTORNO)
    rect(px, 2, 15, 45, 28, MARCO)
    rect(px, 2, 15, 45, 15, MARCO_CLARO)
    rect(px, 2, 27, 45, 28, MARCO_OSCURO)
    # Cubierta inclinada con teclado
    rect(px, 3, 16, 37, 21, MARCO_OSCURO)
    for fila, y in enumerate((17, 19)):
        for x in range(5 + fila, 36, 2):
            px[x, y] = TECLA
            px[x, y + 1] = TECLA_OSCURA
    # Botones de colores
    for i, x in enumerate(range(6, 30, 6)):
        rect(px, x, 23, x + 2, 24, BOTONES[i % len(BOTONES)])
        px[x, 25] = CONTORNO
    # Palanca
    rect(px, 33, 23, 34, 25, CONTORNO)
    px[33, 22] = ROJO
    px[34, 22] = ROJO
    # Foco (lo prende la página)
    fx, fy = CONSOLA_FOCO
    rect(px, fx - 1, fy - 1, fx + 2, fy + 2, CONTORNO)
    rect(px, fx, fy, fx + 1, fy + 1, FOCO_APAGADO)
    # Patas
    rect(px, 3, 29, 5, 30, PATA)
    rect(px, 42, 29, 44, 30, PATA)
    return im


# ── Radar ──────────────────────────────────────────────────────────
RADAR_CENTRO = (16, 17)
RADAR_RADIO = 11


def radar():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    marco(px, 2, 3, 29, 30)
    cx, cy = RADAR_CENTRO
    r = RADAR_RADIO
    for y in range(cy - r - 1, cy + r + 2):
        for x in range(cx - r - 1, cx + r + 2):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 <= (r + 1) ** 2:
                px[x, y] = CONTORNO
            if d2 <= r * r:
                px[x, y] = RADAR_FONDO
            if abs(d2 ** 0.5 - r) < 0.6 or abs(d2 ** 0.5 - r / 2) < 0.5:
                px[x, y] = RADAR_ANILLO
    for i in range(-r + 1, r):
        if px[cx + i, cy] == RADAR_FONDO:
            px[cx + i, cy] = VERDE_OSCURO
        if px[cx, cy + i] == RADAR_FONDO:
            px[cx, cy + i] = VERDE_OSCURO
    px[cx, cy] = VERDE
    # Dos "blips" fijos
    px[cx + 5, cy - 3] = AMBAR
    px[cx - 4, cy + 5] = CIAN
    return im


# ── Lista de tareas ────────────────────────────────────────────────
TAREAS_X, TAREAS_Y0, TAREAS_PASO = 6, 8, 4  # casilla 2x2 en (6, 8 + 4*i)


def tareas():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = im.load()
    marco(px, 2, 3, 29, 30)
    rect(px, 4, 5, 27, 28, PANTALLA)
    for i in range(5):
        y = TAREAS_Y0 + TAREAS_PASO * i
        rect(px, TAREAS_X, y, TAREAS_X + 1, y + 1, REJILLA_CLARA)
        largo = [14, 10, 12, 8, 11][i]
        for x in range(TAREAS_X + 5, TAREAS_X + 5 + largo):
            px[x, y + 1] = REJILLA_CLARA if x % 3 else REJILLA
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


def manifest(id_, nombre, w, h, categoria, pared=False, bg=0, **extra):
    m = {
        'id': id_,
        'type': 'asset',
        'canPlaceOnWalls': pared,
        'canPlaceOnSurfaces': False,
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
    guardar('AGENDA_WEEK_MAP', mapa_semana(), manifest('AGENDA_WEEK_MAP', 'Mapa de la semana', 64, 32, 'wall', pared=True))
    guardar('AGENDA_CONSOLE', consola(), manifest('AGENDA_CONSOLE', 'Consola de agenda', 48, 32, 'desks', bg=1, isDesk=True))
    guardar('AGENDA_RADAR', radar(), manifest('AGENDA_RADAR', 'Radar de agenda', 32, 32, 'wall', pared=True))
    guardar('AGENDA_TASKS', tareas(), manifest('AGENDA_TASKS', 'Lista de tareas', 32, 32, 'wall', pared=True))
