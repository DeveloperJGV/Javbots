// Pone el tocadiscos y el cuadro de la carátula en un plano (layout.json) sin tocar lo demás.
// Uso: node features/musica/arte/poner-en-plano.cjs <layout.json>
//   El cuadro del velero de Becarios se cambia por el de la carátula; el tocadiscos va abajo de él, junto a la
//   puerta de Becarios. Si ya están, no hace nada.
const fs = require('fs');

const file = process.argv[2];
const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
const has = (uid) => layout.furniture.some((f) => f.uid === uid);
let changed = false;

const boat = layout.furniture.find(
  (f) => f.uid === 'becarios-velero' && f.type === 'BOAT_PAINTING',
);
if (boat && !has('becarios-caratula')) {
  Object.assign(boat, { uid: 'becarios-caratula', type: 'ALBUM_FRAME' });
  changed = true;
}
if (!has('becarios-tocadiscos')) {
  layout.furniture.push({ uid: 'becarios-tocadiscos', type: 'TURNTABLE', col: 28, row: 18 });
  changed = true;
}
if (changed) fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
console.log(changed ? `listo: ${file}` : `ya estaba: ${file}`);
