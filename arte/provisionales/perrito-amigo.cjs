// Segunda cama de perrito en Código (2026-11-03, "son dos amigos"): la azul (DOG_BED_2) junto a la beige, y los
// juguetes pasan a la fila de abajo de las dos camas. Va después de bodega-ordenada.cjs.
// Uso: node arte/provisionales/perrito-amigo.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const POSICIONES = {
  'codigo-perrito-cama': [14, 7],
  'codigo-perrito-cama-2': [16, 7],
  'codigo-perrito-hueso': [14, 9],
  'codigo-perrito-cuerda': [15, 9],
  'codigo-perrito-pelota': [16, 9],
};

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.furniture.some((f) => f.uid === 'codigo-perrito-cama-2')) {
    console.log('ya estaba:', file);
    return;
  }
  if (!l.furniture.some((f) => f.uid === 'codigo-perrito-cama')) {
    throw new Error(`${file}: falta la primera cama (corre antes bodega-ordenada.cjs)`);
  }
  l.furniture.push({ uid: 'codigo-perrito-cama-2', type: 'DOG_BED_2', col: 0, row: 0 });
  for (const f of l.furniture) {
    const p = POSICIONES[f.uid];
    if (p) [f.col, f.row] = p;
  }
  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node arte/provisionales/perrito-amigo.cjs <layout.json> [<otro.json> ...]');
  process.exit(1);
}
for (const f of files) apply(f);
