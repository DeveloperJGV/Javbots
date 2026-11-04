// Plano propio del Directorio (estilo "vestíbulo de edificio"): solo el cuarto, 19×11 como los otros cuartos del piso
// Personal, para juntarlo con ellos.
// Uso: node features/directorio/arte/plano.cjs [salida.json]   (por defecto features/directorio/planos/directorio.json)
// Fila 0 vacía (ahí se dibujan las cosas de pared), fila 1 pared de arriba, filas 2-9 piso, fila 10 vacía.
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = 19;
const ROWS = 11;
const WALL = 0;
const VOID = 255;
// Piso de ajedrez (mármol cálido) y pared verde oscuro de vestíbulo.
const FLOOR = { type: 9, color: { h: 32, s: 25, b: -30, c: -50 } };
const WALL_COLOR = { h: 150, s: 35, b: -80, c: -30 };
// Tapete vino del acceso al mostrador y de la sala de espera (carpet_0 = relleno + orilla clara)
const RUG = {
  variant: 0,
  color: { h: 350, s: 50, b: -65, c: 0 },
  accentColor: { h: 45, s: 70, b: 0, c: 0 },
};
const AREA = 'Directorio'; // nombre provisional

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
rug(8, 8, 5, 9); // camino al mostrador
rug(2, 5, 6, 9); // sala de espera

const furniture = [
  // En la pared (2 filas de alto: la de abajo cae en la pared)
  ['directorio-buzones', 'DIRECTORIO_MAILBOXES', 1, 0],
  ['directorio-tablero', 'DIRECTORIO_BOARD', 3, 0],
  ['directorio-ventana-1', 'WINDOW', 7, 0],
  ['directorio-reloj', 'DIRECTORIO_CLOCK', 9, 1],
  ['directorio-ventana-2', 'WINDOW', 11, 0],
  ['directorio-llaves', 'DIRECTORIO_KEYS', 13, 0],
  ['directorio-librero', 'BOOKSHELF', 15, 1],
  ['directorio-maceta-colgante', 'HANGING_PLANT', 17, 0],
  // Mostrador con su campanita, el teléfono encima y la silla de quien atiende, detrás
  ['directorio-silla', 'CUSHIONED_CHAIR_FRONT', 8, 2],
  ['directorio-mostrador', 'DIRECTORIO_DESK', 7, 3],
  ['directorio-telefono', 'DIRECTORIO_PHONE', 8, 3],
  // Sala de espera a la izquierda
  ['directorio-planta-grande', 'DIRECTORIO_PALM', 1, 6],
  ['directorio-mesita', 'DIRECTORIO_COFFEE_TABLE', 3, 6],
  ['directorio-sofa', 'DIRECTORIO_SOFA', 2, 8],
  ['directorio-lampara', 'DIRECTORIO_LAMP', 5, 7],
  // Bancas a la derecha y rincones
  ['directorio-sillon', 'DIRECTORIO_SETTEE', 13, 8],
  ['directorio-palma-2', 'DIRECTORIO_PALM', 16, 5],
  ['directorio-planta-1', 'DIRECTORIO_TOPIARY', 1, 2],
  ['directorio-cafetera', 'COFFEE_MAKER', 15, 2],
  ['directorio-planta-2', 'DIRECTORIO_TOPIARY', 17, 8],
  ['directorio-cesto', 'BIN', 11, 4],
].map(([uid, type, col, row]) => ({ uid, type, col, row }));

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: [{ label: AREA, color: '#c9a227' }],
  areaTiles,
  carpetTiles,
};
const out = process.argv[2] ?? path.join(__dirname, '..', 'planos', 'directorio.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
