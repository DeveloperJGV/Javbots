// Bodega ordenada (2026-11-03): el Sótano deja de ser el cuarto de The Binding of Isaac.
//   - Cols 37-42, filas 18-28; puerta arriba (cols 39-40). Suelo de madera clara.
//   - Se queda el muñeco ISAAC (sotano-isaac), la bodega (sotano-bodega), el rack de conexiones (sotano-conexiones),
//     la puerta (sotano-puerta) y el letrero de zona (of-127). Se va lo demás de Isaac.
//   - Estantes con cajas de colores arriba, racks de contenedores abajo, tarima, escalera, diablito y cajas.
//     El pasillo del centro (cols 39-40) queda libre desde la puerta.
//   - En Código, el servidor (codigo-rack) se cambia por una cama de perrito con juguetes genéricos.
// Uso: node arte/provisionales/bodega-ordenada.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const FLOOR = { type: 7, color: { h: 35, s: 35, b: 5, c: -45 } }; // duela clara (floor_6)
const FUERA = new Set([
  'sotano-antorcha',
  'sotano-fogata-1',
  'sotano-fogata-2',
  'sotano-corazon',
  'sotano-cebolla',
  'sotano-lagrimas-1',
  'sotano-trampilla',
  'sotano-roca-1',
  'sotano-roca-marcada',
  'sotano-cofre',
  'sotano-bomba',
  'codigo-rack',
]);
const NUEVOS = [
  // Bodega (Sótano)
  ['almacen-estante-1', 'ALMACEN_SHELF', 37, 18],
  ['almacen-estante-2', 'ALMACEN_SHELF', 41, 18],
  ['almacen-cajas-1', 'ALMACEN_BOXES', 37, 20],
  ['almacen-cajas-2', 'ALMACEN_BOXES', 38, 20],
  ['almacen-diablito', 'ALMACEN_DOLLY', 41, 20],
  ['almacen-rack-1', 'ALMACEN_RACK', 37, 25],
  ['almacen-rack-2', 'ALMACEN_RACK', 41, 25],
  ['almacen-escalera', 'ALMACEN_LADDER', 37, 27],
  ['almacen-tarima', 'ALMACEN_PALLET', 41, 27],
  // Código: rincón del perrito donde estaba el servidor
  ['codigo-perrito-cama', 'DOG_BED', 14, 7],
  ['codigo-perrito-pelota', 'DOG_BALL', 16, 8],
  ['codigo-perrito-hueso', 'DOG_BONE', 14, 9],
  ['codigo-perrito-cuerda', 'DOG_ROPE', 15, 9],
];

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.furniture.some((f) => f.uid.startsWith('almacen-'))) {
    console.log('ya estaba:', file);
    return;
  }
  if (l.cols !== 56) throw new Error(`${file}: se esperaba el plano de 56 columnas (${l.cols})`);
  const idx = (c, r) => r * l.cols + c;
  const antes = l.furniture.length;
  l.furniture = l.furniture.filter((f) => !FUERA.has(f.uid));
  const quitados = antes - l.furniture.length;

  for (let r = 18; r <= 28; r++)
    for (let c = 37; c <= 42; c++) {
      l.tiles[idx(c, r)] = FLOOR.type;
      l.tileColors[idx(c, r)] = FLOOR.color;
    }
  for (const c of [39, 40]) {
    const i = idx(c, 17);
    if (l.tiles[i] !== 0 && l.tiles[i] !== 255) {
      l.tiles[i] = FLOOR.type; // puerta
      l.tileColors[i] = FLOOR.color;
    }
  }
  const ocupado = new Set(l.furniture.map((f) => f.uid));
  for (const [uid, type, col, row] of NUEVOS) {
    if (ocupado.has(uid)) throw new Error(`uid repetido: ${uid}`);
    l.furniture.push({ uid, type, col, row });
  }
  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log(`listo: ${file} (quitados ${quitados}, nuevos ${NUEVOS.length})`);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node arte/provisionales/bodega-ordenada.cjs <layout.json> [<otro.json> ...]');
  process.exit(1);
}
for (const f of files) apply(f);
