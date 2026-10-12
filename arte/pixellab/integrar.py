# Integra el plano.json de un cuarto (los muebles que se quitan, ponen o mueven) en la oficina.
#
#   python arte/pixellab/integrar.py <zona>      (zona = carpeta en arte/pixellab/, ej. sotano)
#
# plano.json: {"quitar": [["TIPO", col, fila]], "poner": [{uid, type, col, row}], "mover": [{uid, col, row}],
#              "privado": [{uid, type, col, row}], "piso": {"tipo": n, "color": {h, s, b, c}}}
#
# 1. arte/provisionales/oficina.cjs: cada put('TIPO', col, fila) quitado pasa a quitar() (conserva la numeración de
#    los uid); los muebles nuevos y movidos quedan como putFijo con uid fijo; el piso del cuarto cambia de tipo/color.
# 2. Regenera webview-ui/public/assets/default-layout-1.json con oficina.cjs.
# 3. ~/.pixel-agents/layout.json (el plano local, que se mueve a mano): aplica los mismos cambios sin regenerarlo;
#    los muebles "privado" (arte fuera de git) solo van aquí. Copia el piso del cuarto desde el plano por defecto.
import json
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
OFICINA = RAIZ / 'arte' / 'provisionales' / 'oficina.cjs'
DEFECTO = RAIZ / 'webview-ui' / 'public' / 'assets' / 'default-layout-1.json'
USUARIO = Path.home() / '.pixel-agents' / 'layout.json'

# zona -> (clave del color en el objeto C de oficina.cjs, rectángulo del piso col0, col1, fila0, fila1)
ZONAS = {
    'sotano': ('basement', (37, 42, 18, 28)),
    'senku': ('senku', (37, 42, 2, 10)),
    'jedi': ('library', (1, 12, 2, 10)),
    'taller': ('garage', (1, 13, 18, 28)),
    'becarios': ('interns', (26, 35, 18, 28)),
    'lightlabs': ('web', (29, 35, 2, 10)),
    'aperture': ('aperture', (15, 24, 18, 28)),
    'codigo': ('code', (14, 27, 2, 10)),
}


def main(zona):
    clave, (c0, c1, r0, r1) = ZONAS[zona]
    plano = json.loads((RAIZ / 'arte' / 'pixellab' / zona / 'plano.json').read_text(encoding='utf-8'))
    t = OFICINA.read_text(encoding='utf-8')

    quitar_uids = set()
    for tipo, col, fila in plano.get('quitar', []):
        fijo = re.compile(rf"^putFijo\('([^']+)', '{re.escape(tipo)}', {col}, {fila}\);.*\n", re.M)
        m = fijo.search(t)
        if m:  # mueble nuevo con uid fijo: se borra su línea (no afecta la numeración)
            quitar_uids.add(m.group(1))
            t = t[:m.start()] + t[m.end():]
            continue
        patron = re.compile(rf"^put\('{re.escape(tipo)}', {col}, {fila}\);.*$", re.M)
        if not patron.search(t):
            if f"quitar(); // put('{tipo}', {col}, {fila});" in t:
                continue  # ya estaba quitado
            sys.exit(f"no encuentro put('{tipo}', {col}, {fila}) en oficina.cjs")
        t = patron.sub(f"quitar(); // put('{tipo}', {col}, {fila});", t, count=1)

    fijos = {m['uid']: m for m in plano.get('poner', [])}
    for m in plano.get('mover', []):
        viejo = re.search(rf"putFijo\('{re.escape(m['uid'])}', '([^']+)', \d+, \d+\);", t)
        if not viejo:
            sys.exit(f"no encuentro putFijo('{m['uid']}') para mover")
        fijos[m['uid']] = {'uid': m['uid'], 'type': viejo.group(1), 'col': m['col'], 'row': m['row']}
    for uid, m in fijos.items():
        linea = f"putFijo('{uid}', '{m['type']}', {m['col']}, {m['row']});"
        existente = re.compile(rf"^putFijo\('{re.escape(uid)}', .*$", re.M)
        if existente.search(t):
            t = existente.sub(linea, t, count=1)
        else:
            ultimo = list(re.finditer(r"^putFijo\(.*$", t, re.M))[-1]
            t = t[:ultimo.end()] + '\n' + linea + t[ultimo.end():]

    piso = plano.get('piso')
    if piso:
        col = piso['color']
        t, n = re.subn(rf"^  {clave}: \{{[^}}]*\}},", f"  {clave}: {{ h: {col['h']}, s: {col['s']}, b: {col['b']}, c: {col['c']} }},",
                       t, count=1, flags=re.M)
        t, m = re.subn(rf"^floor\({c0}, {c1}, {r0}, {r1}, \d+, C\.{clave}\);", f"floor({c0}, {c1}, {r0}, {r1}, {piso['tipo']}, C.{clave});",
                       t, count=1, flags=re.M)
        if n != 1 or m != 1:
            sys.exit(f'no pude cambiar el piso de {zona} en oficina.cjs')

    OFICINA.write_text(t, encoding='utf-8', newline='\n')  # en Windows, sin newline escribe CRLF
    subprocess.run(['node', str(OFICINA), str(DEFECTO)], check=True)

    # Plano local
    defecto = json.loads(DEFECTO.read_text(encoding='utf-8'))
    L = json.loads(USUARIO.read_text(encoding='utf-8'))
    quitar = {(tipo, col, fila) for tipo, col, fila in plano.get('quitar', [])}
    nuevos = list(fijos.values()) + plano.get('privado', [])
    uids = {m['uid'] for m in nuevos}
    antes = len(L['furniture'])
    L['furniture'] = [f for f in L['furniture']
                      if f['uid'] not in uids and f['uid'] not in quitar_uids
                      and not (f['uid'].startswith('of-') and ((f['type'], f['col'], f['row']) in quitar
                                                                 or (f['type'].split(':')[0], f['col'], f['row']) in quitar))]
    L['furniture'] += [{'uid': m['uid'], 'type': m['type'], 'col': m['col'], 'row': m['row']} for m in nuevos]
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            i = r * L['cols'] + c
            L['tiles'][i] = defecto['tiles'][i]
            L['tileColors'][i] = defecto['tileColors'][i]
            if defecto.get('carpetTiles'):  # pintura del piso (líneas de bahía, etc.)
                L.setdefault('carpetTiles', [None] * len(L['tiles']))[i] = defecto['carpetTiles'][i]
    L['layoutRevision'] = L.get('layoutRevision', 1) + 1
    USUARIO.write_text(json.dumps(L, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'{zona}: plano local {antes} -> {len(L["furniture"])} muebles')


if __name__ == '__main__':
    main(sys.argv[1])
