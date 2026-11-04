// Plano propio del Cerebro (estilo "laboratorio / centro de datos"): solo el cuarto, 19×11 como los otros cuartos del
// piso Personal, para juntarlo con ellos. Solo decoración por ahora.
// Uso: node features/cerebro/arte/plano.cjs [salida.json]   (por defecto features/cerebro/planos/cerebro.json)
// Fila 0 vacía (ahí se dibujan las cosas de pared), fila 1 pared de arriba, filas 2-9 piso, fila 10 vacía.
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = 19;
const ROWS = 11;
const WALL = 0;
const VOID = 255;
const ASSETS = path.join(__dirname, '..', '..', '..', 'webview-ui', 'public', 'assets', 'furniture');
// Suelo oscuro con brillo frío y pared azul noche.
const FLOOR = { type: 5, color: { h: 215, s: 30, b: -88, c: 15 } }; // floor_3: losetas grandes de panel
const WALL_COLOR = { h: 228, s: 40, b: -100, c: -30 };
// Tapete morado bajo el domo y la consola (carpet_0 = relleno + orilla clara)
const RUG = {
  variant: 0,
  color: { h: 275, s: 55, b: -55, c: 0 },
  accentColor: { h: 190, s: 70, b: 0, c: 0 },
};
const AREA = 'Cerebro';
const DOOR = [
  [0, 6],
  [0, 7],
  [1, 6],
  [1, 7],
]; // puerta compartida con el Directorio y su entrada: nada aquí

const tiles = Array(COLS * ROWS).fill(VOID);
const tileColors = Array(COLS * ROWS).fill(null);
const areaTiles = Array(COLS * ROWS).fill(null);
const set = (c0, c1, r0, r1, type, color, area = null) => {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      tiles[r * COLS + c] = type;
      tileColors[r * COLS + c] = color;
      areaTiles[r * COLS + c] = area;
    }
};
set(0, COLS - 1, 1, 1, WALL, WALL_COLOR); // arriba
set(0, 0, 1, ROWS - 2, WALL, WALL_COLOR); // izquierda
set(COLS - 1, COLS - 1, 1, ROWS - 2, WALL, WALL_COLOR); // derecha
set(1, COLS - 2, 2, ROWS - 2, FLOOR.type, FLOOR.color, AREA);
const carpetTiles = Array(COLS * ROWS).fill(null);
const rug = (c0, c1, r0, r1) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) carpetTiles[r * COLS + c] = RUG;
};
rug(7, 11, 4, 9); // bajo el domo y la consola

const furniture = [
  // En la pared (2 filas de alto: la de abajo cae en la pared; la pantalla de avance, de 1, va en la fila 1)
  ['cerebro-kanban', 'PROYECTOS_KANBAN', 1, 0],
  ['cerebro-tablero-ideas', 'IDEAS_NOTE_BOARD', 5, 0],
  ['cerebro-avance', 'PROYECTOS_PROGRESS_SCREEN', 9, 1],
  ['cerebro-bandeja', 'CORREO_INBOX_SCREEN', 12, 0],
  ['cerebro-calendario', 'SUSCRIPCIONES_CALENDAR_MARKED', 16, 0],
  // Centro: el domo con su consola enfrente
  ['cerebro-domo', 'CEREBRO_DOME', 8, 4],
  ['cerebro-consola', 'CEREBRO_CONSOLE', 8, 7],
  // Rincón de ideas (arriba a la izquierda)
  ['cerebro-foco', 'IDEAS_BULB_ON', 1, 2],
  ['cerebro-escritorio-ideas', 'IDEAS_DESK', 2, 3],
  ['cerebro-frasco', 'IDEAS_JAR', 3, 3],
  ['cerebro-buzon-ideas', 'IDEAS_BOX', 5, 2],
  // Proyectos e impresora (arriba a la derecha)
  ['cerebro-archivero', 'PROYECTOS_FILE_CABINET', 12, 2],
  ['cerebro-impresora', 'CEREBRO_PRINTER', 13, 2],
  ['cerebro-caja-fuerte', 'SUSCRIPCIONES_SAFE', 16, 2],
  // Correo (abajo a la derecha)
  ['cerebro-buzon', 'CORREO_MAILBOX_FLAG_UP', 17, 5],
  ['cerebro-banda', 'CORREO_BELT_LOADED', 13, 9],
  // Plantas
  ['cerebro-planta-1', 'PLANT', 1, 8],
  ['cerebro-planta-2', 'PLANT', 17, 8],
  ['cerebro-planta-3', 'PLANT_2', 6, 2],
  ['cerebro-planta-4', 'JARDIN_FERN', 5, 8],
].map(([uid, type, col, row]) => ({ uid, type, col, row }));

// Revisión de choques: huellas que se enciman (las cosas de mesa van sobre un escritorio, las de pared en la pared)
const manifest = (type) => {
  const m = JSON.parse(fs.readFileSync(path.join(ASSETS, type, 'manifest.json'), 'utf8'));
  return { w: m.footprintW ?? 1, h: m.footprintH ?? 1, wall: !!m.canPlaceOnWalls, surf: !!m.canPlaceOnSurfaces, desk: !!m.isDesk };
};
const floorUse = new Map();
const wallUse = new Map();
const desks = new Set();
const errors = [];
for (const f of furniture) {
  const m = manifest(f.type);
  f._m = m;
  if (m.desk)
    for (let r = f.row; r < f.row + m.h; r++) for (let c = f.col; c < f.col + m.w; c++) desks.add(`${c},${r}`);
}
for (const f of furniture) {
  const m = f._m;
  delete f._m;
  for (let r = f.row; r < f.row + m.h; r++)
    for (let c = f.col; c < f.col + m.w; c++) {
      const k = `${c},${r}`;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) errors.push(`${f.uid} se sale del cuarto en ${k}`);
      if (m.surf) {
        if (!desks.has(k)) errors.push(`${f.uid} no está sobre una mesa (${k})`);
        continue;
      }
      if (m.wall) {
        if (r === ROWS - 1 || (r >= 2 && tiles[r * COLS + c] !== WALL)) errors.push(`${f.uid} no queda en la pared (${k})`);
        const prev = wallUse.get(k);
        if (prev) errors.push(`${f.uid} choca con ${prev} en ${k}`);
        wallUse.set(k, f.uid);
        continue;
      }
      if (tiles[r * COLS + c] === WALL || tiles[r * COLS + c] === VOID) errors.push(`${f.uid} cae en pared/vacío (${k})`);
      if (DOOR.some(([dc, dr]) => dc === c && dr === r)) errors.push(`${f.uid} tapa la puerta (${k})`);
      const prev = floorUse.get(k);
      if (prev) errors.push(`${f.uid} choca con ${prev} en ${k}`);
      floorUse.set(k, f.uid);
    }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: [{ label: AREA, color: '#8b5cf6' }],
  areaTiles,
  carpetTiles,
};
const out = process.argv[2] ?? path.join(__dirname, '..', 'planos', 'cerebro.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
