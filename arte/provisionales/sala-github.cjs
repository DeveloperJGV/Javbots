// Sala de GitHub (2026-10-25), abajo de la sala de cómputo y junto al sótano, sobre el plano de computo-alegre.cjs:
//   - Cols 44-54, filas 18-28; puerta desde Cómputo en la pared de arriba (cols 49-50).
//   - Tres filas de archiveros (GITHUB_CABINET, features/github): cada uno es un repo, el más reciente arriba a la
//     izquierda. Pasillo al centro con tapete verde.
//   - En la pared de arriba: el tablero de contribuciones (GITHUB_GRAPH) y el corcho de PRs (GITHUB_PRS).
// Uso: node arte/provisionales/sala-github.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const WALL = 0;
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -43 };
const FLOOR = { type: 4, color: { h: 215, s: 25, b: -66, c: -30 } };
const AISLE = {
  variant: 0,
  color: { h: 140, s: 45, b: -40, c: 0 },
  accentColor: { h: 135, s: 60, b: 0, c: 0 },
};

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.furniture.some((f) => f.uid.startsWith('github-'))) {
    console.log('ya estaba:', file);
    return;
  }
  if (l.cols !== 56) throw new Error(`${file}: falta codigo-grande.cjs (${l.cols} columnas)`);
  const idx = (c, r) => r * l.cols + c;
  const set = (c0, c1, r0, r1, type, color, area) => {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        l.tiles[idx(c, r)] = type;
        l.tileColors[idx(c, r)] = color;
        l.areaTiles[idx(c, r)] = area;
      }
  };

  // ── 1. Cuarto ──
  set(43, 43, 18, 28, WALL, WALL_COLOR, null); // izquierda (la del sótano)
  set(55, 55, 17, 28, WALL, WALL_COLOR, null); // derecha
  set(44, 54, 18, 28, FLOOR.type, FLOOR.color, 'GitHub');
  set(49, 50, 17, 17, FLOOR.type, FLOOR.color, 'GitHub'); // puerta desde Cómputo
  for (let r = 17; r <= 28; r++) for (let c = 49; c <= 50; c++) l.carpetTiles[idx(c, r)] = AISLE;
  l.areas.push({ label: 'GitHub', color: '#6e5494' });

  // ── 2. Muebles ──
  const put = (uid, type, col, row) => l.furniture.push({ uid, type, col, row });
  for (const [i, row] of [19, 22, 25].entries()) {
    for (const col of [44, 45, 46, 47, 48, 51, 52, 53, 54])
      put(`github-archivero-${i + 1}-${col}`, 'GITHUB_CABINET', col, row);
  }
  put('github-contribuciones', 'GITHUB_GRAPH', 45, 16);
  put('github-prs', 'GITHUB_PRS', 52, 16);
  put('github-planta-1', 'PLANT', 44, 27);
  put('github-planta-2', 'PLANT_2', 54, 27);

  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file, l.furniture.length, 'muebles');
}

for (const file of process.argv.slice(2)) apply(file);
