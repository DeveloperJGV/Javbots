// Builds the layout of the Personal floor: its rooms in a 2×2 grid. In each grid row the rooms sit side by side, each
// sharing its left wall with the right wall of the one before, with a door (and a doormat) in every shared wall. The
// bottom row starts on the top row's last line (both are the empty band under/over a room), so the bottom rooms' top
// wall is the wall between the two rows; each pair one above the other gets a one-tile door through it.
//   agenda (features/agenda/planos/agenda.json, from plano.cjs)      | freelance (arte/pixellab/freelance/plano/freelance.json)
//   directorio (features/directorio/planos/directorio.json)          | cerebro (features/cerebro/planos/cerebro.json)
// Writes features/agenda/planos/piso.json, the floor's default layout (server/constants.ts AGENDA_FLOOR_LAYOUT_FILE).
//   node features/agenda/arte/piso.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const GRID = [
  [read('features/agenda/planos/agenda.json'), read('arte/pixellab/freelance/plano/freelance.json')],
  [read('features/directorio/planos/directorio.json'), read('features/cerebro/planos/cerebro.json')],
];
const OUT = path.join(root, 'features/agenda/planos/piso.json');

const FLOOR = 4; // walkable floor tile, as in the rooms
const DOOR_ROWS = [6, 7]; // rows (in a room) of the door in each shared side wall
// Column (in a room) of the door between the room above and the room below, per grid column: a spot with no wall
// piece in the lower room's wall and nothing in the way on either side.
const DOWN_DOOR_COLS = [10, 8];
const DOORMAT = {
  variant: 0,
  color: { h: 20, s: 25, b: -55, c: 0 },
  accentColor: { h: 35, s: 70, b: 0, c: 0 },
};

const rooms = GRID.flat();
if (rooms.some((r) => r.rows !== rooms[0].rows)) throw new Error('Todos los cuartos deben tener las mismas filas');
GRID[1].forEach((room, i) => {
  if (room.cols !== GRID[0][i].cols)
    throw new Error('Los cuartos de una misma columna deben tener el mismo ancho');
});

// Column shifts: each room starts on the previous room's last column (their side walls become one wall).
const colShifts = [];
let cols = 0;
for (const room of GRID[0]) {
  const shift = colShifts.length ? cols - 1 : 0;
  colShifts.push(shift);
  cols = shift + room.cols;
}
// Row shifts: the bottom rooms start on the top rooms' last row (the empty band below them).
const roomRows = rooms[0].rows;
const rowShifts = GRID.map((_, i) => i * (roomRows - 1));
const rows = rowShifts[rowShifts.length - 1] + roomRows;

const tiles = new Array(cols * rows).fill(255);
const tileColors = new Array(cols * rows).fill(null);
const areaTiles = new Array(cols * rows).fill(null);
// Carpets (layoutSerializer: Array<CarpetTile | null>, parallel to tiles); a room without them leaves null.
const carpetTiles = new Array(cols * rows).fill(null);
GRID.forEach((gridRow, gr) =>
  gridRow.forEach((src, gc) => {
    const dx = colShifts[gc];
    const dy = rowShifts[gr];
    for (let r = 0; r < src.rows; r++) {
      for (let c = 0; c < src.cols; c++) {
        const from = r * src.cols + c;
        const to = (r + dy) * cols + c + dx;
        tiles[to] = src.tiles[from]; // a shared wall or band is the same tile in both rooms
        tileColors[to] = src.tileColors ? (src.tileColors[from] ?? null) : null;
        areaTiles[to] = src.areaTiles ? (src.areaTiles[from] ?? null) : null;
        carpetTiles[to] = src.carpetTiles ? (src.carpetTiles[from] ?? null) : null;
      }
    }
  }),
);

const at = (r, c) => r * cols + c;
// Side doors: floor tiles in each shared side wall, like the floor of the room on its left, with a doormat.
for (const dy of rowShifts) {
  for (const wallCol of colShifts.slice(1)) {
    for (const r of DOOR_ROWS) {
      const i = at(r + dy, wallCol);
      tiles[i] = tiles[i - 1] ?? FLOOR;
      tileColors[i] = tileColors[i - 1];
      carpetTiles[i] = DOORMAT;
    }
  }
}
// Doors down: the band and the wall between a room and the one below it, like the floor above, doormat in the wall.
for (let gr = 1; gr < GRID.length; gr++) {
  const band = rowShifts[gr]; // the empty band (the lower room's row 0)
  const wall = band + 1; // the lower room's top wall
  colShifts.forEach((dx, gc) => {
    const c = dx + DOWN_DOOR_COLS[gc];
    const above = at(band - 1, c);
    for (const r of [band, wall]) {
      tiles[at(r, c)] = tiles[above] ?? FLOOR;
      tileColors[at(r, c)] = tileColors[above];
    }
    carpetTiles[at(wall, c)] = DOORMAT;
  });
}

const furniture = GRID.flatMap((gridRow, gr) =>
  gridRow.flatMap((room, gc) =>
    room.furniture.map((f) => ({ ...f, col: f.col + colShifts[gc], row: f.row + rowShifts[gr] })),
  ),
);
const uids = new Set();
for (const f of furniture) {
  if (uids.has(f.uid)) throw new Error(`uid repetido: ${f.uid}`);
  uids.add(f.uid);
}

const layout = {
  version: rooms[0].version,
  cols,
  rows,
  tiles,
  tileColors,
  furniture,
  areas: rooms.flatMap((room) => room.areas ?? []),
  areaTiles,
  carpetTiles,
};
fs.writeFileSync(OUT, JSON.stringify(layout, null, 2) + '\n');
console.log(`piso.json: ${cols}×${rows}, ${furniture.length} muebles`);
