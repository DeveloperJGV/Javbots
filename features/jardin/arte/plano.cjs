// Plano de la azotea / roof garden (piso de hasta arriba del edificio).
// Uso: node features/jardin/arte/plano.cjs [salida.json]   (por defecto features/jardin/planos/azotea.json)
// 37x14: fila 0 vacía (ahí se dibujan las cosas de pared), fila 1 pretil de arriba, filas 2-12 suelo con el barandal
// de vidrio en la fila 12, fila 13 vacía. Tres zonas de izquierda a derecha:
//   - Laboratorio (cols 1-12, deck de madera): invernadero, biodomo, cápsula orbital, arca de semillas, biorreactor...
//   - Huerto (cols 13-24, pasto sintético): súper-árbol, hidroponía, cultivos, riego, panel solar, dron.
//   - Terraza (cols 25-35, losetas): pérgola con foquitos, rockola, cobertizo e inventario, espejo de agua, camastros,
//     asador.
// La fila 6 queda libre de lado a lado (pasillo). Los muebles salen de arte/pixellab/jardin/armar.py (JARDIN_*).
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = 37;
const ROWS = 14;
const WALL = 0;
const VOID = 255;
const PRETIL = { h: 210, s: 8, b: -10, c: -40 }; // concreto claro del pretil
const DECK = { type: 7, color: { h: 30, s: 40, b: -10, c: -35 } }; // duela (floor_6)
const PASTO = { type: 10, color: { h: 100, s: 38, b: -32, c: -25 } }; // pasto sintético (floor_9)
const LOSETA = { type: 11, color: { h: 35, s: 10, b: 10, c: -30 } }; // losetas de terraza (floor_10)
const AREA = 'Azotea'; // nombre provisional

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
set(0, COLS - 1, 1, 1, WALL, PRETIL); // arriba
set(0, 0, 1, ROWS - 2, WALL, PRETIL); // izquierda
set(COLS - 1, COLS - 1, 1, ROWS - 2, WALL, PRETIL); // derecha
set(1, 12, 2, 12, DECK.type, DECK.color, AREA);
set(13, 24, 2, 12, PASTO.type, PASTO.color, AREA);
set(25, 35, 2, 12, LOSETA.type, LOSETA.color, AREA);

// [uid, tipo, col, fila, ancho, alto]  (ancho/alto en cuadros, solo para revisar que nada se encime)
const M = [
  // ── Pared ──
  ['jardin-muro-verde', 'JARDIN_GREEN_WALL', 5, 0, 2, 2],
  ['jardin-colgante-1', 'JARDIN_HANGING_PLANT', 9, 0, 2, 2],
  ['jardin-herramientas', 'JARDIN_TOOL_RACK', 30, 0, 3, 2],
  ['jardin-colgante-2', 'JARDIN_HANGING_PLANT', 22, 0, 2, 2],
  // ── Laboratorio (deck) ──
  ['jardin-invernadero', 'JARDIN_GREENHOUSE', 1, 2, 4, 4],
  ['jardin-biodomo', 'JARDIN_BIODOME', 6, 2, 3, 3],
  ['jardin-terrario-estacion', 'JARDIN_SPACE_TERRARIUM', 9, 4, 1, 1],
  ['jardin-capsula', 'JARDIN_ORBITAL_POD', 10, 2, 2, 3],
  ['jardin-arca', 'JARDIN_SEED_VAULT', 1, 7, 2, 3],
  ['jardin-tejidos', 'JARDIN_TISSUE_LAB', 3, 8, 2, 2],
  ['jardin-biorreactor', 'JARDIN_BIOREACTOR', 6, 7, 2, 3],
  ['jardin-control', 'JARDIN_CONTROL', 8, 8, 2, 2],
  ['jardin-carnivora', 'JARDIN_CARNIVORE', 10, 7, 2, 3],
  ['jardin-casco', 'JARDIN_HELMET_POT', 5, 10, 1, 2],
  ['jardin-germinacion', 'JARDIN_GERMINATION', 6, 10, 3, 2],
  ['jardin-hongos', 'JARDIN_MUSHROOMS', 10, 10, 2, 2],
  ['jardin-terrario', 'JARDIN_TERRARIUM', 3, 11, 1, 1],
  ['jardin-maceta-inteligente', 'JARDIN_SMART_POT', 4, 10, 1, 2],
  // ── Huerto (pasto) ──
  ['jardin-superarbol', 'JARDIN_SOLAR_TREE', 13, 2, 2, 4],
  ['jardin-hidroponia', 'JARDIN_HYDRO_TOWER', 15, 2, 2, 2],
  ['jardin-estante-led', 'JARDIN_HYDRO_RACK', 17, 2, 2, 2],
  ['jardin-aeroponica', 'JARDIN_AERO_TOWER', 19, 2, 1, 3],
  ['jardin-maizal', 'JARDIN_CORN', 20, 2, 2, 3],
  ['jardin-papas', 'JARDIN_MARS_POTATOES', 22, 2, 2, 2],
  ['jardin-tomates', 'JARDIN_TOMATOES', 13, 7, 2, 2],
  ['jardin-lavanda', 'JARDIN_LAVENDER', 15, 7, 2, 2],
  ['jardin-hierbas', 'JARDIN_HERBS', 17, 7, 2, 2],
  ['jardin-limonero', 'JARDIN_LEMON_TREE', 19, 7, 2, 2],
  ['jardin-bambu', 'JARDIN_BAMBOO', 21, 7, 2, 2],
  ['jardin-monstera', 'JARDIN_MONSTERA', 23, 7, 2, 2],
  ['jardin-placa', 'JARDIN_PLAQUE', 19, 9, 1, 1],
  ['jardin-goteo-1', 'JARDIN_DRIP', 13, 9, 3, 1],
  ['jardin-goteo-2', 'JARDIN_DRIP', 15, 9, 0, 0], // se encima a propósito: es una manguera que se camina
  ['jardin-sensor', 'JARDIN_SENSOR', 18, 9, 1, 1],
  ['jardin-panel-solar', 'JARDIN_SOLAR_PANEL', 13, 10, 2, 2],
  ['jardin-clima', 'JARDIN_WEATHER_STATION', 15, 10, 1, 2],
  ['jardin-dron', 'JARDIN_DRONE', 17, 10, 2, 2],
  ['jardin-composta', 'JARDIN_COMPOST', 20, 10, 2, 2],
  ['jardin-barril', 'JARDIN_RAIN_BARREL', 22, 10, 2, 2],
  // ── Terraza (losetas) ──
  ['jardin-pergola', 'JARDIN_PERGOLA', 25, 2, 4, 3],
  ['jardin-mesa-trasplante', 'JARDIN_POTTING_BENCH', 30, 2, 3, 2],
  ['jardin-cobertizo', 'JARDIN_SHED', 33, 2, 3, 3],
  // El reproductor de música (features/musica), junto a la pérgola: la misma pieza que en la sala de música
  ['jardin-reproductor', 'JUKEBOX_CLASSIC', 29, 4, 2, 2],
  // Rincón de wellness (pomodoro), decoración por ahora: reloj de jitomate y letrero de DESCANSO en la pared, tapete de
  // yoga, reloj de arena, agua y pesas. La fila 6 (el pasillo) queda libre.
  ['jardin-pomodoro-reloj', 'POMODORO_TIMER_WALL', 14, 0, 2, 2],
  ['jardin-pomodoro-letrero', 'POMODORO_BREAK_SIGN', 17, 1, 3, 1],
  ['jardin-pomodoro-arena', 'POMODORO_HOURGLASS_BIG', 15, 4, 1, 2],
  ['jardin-pomodoro-tapete', 'POMODORO_YOGA_MAT', 16, 4, 1, 2],
  ['jardin-pomodoro-agua', 'POMODORO_WATER_BOTTLE', 17, 5, 1, 1],
  ['jardin-pomodoro-pesas', 'POMODORO_DUMBBELLS', 18, 5, 1, 1],
  ['jardin-costales', 'JARDIN_SOIL_BAGS', 31, 4, 2, 2],
  ['jardin-macetas-vacias', 'JARDIN_EMPTY_POTS', 33, 5, 1, 1],
  ['jardin-regadera', 'JARDIN_WATERING_CAN', 34, 5, 1, 1],
  ['jardin-espejo-agua', 'JARDIN_REFLECTING_POOL', 26, 7, 3, 2],
  ['jardin-camastro-1', 'JARDIN_LOUNGER', 30, 7, 2, 2],
  ['jardin-camastro-2', 'JARDIN_LOUNGER', 32, 7, 2, 2],
  ['jardin-sombrilla', 'JARDIN_UMBRELLA', 34, 7, 2, 2],
  ['jardin-pergola-solar', 'JARDIN_SOLAR_PERGOLA', 25, 9, 2, 3],
  ['jardin-suculentas', 'JARDIN_SUCCULENTS', 27, 10, 1, 1],
  ['jardin-orquidea', 'JARDIN_ORCHID', 27, 11, 1, 1],
  ['jardin-palmera', 'JARDIN_PALM', 28, 10, 2, 2],
  ['jardin-saguaro', 'JARDIN_SAGUARO', 30, 10, 2, 2],
  ['jardin-bonsai', 'JARDIN_BONSAI', 32, 10, 2, 2],
  ['jardin-asador', 'JARDIN_GRILL', 34, 10, 2, 2],
  ['jardin-helecho', 'JARDIN_FERN', 23, 4, 2, 2],
];
// Barandal de vidrio de lado a lado en la última fila de suelo
for (let c = 1; c <= COLS - 2; c++)
  M.push([`jardin-barandal-${c}`, 'JARDIN_RAILING', c, ROWS - 2, 1, 1]);

// Revisión: nada encimado (salvo los de tamaño 0) y todo dentro del suelo (o de la pared, si es de pared)
const ocupado = new Map();
for (const [uid, , col, row, w, h] of M) {
  for (let r = row; r < row + h; r++)
    for (let c = col; c < col + w; c++) {
      const k = `${c},${r}`;
      if (ocupado.has(k)) throw new Error(`${uid} se encima con ${ocupado.get(k)} en ${k}`);
      ocupado.set(k, uid);
      if (r >= 2 && tiles[r * COLS + c] === VOID)
        throw new Error(`${uid} se sale del suelo en ${k}`);
    }
}
for (let c = 1; c <= COLS - 2; c++)
  if (ocupado.has(`${c},6`)) throw new Error(`el pasillo (fila 6) está tapado en la columna ${c}`);

const furniture = M.map(([uid, type, col, row]) => ({ uid, type, col, row }));
const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: [{ label: AREA, color: '#22c55e' }],
  areaTiles,
};
const out = process.argv[2] ?? path.join(__dirname, '..', 'planos', 'azotea.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(layout, null, 2) + '\n');
console.log('listo:', out, `${COLS}x${ROWS}`, furniture.length, 'muebles');
