# Revisa plano.json del sótano (nada encimado, puerta libre) y dibuja una vista previa ampliada del cuarto.
# Uso: python arte/pixellab/sotano/revisar.py <carpeta-salida>
import colorsys
import json
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
ASSETS = RAIZ / 'webview-ui' / 'public' / 'assets'
plano = json.loads((Path(__file__).parent / 'plano.json').read_text(encoding='utf-8'))
salida = Path(sys.argv[1])
salida.mkdir(parents=True, exist_ok=True)

ACTUALES = [('ZONE_SIGN_ERROR', 38, 16, 'of-127'), ('LAMP', 42, 19, 'of-128'), ('BIN', 42, 28, 'of-130'),
            ('ISAAC', 39, 22, 'sotano-isaac'), ('HEART_PEDESTAL', 41, 22, 'sotano-corazon'),
            ('ISAAC_CHEST', 38, 25, 'sotano-cofre'), ('TRAPDOOR', 40, 26, 'sotano-trampilla')]
quitar = {tuple(q) for q in plano['quitar']}
muebles = [dict(type=t, col=c, row=r, uid=u) for t, c, r, u in ACTUALES if (t, c, r) not in quitar]
for m in plano['mover']:
    next(x for x in muebles if x['uid'] == m['uid']).update(col=m['col'], row=m['row'])
muebles += plano['poner']


def man(t):
    return json.loads((ASSETS / 'furniture' / t / 'manifest.json').read_text(encoding='utf-8'))


ocupado, errores = {}, []
for m in muebles:
    mf = man(m['type'])
    for dy in range(mf['footprintH']):
        for dx in range(mf['footprintW']):
            c, r = m['col'] + dx, m['row'] + dy
            if mf['canPlaceOnWalls'] and dy < mf['footprintH'] - 1:
                continue  # parte de arriba de un mueble de pared: sobresale, no ocupa
            if (c, r) in ocupado:
                errores.append(f"{m['uid']} se encima con {ocupado[(c, r)]} en {(c, r)}")
            ocupado[(c, r)] = m['uid']
            if mf['canPlaceOnWalls'] and not (r == 17 and c in (37, 38, 41, 42)):
                errores.append(f"{m['uid']}: debe ir en la pared (fila 17, sin tapar la puerta)")
            if not mf['canPlaceOnWalls'] and not (37 <= c <= 42 and 18 <= r <= 28):
                errores.append(f"{m['uid']} se sale del cuarto en {(c, r)}")
bloqueado = set()
for m in muebles:
    mf = man(m['type'])
    if mf['canPlaceOnWalls']:
        continue
    for dy in range(mf['backgroundTiles'], mf['footprintH']):
        for dx in range(mf['footprintW']):
            bloqueado.add((m['col'] + dx, m['row'] + dy))
for p in [(39, 18), (40, 18)]:
    if p in bloqueado:
        errores.append(f'la entrada {p} está tapada')
# Camino: desde la entrada se llega a todo cuadro libre
libres = {(c, r) for c in range(37, 43) for r in range(18, 29)} - bloqueado
vistos, pila = set(), [(39, 18)]
while pila:
    p = pila.pop()
    if p in vistos or p not in libres:
        continue
    vistos.add(p)
    pila += [(p[0] + 1, p[1]), (p[0] - 1, p[1]), (p[0], p[1] + 1), (p[0], p[1] - 1)]
if libres - vistos:
    errores.append(f'cuadros libres sin camino: {sorted(libres - vistos)}')
print('\n'.join(errores) or f'OK: {len(muebles)} muebles, {len(libres)} cuadros caminables, todos con camino')

# ── Vista previa ──
def colorear(im, h, s, b, c):
    out = im.convert('RGBA').copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, bb, a = px[x, y]
            lum = (0.299 * r + 0.587 * g + 0.114 * bb) / 255
            lum = max(0, min(1, 0.5 + (lum - 0.5) * (100 + c) / 100 + b / 200))
            rgb = colorsys.hls_to_rgb(h / 360, lum, s / 100)
            px[x, y] = tuple(int(v * 255) for v in rgb) + (a,)
    return out


p = plano['piso']
piso = colorear(Image.open(ASSETS / 'floors' / f"floor_{p['tipo'] - 1}.png"), **p['color'])
pasillo = colorear(Image.open(ASSETS / 'floors' / 'floor_5.png'), 18, 32, -36, -72)
pared = Image.new('RGBA', (16, 16), (34, 38, 48, 255))
C0, R0 = 36, 15
cuarto = Image.new('RGBA', (8 * 16, 15 * 16), (10, 10, 12, 255))
for r in range(R0, R0 + 15):
    for c in range(C0, C0 + 8):
        x, y = (c - C0) * 16, (r - R0) * 16
        if r <= 16 or (r == 17 and c in (39, 40)):
            cuarto.alpha_composite(pasillo, (x, y))
        elif 37 <= c <= 42 and 18 <= r <= 28:
            cuarto.alpha_composite(piso, (x, y))
        elif r <= 29:
            cuarto.alpha_composite(pared, (x, y))
orden = sorted(muebles, key=lambda m: (not man(m['type'])['backgroundTiles'] == man(m['type'])['footprintH'],
                                       m['row'] + man(m['type'])['footprintH']))
for m in orden:
    im = Image.open(ASSETS / 'furniture' / m['type'] / f"{m['type']}.png").convert('RGBA')
    cuarto.alpha_composite(im, ((m['col'] - C0) * 16, (m['row'] - R0) * 16))
cuarto.resize((cuarto.width * 5, cuarto.height * 5), Image.NEAREST).save(salida / 'cuarto.png')

# Hoja con todas las piezas del sótano
ids = ['ISAAC', 'HEART_PEDESTAL', 'ONION_PEDESTAL', 'ISAAC_CHEST', 'TRAPDOOR', 'BASEMENT_DOOR', 'BASEMENT_TORCH',
       'BASEMENT_FIRE', 'BASEMENT_ROCK', 'BASEMENT_ROCK_MARKED', 'ISAAC_BOMB', 'ISAAC_COINS', 'TEAR_STAINS']
ims = [Image.open(ASSETS / 'furniture' / i / f'{i}.png').convert('RGBA') for i in ids]
hoja = Image.new('RGBA', (sum(i.width + 6 for i in ims) + 6, 40), (0, 0, 0, 255))
x = 6
for im in ims:
    for yy in range(4, 36, 16):
        for xx in range(x, x + im.width, 16):
            hoja.alpha_composite(piso, (xx, yy))
    hoja.alpha_composite(im, (x, 4))
    x += im.width + 6
hoja.resize((hoja.width * 5, hoja.height * 5), Image.NEAREST).save(salida / 'piezas.png')
print('vista previa en', salida)
