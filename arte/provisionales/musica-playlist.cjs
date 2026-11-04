// Sala de música (2026-11-03): las piezas de "playlists del día", de decoración por ahora (la función viene después).
//   - Prensa de vinilos (2×3) a la derecha de la rockola, el bote de "esta no" junto a ella.
//   - El neón "HOY SUENA" (3×1) reemplaza al de DISCOS (mismo lugar y tamaño; pedido del usuario).
// Uso: node arte/provisionales/musica-playlist.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const PIEZAS = [
  { uid: 'musica-playlist-prensa', type: 'MUSICA_PLAYLIST_PRESS', col: 21, row: 26 },
  { uid: 'musica-playlist-bote', type: 'MUSICA_PLAYLIST_REJECT_BIN', col: 23, row: 28 },
];
// Rock Band (decoración por ahora): la guitarra-control en su soporte y el amplificador de práctica, a la izquierda.
const ROCKBAND = [
  { uid: 'musica-rockband-guitarra', type: 'ROCKBAND_GUITAR_STAND', col: 15, row: 21 },
  { uid: 'musica-rockband-ampli', type: 'ROCKBAND_PRACTICE_AMP', col: 16, row: 22 },
];

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  const neon = l.furniture.find((f) => f.uid === 'musica-neon');
  const swap = neon && neon.type !== 'MUSICA_PLAYLIST_NEON';
  if (swap) neon.type = 'MUSICA_PLAYLIST_NEON';
  const faltan = ROCKBAND.filter((p) => !l.furniture.some((f) => f.uid === p.uid));
  for (const p of faltan) l.furniture.push({ ...p });
  if (l.furniture.some((f) => f.uid === PIEZAS[0].uid)) {
    if (swap || faltan.length) fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
    console.log(swap || faltan.length ? 'actualizado:' : 'ya estaba:', file);
    return;
  }
  if (l.cols !== 56) throw new Error(`${file}: se esperaba el plano de 56 columnas (${l.cols})`);
  for (const p of PIEZAS) l.furniture.push({ ...p });
  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file);
}

for (const file of process.argv.slice(2)) apply(file);
