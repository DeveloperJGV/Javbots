# Azotea / roof garden: arma los muebles JARDIN_* desde los originales de PixelLab (lista de trabajos en
# trabajos.txt, se bajan con bajar.sh) + piezas por código (barandal de vidrio, riego por goteo, placa de planta).
# Todos create_image_pixen, view=side, plantilla de muebles de frente (PIXELLAB.md §3); las variantes que no se usan
# se quedan en originales/ para comparar.
#
# Uso:  python arte/pixellab/jardin/armar.py
# Escribe webview-ui/public/assets/furniture/<ID>/ (PNG + manifest.json) y las vistas vista_x4_*.png. No gasta.
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from muebles import abrir as _abrir, al_piso, guardar, limpiar  # noqa: E402


def abrir(nombre):
    return limpiar(_abrir(AQUI, nombre))


def rgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def piso(nombre):
    """Del tamaño en que se pidió, bajado al piso."""
    im = abrir(nombre)
    return al_piso(im, im.height - 1)


def pared(nombre):
    return abrir(nombre)


def chico(nombre):
    """Piezas pedidas en 16/20/24 px: se recorta lo dibujado (nunca se escala) y se pone abajo al centro de un
    lienzo de 16x16 (1x1) o 16x32 (1x2) si es más alto; si es más ancho que 16 se recorta al centro."""
    im = abrir(nombre)
    x0, y0, x1, y1 = im.getbbox()
    w, h = x1 - x0, y1 - y0
    if w > 16:
        x0 += (w - 16) // 2
        x1 = x0 + 16
        w = 16
    pieza = im.crop((x0, y0, x1, y1))
    alto = 16 if h <= 16 else 32
    out = Image.new('RGBA', (16, alto), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((16 - w) // 2, alto - 1 - pieza.height))
    return out


def angosto(nombre):
    """Piezas delgadas pedidas en 32 de ancho: recorte a 16 centrado, abajo."""
    im = abrir(nombre)
    x0, _, x1, _ = im.getbbox()
    izq = max(0, min(im.width - 16, (x0 + x1 - 16) // 2))
    im = im.crop((izq, 0, izq + 16, im.height))
    return al_piso(im, im.height - 1)


def en_lienzo(nombre, w, h):
    """Pieza chica (ej. dron de 24x24) puesta abajo al centro de un lienzo de w x h."""
    im = abrir(nombre)
    pieza = im.crop(im.getbbox())
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(pieza, ((w - pieza.width) // 2, h - 4 - pieza.height))
    return out


# ── Por código ──────────────────────────────────────────────────────────────────────────────────────────────
ACERO = rgb('#c9d1d9')
ACERO_OSCURO = rgb('#7d8590')
CONTORNO = rgb('#2b3038')
VIDRIO = rgb('#9fe7f5', 70)
VIDRIO_BRILLO = rgb('#e6fbff', 140)
TUBO = rgb('#2f6f4f')
TUBO_CLARO = rgb('#4fa374')
GOTA = rgb('#7dd3fc')
LATON = rgb('#d4a72c')
LATON_OSCURO = rgb('#8a6a14')


def barandal():
    """Tramo 1x1 de barandal de vidrio: pasamanos de acero arriba, vidrio translúcido y poste a la izquierda."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y in range(6, 15):
        for x in range(16):
            px[x, y] = VIDRIO
    for x in range(16):
        px[x, 4] = CONTORNO
        px[x, 5] = ACERO
        px[x, 15] = ACERO_OSCURO
    for y in range(4, 16):
        px[0, y] = CONTORNO
        px[1, y] = ACERO
    for i in range(3):  # reflejo diagonal
        px[6 + i, 12 - i * 2] = VIDRIO_BRILLO
        px[7 + i, 12 - i * 2] = VIDRIO_BRILLO
    return im


def goteo():
    """Riego por goteo 3x1: manguera verde por el suelo con goteros y gotas (se camina encima)."""
    im = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    px = im.load()
    for x in range(1, 47):
        px[x, 11] = TUBO
        px[x, 10] = TUBO_CLARO if x % 2 else TUBO
    for x in range(5, 47, 10):
        px[x, 9] = CONTORNO
        px[x, 12] = GOTA
        px[x, 14] = GOTA
    return im


def placa():
    """Placa de latón en una estaca (la que abre la ficha de una planta en el panel del jardín)."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y in range(9, 16):
        px[8, y] = LATON_OSCURO
    for y in range(3, 9):
        for x in range(3, 13):
            borde = y in (3, 8) or x in (3, 12)
            px[x, y] = LATON_OSCURO if borde else LATON
    for x in range(5, 11):  # renglones grabados
        px[x, 5] = LATON_OSCURO
    for x in range(5, 9):
        px[x, 7] = LATON_OSCURO
    return im


D = dict(category='decor', backgroundTiles=1)
PIEZAS = [
    # ── Plantas ──
    ('JARDIN_MONSTERA', 'Monstera', lambda: piso('monstera_1.png'), 2, 2, D),
    ('JARDIN_LEMON_TREE', 'Limonero', lambda: piso('limonero_1.png'), 2, 2, D),
    ('JARDIN_BAMBOO', 'Bambú con LED', lambda: piso('bambu_1.png'), 2, 2, D),
    ('JARDIN_TOMATOES', 'Tomateras', lambda: piso('tomates_1.png'), 2, 2, D),
    ('JARDIN_LAVENDER', 'Lavanda y hierbas', lambda: piso('lavanda_1.png'), 2, 2, D),
    ('JARDIN_PALM', 'Palmera con LED', lambda: piso('palmera_1.png'), 2, 2, D),
    ('JARDIN_FERN', 'Helecho', lambda: piso('helecho_1.png'), 2, 2, D),
    ('JARDIN_BONSAI', 'Bonsái', lambda: piso('bonsai_1.png'), 2, 2, D),
    ('JARDIN_HERBS', 'Macetas de hierbas', lambda: piso('hierbas_1.png'), 2, 2, D),
    ('JARDIN_SAGUARO', 'Cactus en concreto', lambda: piso('saguaro_1.png'), 2, 2, D),
    ('JARDIN_ORCHID', 'Orquídea', lambda: chico('orquidea_1.png'), 1, 1, dict(category='decor')),
    ('JARDIN_SUCCULENTS', 'Suculentas', lambda: chico('suculentas_1.png'), 1, 1, dict(category='decor')),
    ('JARDIN_GREEN_WALL', 'Muro verde', lambda: pared('muro_verde_1.png'), 2, 2, dict(category='wall', canPlaceOnWalls=True)),
    ('JARDIN_HANGING_PLANT', 'Planta colgante', lambda: pared('colgante_1.png'), 2, 2,
     dict(category='wall', canPlaceOnWalls=True)),
    # ── Invernadero y cultivo ──
    ('JARDIN_GREENHOUSE', 'Invernadero de cristal', lambda: piso('invernadero_1.png'), 4, 4,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_GREENHOUSE_DOME', 'Invernadero de arco', lambda: piso('invernadero_2.png'), 4, 4,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_BIODOME', 'Biodomo geodésico', lambda: piso('biodomo_2.png'), 3, 3, dict(category='decor', backgroundTiles=2)),
    ('JARDIN_HYDRO_TOWER', 'Hidroponía vertical', lambda: piso('hidroponia_1.png'), 2, 2, D),
    ('JARDIN_HYDRO_RACK', 'Estante de cultivo LED', lambda: piso('hidroponia_2.png'), 2, 2, D),
    ('JARDIN_TERRARIUM', 'Terrario', lambda: chico('terrario_1.png'), 1, 1, dict(category='decor')),
    ('JARDIN_GERMINATION', 'Banco de germinación', lambda: piso('germinacion_1.png'), 3, 2, D),
    ('JARDIN_COMPOST', 'Compostera', lambda: piso('composta_1.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('JARDIN_RAIN_BARREL', 'Barril de lluvia', lambda: piso('barril_1.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('JARDIN_DRIP', 'Riego por goteo', goteo, 3, 1, dict(category='misc', backgroundTiles=1)),
    # ── Tecnología ──
    ('JARDIN_SOLAR_PANEL', 'Panel solar', lambda: piso('solar_1.png'), 2, 2, dict(category='electronics', backgroundTiles=1)),
    ('JARDIN_WEATHER_STATION', 'Estación del clima', lambda: angosto('clima_1.png'), 1, 2,
     dict(category='electronics', backgroundTiles=1)),
    ('JARDIN_CONTROL', 'Pantalla de control del jardín', lambda: piso('control_1.png'), 2, 2,
     dict(category='electronics', backgroundTiles=1)),
    ('JARDIN_DRONE', 'Dron de riego', lambda: en_lienzo('dron_2.png', 32, 32), 2, 2,
     dict(category='electronics', backgroundTiles=1)),
    ('JARDIN_SENSOR', 'Sensor de humedad', lambda: chico('sensor_1.png'), 1, 1, dict(category='electronics')),
    # ── Piezas geek ──
    ('JARDIN_SOLAR_TREE', 'Súper-árbol solar', lambda: piso('superarbol_2.png'), 2, 4,
     dict(category='decor', backgroundTiles=3)),
    ('JARDIN_ORBITAL_POD', 'Cápsula de cultivo orbital', lambda: piso('capsula_1.png'), 2, 3,
     dict(category='electronics', backgroundTiles=2)),
    ('JARDIN_SEED_VAULT', 'Arca de semillas', lambda: piso('arca_1.png'), 2, 3, dict(category='storage', backgroundTiles=2)),
    ('JARDIN_BIOREACTOR', 'Biorreactor de algas', lambda: piso('biorreactor_2.png'), 2, 3,
     dict(category='electronics', backgroundTiles=2)),
    ('JARDIN_CARNIVORE', 'Planta carnívora en contención', lambda: piso('carnivora_2.png'), 2, 3,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_MUSHROOMS', 'Hongos bioluminiscentes', lambda: piso('hongos_1.png'), 2, 2, D),
    ('JARDIN_TISSUE_LAB', 'Lab de cultivo de tejidos', lambda: piso('tejidos_1.png'), 2, 2, D),
    ('JARDIN_AERO_TOWER', 'Torre aeropónica', lambda: angosto('aeroponica_1.png'), 1, 3,
     dict(category='decor', backgroundTiles=2)),
    ('JARDIN_MARS_POTATOES', 'Granja de papas marciana', lambda: piso('papas_marte_1.png'), 2, 2, D),
    ('JARDIN_HELMET_POT', 'Casco con brote', lambda: chico('casco_1.png'), 1, 2, dict(category='decor', backgroundTiles=1)),
    ('JARDIN_CORN', 'Maizal bajo lámpara', lambda: piso('maizal_1.png'), 2, 3, dict(category='decor', backgroundTiles=2)),
    ('JARDIN_SPACE_TERRARIUM', 'Terrario con estación', lambda: chico('terrario_estacion_1.png'), 1, 1,
     dict(category='decor')),
    ('JARDIN_SMART_POT', 'Maceta inteligente', lambda: chico('maceta_carita_1.png'), 1, 2,
     dict(category='decor', backgroundTiles=1)),
    ('JARDIN_SOLAR_PERGOLA', 'Pérgola solar con banca', lambda: piso('pergola_solar_1.png'), 2, 3,
     dict(category='decor', backgroundTiles=2)),
    # ── Zona de estar ──
    ('JARDIN_LOUNGER', 'Camastro', lambda: piso('camastro_2.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('JARDIN_PERGOLA', 'Pérgola con foquitos', lambda: piso('pergola_1.png'), 4, 3, dict(category='decor', backgroundTiles=2)),
    ('JARDIN_GRILL', 'Asador', lambda: piso('asador_1.png'), 2, 2, dict(category='misc', backgroundTiles=1)),
    ('JARDIN_REFLECTING_POOL', 'Espejo de agua', lambda: piso('espejo_agua_1.png'), 3, 2,
     dict(category='decor', backgroundTiles=1)),
    ('JARDIN_UMBRELLA', 'Sombrilla', lambda: piso('sombrilla_1.png'), 2, 2, dict(category='decor', backgroundTiles=1)),
    # ── Inventario ──
    ('JARDIN_SHED', 'Cobertizo de herramientas', lambda: piso('cobertizo_1.png'), 3, 3,
     dict(category='storage', backgroundTiles=2)),
    ('JARDIN_TOOL_RACK', 'Tablero de herramientas', lambda: pared('herramientas_1.png'), 3, 2,
     dict(category='wall', canPlaceOnWalls=True)),
    ('JARDIN_SOIL_BAGS', 'Costales de tierra', lambda: piso('costales_2.png'), 2, 2, dict(category='storage', backgroundTiles=1)),
    ('JARDIN_EMPTY_POTS', 'Macetas vacías', lambda: chico('macetas_vacias_1.png'), 1, 1, dict(category='storage')),
    ('JARDIN_POTTING_BENCH', 'Mesa de trasplante', lambda: piso('mesa_trasplante_1.png'), 3, 2,
     dict(category='storage', backgroundTiles=1)),
    ('JARDIN_WATERING_CAN', 'Regadera', lambda: chico('regadera_1.png'), 1, 1, dict(category='misc')),
    # ── Por código ──
    ('JARDIN_RAILING', 'Barandal de vidrio', barandal, 1, 1, dict(category='misc')),
    ('JARDIN_PLAQUE', 'Placa de planta', placa, 1, 1, dict(category='decor')),
]


def main():
    hechas = []
    for id_, nombre, fn, fw, fh, extra in PIEZAS:
        im = fn()
        guardar(id_, nombre, im, fw, fh, **extra)
        hechas.append(im)
    # vistas en tiras de 12 piezas
    k = 4
    for n in range(0, len(hechas), 12):
        grupo = hechas[n:n + 12]
        ancho = sum(i.width * k + 8 for i in grupo) + 8
        alto = max(i.height for i in grupo) * k + 16
        hoja = Image.new('RGBA', (ancho, alto), (70, 70, 90, 255))
        x = 8
        for i in grupo:
            hoja.alpha_composite(i.resize((i.width * k, i.height * k), Image.NEAREST), (x, alto - 8 - i.height * k))
            x += i.width * k + 8
        hoja.save(AQUI / f'vista_x4_{n // 12 + 1}.png')
    print(len(hechas), 'piezas; vistas en', AQUI)


if __name__ == '__main__':
    main()
