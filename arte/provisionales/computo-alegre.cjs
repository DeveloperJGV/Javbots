// Sala de cómputo con más vida (2026-10-25), sobre el plano que dejó codigo-grande.cjs:
//   - 6 escritorios en vez de 9, cada uno con su juguete; la fila de abajo es una esquina de café y snacks.
//   - Piso de madera, tapete, plantas, lámparas y pósters. Nada en la fila 16: la pared de abajo lo tapa.
//   - Sin sillones, puffs, tele ni arcade: esos llaman al tiempo libre y el descanso es en la sala de descanso.
// Uso: node arte/provisionales/computo-alegre.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const WOOD_FLOOR = { type: 6, color: { h: 28, s: 38, b: -30, c: -60 } };
const RUG = {
  variant: 0,
  color: { h: 12, s: 50, b: -22, c: 0 },
  accentColor: { h: 40, s: 75, b: 20, c: 0 },
};

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!l.furniture.some((f) => f.uid === 'computo-3-1-escritorio')) {
    console.log('ya estaba:', file);
    return;
  }
  const idx = (c, r) => r * l.cols + c;

  // ── 1. Piso de madera y tapete en la esquina de café ──
  for (let r = 2; r <= 16; r++)
    for (let c = 44; c <= 54; c++) l.tileColors[idx(c, r)] = WOOD_FLOOR.color;
  for (let r = 2; r <= 16; r++)
    for (let c = 44; c <= 54; c++) l.tiles[idx(c, r)] = WOOD_FLOOR.type;
  for (const r of [12, 13]) l.tiles[idx(43, r)] = WOOD_FLOOR.type; // puerta del pasillo
  for (const r of [12, 13]) l.tileColors[idx(43, r)] = WOOD_FLOOR.color;
  for (let r = 13; r <= 16; r++) for (let c = 47; c <= 51; c++) l.carpetTiles[idx(c, r)] = RUG;

  // ── 2. Fuera la tercera fila de escritorios ──
  l.furniture = l.furniture.filter((f) => !f.uid.startsWith('computo-3-'));
  const put = (uid, type, col, row) => {
    if (l.furniture.some((f) => f.uid === uid)) return;
    l.furniture.push({ uid, type, col, row });
  };

  // ── 3. Cada escritorio con lo suyo ──
  put('computo-groot', 'BABY_GROOT', 44, 4);
  put('computo-rubik', 'RUBIK_CUBE', 50, 4);
  put('computo-pokebola', 'POKEBALL', 54, 4);
  put('computo-cafe-1', 'COFFEE', 46, 9);
  put('computo-gameboy', 'GAMEBOY', 48, 9);
  put('computo-cafe-2', 'COFFEE', 52, 9);
  put('computo-cactus', 'CACTUS', 47, 3);
  put('computo-lampara-1', 'LAMP', 51, 3);
  put('computo-lava', 'LAVA_LAMP', 47, 8);
  put('computo-planta-1', 'PLANT', 51, 8);

  // ── 4. Esquina de café y snacks (abajo) ──
  put('computo-maquina', 'VENDING_MACHINE', 53, 13);
  put('computo-cafetera', 'COFFEE_MAKER', 52, 14);
  put('computo-mesa-cafe', 'COFFEE_TABLE', 48, 14);
  put('computo-cafe-3', 'COFFEE', 48, 14);
  put('computo-tazas', 'MUG_TABLE', 50, 15);
  put('computo-planta-grande', 'LARGE_PLANT', 44, 13);
  put('computo-planta-2', 'PLANT_2', 54, 11);
  put('computo-lampara-2', 'LAMP', 46, 14);

  // ── 5. Paredes ──
  put('computo-colgante-1', 'HANGING_PLANT', 44, 0);
  put('computo-tetris', 'POSTER_TETRIS', 47, 0);
  put('computo-invader', 'POSTER_INVADER', 50, 0);
  put('computo-colgante-2', 'HANGING_PLANT', 54, 0);

  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file, l.furniture.length, 'muebles');
}

for (const file of process.argv.slice(2)) apply(file);
