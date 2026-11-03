// Plano propio del cuarto de agenda (estilo "centro de mando"): solo el cuarto, para usarlo como un piso aparte.
// Uso: node features/agenda/arte/plano.cjs [salida.json]   (por defecto features/agenda/planos/agenda.json)
// Fila 0 vacía (ahí se dibujan las cosas de pared), fila 1 pared de arriba, filas 2-9 piso, fila 10 vacía
// (como la orilla de abajo del plano principal, que no lleva pared).
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = 19;
const ROWS = 11;
const WALL = 0;
const VOID = 255;
const FLOOR = { type: 4, color: { h: 215, s: 40, b: -70, c: -30 } };
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -43 };
const AREA = 'Agenda'; // nombre provisional

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

const furniture = [
  // En la pared (2 filas de alto: la de abajo cae en la pared)
  ['agenda-radar', 'AGENDA_RADAR', 3, 0],
  ['agenda-mapa', 'AGENDA_WEEK_MAP', 7, 0],
  ['agenda-tareas', 'AGENDA_TASKS', 13, 0],
  ['agenda-reloj', 'CLOCK', 16, 0],
  // Puesto de mando: la consola bajo el mapa y su banco
  ['agenda-consola', 'AGENDA_CONSOLE', 8, 3],
  ['agenda-banco', 'CUSHIONED_BENCH', 9, 5],
  // Esquinas
  ['agenda-servidor-1', 'SERVER_RACK', 1, 2],
  ['agenda-servidor-2', 'SERVER_RACK', 2, 2],
  ['agenda-lampara', 'LAMP', 16, 2],
  ['agenda-cafetera', 'COFFEE_MAKER', 17, 2],
  ['agenda-planta-1', 'PLANT', 1, 8],
  ['agenda-planta-2', 'PLANT_2', 17, 8],
].map(([uid, type, col, row]) => ({ uid, type, col, row }));

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: [{ label: AREA, color: '#00d2d3' }],
  areaTiles,
};
const out = process.argv[2] ?? path.join(__dirname, '..', 'planos', 'agenda.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
