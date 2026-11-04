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
// "Mando cálido": suelo de duela café (floor_6) y pared de paneles claros, para distinguirlo del cuarto de freelance.
const FLOOR = { type: 7, color: { h: 28, s: 45, b: -28, c: -45 } };
const WALL_COLOR = { h: 35, s: 20, b: -20, c: -10 };
// Tapete ámbar bajo la consola y el sillón (carpet_0 = relleno + orilla clara)
const RUG = { variant: 0, color: { h: 30, s: 60, b: -35, c: 0 }, accentColor: { h: 40, s: 80, b: 10, c: 0 } };
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
const carpetTiles = Array(COLS * ROWS).fill(null);
for (let r = 3; r <= 6; r++) for (let c = 7; c <= 11; c++) carpetTiles[r * COLS + c] = RUG;

const furniture = [
  // En la pared (2 filas de alto: la de abajo cae en la pared)
  ['agenda-radar', 'AGENDA_RADAR', 3, 0],
  ['agenda-mapa', 'AGENDA_WEEK_MAP', 7, 0],
  ['agenda-tareas', 'AGENDA_TASKS', 13, 0],
  ['agenda-reloj', 'MANDO_CLOCK', 16, 1],
  ['agenda-estado-1', 'MANDO_STATUS', 5, 0],
  ['agenda-estado-2', 'MANDO_STATUS', 11, 0],
  // Puesto de mando: la consola bajo el mapa, su sillón y dos faros de aviso
  ['agenda-consola', 'AGENDA_CONSOLE', 8, 3],
  ['agenda-sillon', 'MANDO_CHAIR', 9, 4],
  ['agenda-faro-1', 'MANDO_BEACON', 7, 2],
  ['agenda-faro-2', 'MANDO_BEACON', 11, 2],
  // Consolas laterales
  ['agenda-consola-izq', 'MANDO_CONSOLE', 4, 3],
  ['agenda-consola-der', 'MANDO_CONSOLE', 13, 3],
  // Abajo: globo holográfico y antena
  ['agenda-globo', 'MANDO_HOLO_GLOBE', 4, 7],
  ['agenda-antena', 'MANDO_DISH', 13, 7],
  // El reproductor de música (features/musica): la misma pieza que en la sala de música, entre el globo y la antena;
  // su fila de arriba se camina, así que el paso hacia la puerta de la derecha (filas 6-7) queda libre
  ['agenda-reproductor', 'JUKEBOX_CLASSIC', 8, 7],
  // Esquinas
  ['agenda-servidor', 'MANDO_SERVER', 1, 2],
  ['agenda-lampara', 'MANDO_BRASS_LAMP', 15, 2],
  ['agenda-librero', 'MANDO_BOOKSHELF', 1, 5],
  ['agenda-archivero', 'MANDO_FILE_CABINET', 16, 5],
  ['agenda-cafetera', 'MANDO_COFFEE', 16, 2],
  ['agenda-planta-1', 'MANDO_PALM', 1, 8],
  ['agenda-planta-2', 'MANDO_BONSAI', 16, 8],
  // Ideas de salida (decoración por ahora; la función viene después): tablero de polaroids y frasco de citas
  ['agenda-salidas-tablero', 'AGENDA_SALIDAS_BOARD', 1, 0],
  ['agenda-salidas-frasco', 'AGENDA_SALIDAS_JAR_FULL', 15, 6],
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
  carpetTiles,
};
const out = process.argv[2] ?? path.join(__dirname, '..', 'planos', 'agenda.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
