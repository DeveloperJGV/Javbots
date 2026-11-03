// Pone el tablero de conexiones (CONNECTIONS_RACK) en el Sótano, junto a la bodega, sin tocar lo demás.
// Uso: node features/conexiones/arte/poner-en-plano.cjs <layout.json> [<otro.json> ...]   (si ya está, no hace nada)
const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (layout.furniture.some((f) => f.uid === 'sotano-conexiones')) {
    console.log('ya estaba:', file);
    continue;
  }
  layout.furniture.push({ uid: 'sotano-conexiones', type: 'CONNECTIONS_RACK', col: 37, row: 22 });
  fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
  console.log('listo:', file);
}
