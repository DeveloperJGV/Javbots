// Pone el tablero de uso (USAGE_METER) en la pared de Código, entre la máscara y la ventana, sin tocar lo demás.
// Uso: node features/usage/arte/poner-en-plano.cjs <layout.json> [<otro.json> ...]   (si ya está, no hace nada)
const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (layout.furniture.some((f) => f.uid === 'codigo-tablero-uso')) {
    console.log('ya estaba:', file);
    continue;
  }
  layout.furniture.push({ uid: 'codigo-tablero-uso', type: 'USAGE_METER', col: 27, row: 0 });
  fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
  console.log('listo:', file);
}
