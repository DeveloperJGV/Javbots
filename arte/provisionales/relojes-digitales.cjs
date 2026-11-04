// Relojes digitales (2026-11-03): el usuario no quiere relojes de manecillas. Cambia cada CLOCK (de manecillas, 1x2 de
// pared) por RELOJ_DIGITAL (mismo tamaño y lugar; la hora real la pinta ambientFurniture.ts).
// Uso: node arte/provisionales/relojes-digitales.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  const relojes = l.furniture.filter((f) => f.type === 'CLOCK');
  for (const f of relojes) f.type = 'RELOJ_DIGITAL';
  if (relojes.length) fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log(relojes.length ? `listo (${relojes.length}):` : 'ya estaba:', file);
}
