// Plano del cuarto de freelance (estilo "cuartel hacker"). features/agenda/arte/piso.cjs lo pone a la derecha del
// cuarto de agenda, en el piso Personal.
// Uso: node arte/pixellab/freelance/plano/plano.cjs [salida.json]   (por defecto freelance.json junto a este script)
// Solo muebles propios del cuarto (ninguno reusado de la oficina). Mismo formato que features/agenda/planos/agenda.json:
// fila 0 vacía (ahí se dibujan las cosas de pared), fila 1 pared de arriba, filas 2-9 suelo, fila 10 vacía.
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = 19;
const ROWS = 11;
const WALL = 0;
const VOID = 255;
// "Sótano hacker": suelo de concreto oscuro con manchas (floor_9) y pared casi negra con tinte morado.
const FLOOR = { type: 10, color: { h: 0, s: 0, b: -55, c: -10 } };
const WALL_COLOR = { h: 275, s: 15, b: -85, c: -40 };
// Tapete viejo morado con orilla magenta bajo los puffs
const RUG = { variant: 0, color: { h: 290, s: 40, b: -55, c: 0 }, accentColor: { h: 315, s: 70, b: -10, c: 0 } };
const AREA = 'Freelance'; // nombre provisional

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
for (let r = 7; r <= 8; r++) for (let c = 3; c <= 6; c++) carpetTiles[r * COLS + c] = RUG;

const furniture = [
  // En la pared
  ['freelance-perfil', 'PERFIL_SCREEN', 1, 0], // features/perfil: the padlock poster went to the storage room
  ['freelance-repisa', 'FREELANCE_SHELF', 3, 0],
  ['freelance-mapa', 'FREELANCE_WORLD_MAP', 7, 0],
  ['freelance-misiones', 'FREELANCE_MISSIONS', 12, 0],
  ['freelance-neon', 'FREELANCE_NEON_404', 16, 1],
  ['freelance-foco', 'FREELANCE_BULB', 5, 0],
  // Puesto principal: escritorio bajo el mapa, silla gamer, lámpara y bote
  ['freelance-escritorio', 'FREELANCE_DESK', 8, 2],
  ['freelance-silla', 'FREELANCE_CHAIR', 9, 3],
  ['freelance-lampara', 'FREELANCE_LAMP', 11, 2],
  ['freelance-bote', 'FREELANCE_BIN', 7, 3],
  // Servidores y cables (izquierda)
  ['freelance-rack', 'FREELANCE_RACK', 1, 2],
  ['freelance-cables', 'FREELANCE_CABLES', 3, 3],
  ['freelance-cajas', 'FREELANCE_BOXES', 5, 2],
  ['freelance-cables-suelo-1', 'FREELANCE_FLOOR_CABLES', 5, 5],
  ['freelance-cables-suelo-2', 'FREELANCE_FLOOR_CABLES', 10, 7],
  // Refri (derecha)
  ['freelance-refri', 'FREELANCE_FRIDGE', 16, 2],
  // Segundo puesto (para propuestas)
  ['freelance-escritorio-2', 'FREELANCE_DESK', 13, 6],
  ['freelance-silla-2', 'FREELANCE_CHAIR', 14, 7],
  // Rincón para pensar
  ['freelance-planta', 'FREELANCE_PLANT', 1, 7],
  ['freelance-puff-1', 'FREELANCE_BEANBAG', 3, 8],
  ['freelance-pizzas', 'FREELANCE_PIZZA', 4, 8],
  ['freelance-puff-2', 'FREELANCE_BEANBAG', 5, 8],
  ['freelance-cactus', 'FREELANCE_CACTUS', 16, 8],
].map(([uid, type, col, row]) => ({ uid, type, col, row }));

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: [{ label: AREA, color: '#22c55e' }],
  areaTiles,
  carpetTiles,
};
const out = process.argv[2] ?? path.join(__dirname, 'freelance.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
