// Sala de música (2026-11-02): tienda de discos retro donde estaba el laboratorio Aperture.
//   - Cols 15-24, filas 18-28; puerta arriba (cols 19-20). Piso de madera oscura y tapete al centro.
//   - Izquierda, la tienda: estante de discos, casetes, tres cajas de discos, sillón con audífonos y mostrador.
//   - Derecha, el escenario: bocinas, tele de karaoke, batería, micrófono, piano, amplificador de Marty y rockola.
//   - Guiños: guitarra de Guitar Hero en la pared, radio de Portal sobre el mostrador.
//   - Abajo al centro, la cabina de DJ con el tocadiscos (se muda de Becarios, junto con el cuadro de la carátula).
//   - Aperture se quita (sus muebles quedan en la bodega). El Pensador se va a Cómputo y la bodega va al Sótano.
// Uso: node arte/provisionales/sala-musica.cjs <layout.json> [<otro.json> ...]   (si ya se aplicó, no hace nada)
'use strict';
const fs = require('fs');

const FLOOR = { type: 6, color: { h: 18, s: 40, b: -45, c: -55 } };
const RUG = {
  variant: 0,
  color: { h: 300, s: 45, b: -35, c: 0 },
  accentColor: { h: 330, s: 70, b: 10, c: 0 },
};
const AREA = { label: 'Música', color: '#ff4fa3' };

function apply(file) {
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.furniture.some((f) => f.uid.startsWith('musica-'))) {
    console.log('ya estaba:', file);
    return;
  }
  if (l.cols !== 56) throw new Error(`${file}: se esperaba el plano de 56 columnas (${l.cols})`);
  const privado = l.furniture.some((f) => f.uid.startsWith('privado-'));
  const idx = (c, r) => r * l.cols + c;

  // ── 1. Fuera Aperture (y su poste de zona); el tocadiscos y la carátula salen de Becarios ──
  const fuera = new Set(['of-106', 'becarios-tocadiscos', 'becarios-caratula']);
  l.furniture = l.furniture.filter((f) => !f.uid.startsWith('aperture-') && !fuera.has(f.uid));

  // ── 2. Piso, tapete y área ──
  for (let r = 18; r <= 28; r++)
    for (let c = 15; c <= 24; c++) {
      l.tiles[idx(c, r)] = FLOOR.type;
      l.tileColors[idx(c, r)] = FLOOR.color;
      if (l.areaTiles[idx(c, r)] === 'Aperture') l.areaTiles[idx(c, r)] = AREA.label;
    }
  for (const c of [19, 20]) {
    l.tiles[idx(c, 17)] = FLOOR.type; // puerta
    l.tileColors[idx(c, 17)] = FLOOR.color;
  }
  for (let r = 20; r <= 25; r++) for (let c = 19; c <= 21; c++) l.carpetTiles[idx(c, r)] = RUG;
  l.areas = l.areas.map((a) => (a.label === 'Aperture' ? AREA : a));

  // ── 3. Muebles ──
  const put = (uid, type, col, row) => l.furniture.push({ uid: `musica-${uid}`, type, col, row });
  // Pared de arriba (la puerta está en 19-20)
  put('neon', 'NEON_DISCOS', 15, 17);
  put('guitarra', 'GUITAR_HERO_WALL', 18, 16); // a futuro, acceso a las canciones custom de Rock Band
  put('caratula', 'ALBUM_FRAME', 21, 16);
  // Tienda
  put('estante-discos', 'RECORD_SHELF', 15, 18);
  put('estante-casetes', 'CASSETTE_SHELF', 17, 18);
  put('caja-1', 'RECORD_CRATE', 15, 21);
  put('caja-2', 'RECORD_CRATE_B', 15, 22);
  put('caja-3', 'RECORD_CRATE_C', 15, 23);
  put('sillon', 'LISTENING_CHAIR', 17, 23);
  put('mostrador', 'RECORD_COUNTER', 15, 26);
  put('radio-portal', 'PORTAL_RADIO', 17, 26); // sobre el mostrador: la que toca "Still Alive"
  // Escenario
  put('bocina-1', 'STAGE_SPEAKER', 21, 18);
  put('karaoke', 'KARAOKE_TV', 22, 18);
  put('bocina-2', 'STAGE_SPEAKER', 24, 18);
  put('microfono', 'MIC_STAND', 22, 21);
  put('bateria', 'DRUM_KIT', 23, 21);
  put('piano', 'UPRIGHT_PIANO', 23, 24);
  put('amplificador', 'MARTY_AMP', 21, 24); // el de Marty en Volver al futuro
  put('rockola', 'JUKEBOX_CLASSIC', 23, 27);
  // Cabina con el tocadiscos encima (su orilla de abajo a media cabina)
  put('cabina', 'DJ_BOOTH', 19, 27);
  put('tocadiscos', 'TURNTABLE', 19, 26);
  // Bodega en el Sótano
  l.furniture.push({ uid: 'sotano-bodega', type: 'STORAGE_SHELF', col: 41, row: 22 });

  // ── 4. Piezas privadas (solo en planos que ya las tienen; el del proyecto no) ──
  if (privado) {
    put('disco-de-oro', 'USER_GOLD_RECORD', 23, 16);
    const pensador = l.furniture.find((f) => f.uid === 'privado-pensador');
    if (pensador) Object.assign(pensador, { col: 53, row: 6 }); // Cómputo, junto a la pared derecha
  }

  fs.writeFileSync(file, JSON.stringify(l, null, 2) + '\n');
  console.log('listo:', file, l.furniture.length, 'muebles');
}

for (const file of process.argv.slice(2)) apply(file);
