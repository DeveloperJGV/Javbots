// Código grande + sala de cómputo de becarios (2026-10-24), sobre un plano ya hecho, sin regenerarlo:
//   - Quita las paredes de Light Labs y Senku: Código ocupa toda la fila de arriba (cols 14-42) con 2 escritorios y
//     una mesa de 4 más. Las piezas de Mega Man se juntan abajo de Light Labs; Senku queda como rincón (zona de permiso).
//   - Agrega 12 columnas a la derecha: sala de cómputo de becarios (zona `computers`) con 9 escritorios, puerta a
//     Código y al pasillo.
// Uso: node arte/provisionales/codigo-grande.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const OLD_COLS = 44;
const NEW_COLS = 56;
const WALL = 0;
const VOID = 255;
const CODE_FLOOR = { type: 4, color: { h: 222, s: 35, b: -62, c: -30 } };
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -43 };
const COMPUTERS_FLOOR = { type: 4, color: { h: 170, s: 30, b: -58, c: -30 } };

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.cols !== OLD_COLS) {
    console.log('ya estaba:', file, `${l.cols}x${l.rows}`);
    return;
  }
  const rows = l.rows;
  // ── 1. 12 columnas más a la derecha (todo lo que existe se queda en su lugar) ──
  const widen = (arr, fillValue) => {
    if (!arr) return arr;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < NEW_COLS; c++) out.push(c < OLD_COLS ? arr[r * OLD_COLS + c] : fillValue);
    }
    return out;
  };
  l.tiles = widen(l.tiles, VOID);
  l.tileColors = widen(l.tileColors, null);
  l.carpetTiles = widen(l.carpetTiles, null);
  l.areaTiles = widen(l.areaTiles, null);
  l.cols = NEW_COLS;
  const idx = (c, r) => r * NEW_COLS + c;
  const set = (c0, c1, r0, r1, type, color, area) => {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        l.tiles[idx(c, r)] = type;
        l.tileColors[idx(c, r)] = color;
        if (area !== undefined) l.areaTiles[idx(c, r)] = area;
      }
  };

  // ── 2. Código ocupa Light Labs y Senku (sin paredes entre ellos) ──
  set(28, 42, 2, 10, CODE_FLOOR.type, CODE_FLOOR.color);
  for (let r = 2; r <= 9; r++) for (let c = 28; c <= 36; c++) l.areaTiles[idx(c, r)] = 'Código';
  for (let r = 2; r <= 9; r++) for (let c = 37; c <= 42; c++) l.areaTiles[idx(c, r)] = 'Senku';
  l.areas = l.areas.filter((a) => a.label !== 'Light Labs');

  // ── 3. Sala de cómputo de becarios: cols 44-54, filas 2-16 ──
  set(43, 55, 1, 1, WALL, WALL_COLOR); // pared de arriba
  set(55, 55, 1, 17, WALL, WALL_COLOR); // derecha
  set(43, 55, 17, 17, WALL, WALL_COLOR); // abajo
  set(44, 54, 2, 16, COMPUTERS_FLOOR.type, COMPUTERS_FLOOR.color, 'Cómputo');
  set(43, 43, 7, 8, CODE_FLOOR.type, CODE_FLOOR.color); // puerta desde Código (rincón de Senku)
  set(43, 43, 12, 13, COMPUTERS_FLOOR.type, COMPUTERS_FLOOR.color); // puerta desde el pasillo
  l.areas.push({ label: 'Cómputo', color: '#10ac84', zoneKind: 'computers' });

  // ── 4. Muebles ──
  const byUid = new Map(l.furniture.map((f) => [f.uid, f]));
  const move = (uid, col, row) => {
    const f = byUid.get(uid);
    if (!f) throw new Error(`no está ${uid} en ${file}`);
    Object.assign(f, { col, row });
  };
  const put = (uid, type, col, row) => {
    if (byUid.has(uid)) return;
    const f = { uid, type, col, row };
    l.furniture.push(f);
    byUid.set(uid, f);
  };
  const deskPod = (prefix, col, row) => {
    put(`${prefix}-escritorio`, 'DESK_FRONT', col, row);
    put(`${prefix}-pc`, 'PC_FRONT_OFF', col + 1, row);
    put(`${prefix}-banco`, 'CUSHIONED_BENCH', col + 1, row + 2);
  };
  const tablePod = (prefix, col, row) => {
    put(`${prefix}-mesa`, 'TABLE_FRONT', col, row);
    put(`${prefix}-silla-1`, 'WOODEN_CHAIR_SIDE', col - 1, row);
    put(`${prefix}-silla-2`, 'WOODEN_CHAIR_SIDE', col - 1, row + 2);
    put(`${prefix}-silla-3`, 'WOODEN_CHAIR_SIDE:left', col + 3, row);
    put(`${prefix}-silla-4`, 'WOODEN_CHAIR_SIDE:left', col + 3, row + 2);
    put(`${prefix}-pc-1`, 'PC_SIDE', col, row);
    put(`${prefix}-pc-2`, 'PC_SIDE', col, row + 2);
    put(`${prefix}-pc-3`, 'PC_SIDE:left', col + 2, row);
    put(`${prefix}-pc-4`, 'PC_SIDE:left', col + 2, row + 2);
  };

  // Código: lo que estorbaba a los puestos nuevos
  move('codigo-cafetera', 26, 2); // entre los escritorios de arriba
  const post = l.furniture.find((f) => f.type === 'ZONE_POST_CODE');
  if (post) Object.assign(post, { col: 14, row: 3 });
  deskPod('codigo-4', 27, 2);
  deskPod('codigo-5', 31, 2);
  tablePod('codigo-mesa-2', 25, 6);
  // Light Labs: todo junto abajo (la cápsula se queda arriba a la derecha)
  move('light-consola', 29, 6);
  move('light-banco', 30, 8);
  move('light-etank', 29, 8);
  move('light-vitrina-proto', 33, 6);
  move('light-rush', 35, 6);
  move('light-mesa', 33, 8);
  const webPost = l.furniture.find((f) => f.type === 'ZONE_POST_WEB');
  if (webPost) Object.assign(webPost, { col: 35, row: 8 });

  // Cómputo de becarios: 3 filas de 3 escritorios
  for (const [i, row] of [3, 8, 13].entries()) {
    for (const [j, col] of [44, 48, 52].entries()) deskPod(`computo-${i + 1}-${j + 1}`, col, row);
  }
  for (const c of [45, 49, 53]) put(`computo-ventana-${c}`, 'WINDOW', c, 0);
  put('computo-reloj', 'RELOJ_DIGITAL', 51, 0);
  put('computo-letrero', 'ZONE_POST_INTERNS', 54, 9);
  // El pasillo se abre a la sala: la planta que tapaba la puerta baja una fila
  const plant = l.furniture.find((f) => f.type === 'PLANT_2' && f.col === 42 && f.row === 12);
  if (plant) plant.row = 15;

  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file, `${l.cols}x${l.rows}`, l.furniture.length, 'muebles');
}

for (const file of process.argv.slice(2)) apply(file);
