// Builds the layout of the Personal floor: its rooms side by side, left to right, each sharing its left wall with the
// right wall of the one before, with a door (and a doormat) in every shared wall:
//   agenda (features/agenda/planos/agenda.json, from plano.cjs)
//   freelance (arte/pixellab/freelance/plano/freelance.json)
//   directorio (features/directorio/planos/directorio.json, from its plano.cjs)
// Writes features/agenda/planos/piso.json, the floor's default layout (server/constants.ts AGENDA_FLOOR_LAYOUT_FILE).
//   node features/agenda/arte/piso.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const ROOMS = [
  'features/agenda/planos/agenda.json',
  'arte/pixellab/freelance/plano/freelance.json',
  'features/directorio/planos/directorio.json',
  'features/cerebro/planos/cerebro.json',
].map((file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
const OUT = path.join(root, 'features/agenda/planos/piso.json');

const FLOOR = 4; // walkable floor tile, as in the rooms
const DOOR_ROWS = [6, 7]; // rows of the door in each shared wall
const DOORMAT = {
  variant: 0,
  color: { h: 20, s: 25, b: -55, c: 0 },
  accentColor: { h: 35, s: 70, b: 0, c: 0 },
};

const rows = ROOMS[0].rows;
if (ROOMS.some((r) => r.rows !== rows)) throw new Error('Todos los cuartos deben tener las mismas filas');
// Each room starts on the previous room's last column: their side walls become one shared wall.
const shifts = [];
let cols = 0;
for (const room of ROOMS) {
  const shift = shifts.length ? cols - 1 : 0;
  shifts.push(shift);
  cols = shift + room.cols;
}

const tiles = new Array(cols * rows);
const tileColors = new Array(cols * rows).fill(null);
const areaTiles = new Array(cols * rows).fill(null);
// Carpets (layoutSerializer: Array<CarpetTile | null>, parallel to tiles); a room without them leaves null.
const carpetTiles = new Array(cols * rows).fill(null);
ROOMS.forEach((src, k) => {
  const dx = shifts[k];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < src.cols; c++) {
      const from = r * src.cols + c;
      const to = r * cols + c + dx;
      tiles[to] = src.tiles[from]; // a room's left wall overwrites the previous right wall: same tile
      tileColors[to] = src.tileColors ? (src.tileColors[from] ?? null) : null;
      areaTiles[to] = src.areaTiles ? (src.areaTiles[from] ?? null) : null;
      carpetTiles[to] = src.carpetTiles ? (src.carpetTiles[from] ?? null) : null;
    }
  }
});

// The doors: floor tiles in each shared wall, like the floor of the room on its left, with a doormat.
for (const wallCol of shifts.slice(1)) {
  for (const r of DOOR_ROWS) {
    const i = r * cols + wallCol;
    tiles[i] = tiles[i - 1] ?? FLOOR;
    tileColors[i] = tileColors[i - 1];
    carpetTiles[i] = DOORMAT;
  }
}

const furniture = ROOMS.flatMap((room, k) =>
  room.furniture.map((f) => ({ ...f, col: f.col + shifts[k] })),
);
const uids = new Set();
for (const f of furniture) {
  if (uids.has(f.uid)) throw new Error(`uid repetido: ${f.uid}`);
  uids.add(f.uid);
}

const layout = {
  version: ROOMS[0].version,
  cols,
  rows,
  tiles,
  tileColors,
  furniture,
  areas: ROOMS.flatMap((room) => room.areas ?? []),
  areaTiles,
  carpetTiles,
};
fs.writeFileSync(OUT, JSON.stringify(layout, null, 2) + '\n');
console.log(`piso.json: ${cols}×${rows}, ${furniture.length} muebles`);
