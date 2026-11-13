// Puts the deals kiosk (OFERTAS_KIOSK, 1x2, its top tile is background) on a layout. Idempotent: fixed uid
// 'ofertas-kiosco'; if it is already there, nothing changes.
// Uso:
//   node features/ofertas/arte/poner.cjs [plano.json] [--piso <id>] [--oficina <id>] [--en <col>,<fila>] [--real]
//   Sin plano.json usa <HOME>/.pixel-agents/<archivo del piso> (HOME o USERPROFILE del proceso); --piso agenda (el piso
//   Personal, por defecto) da layout~agenda.json, --piso pb la planta baja (layout.json); --oficina cambia la oficina.
//   Se niega a escribir en la carpeta .pixel-agents real del usuario a menos que se pase --real.
//   Sin --en: en el piso Personal prueba primero el lugar propuesto (cuarto Cerebro, entre la impresora y la caja fuerte
//   de las suscripciones); si no está libre, o en otro plano, toma la primera loseta libre y caminable que no corte el paso.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const UID = 'ofertas-kiosco';
const TYPE = 'OFERTAS_KIOSK';
const KIOSK = { footprintW: 1, footprintH: 2, backgroundTiles: 1 };
const WALL = 0;
const VOID = 255;
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const MAIN_OFFICE = 'principal'; // core/src/offices.ts
const GROUND_FLOOR = 'pb';
const DEFAULT_FLOOR = 'agenda'; // the Personal floor (features/agenda/server/constants.ts AGENDA_FLOOR_ID)
// Preferred top tile per floor (col, row). Personal floor: Cerebro room, back row, between the printer
// (CEREBRO_PRINTER at 31,12) and the subscriptions safe (SUSCRIPCIONES_SAFE at 34,12): the money things together,
// lined up with them (same floor row) and away from the doors.
const PREFERRED = { agenda: [33, 12] };

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ASSET_DIRS = [
  path.join(ROOT, 'webview-ui', 'public', 'assets', 'furniture'),
  ...listDirs(path.join(ROOT, 'features')).map((f) =>
    path.join(ROOT, 'features', f, 'assets', 'furniture'),
  ),
];

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Footprint of every furniture id the repo ships (asset id -> {footprintW, footprintH, backgroundTiles, wall}). */
function loadFootprints() {
  const out = new Map();
  const walk = (node, inherited) => {
    if (node.type === 'asset') {
      out.set(node.id, {
        footprintW: node.footprintW,
        footprintH: node.footprintH,
        backgroundTiles: inherited.backgroundTiles || 0,
        wall: !!inherited.canPlaceOnWalls,
      });
      return;
    }
    for (const m of node.members || []) walk(m, inherited);
  };
  for (const dir of ASSET_DIRS) {
    for (const name of listDirs(dir)) {
      const file = path.join(dir, name, 'manifest.json');
      if (!fs.existsSync(file)) continue;
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      walk(m.type === 'asset' ? { ...m, type: 'asset' } : m, m);
    }
  }
  return out;
}

function floorFileName(office, floor) {
  const base = office === MAIN_OFFICE ? 'layout.json' : `layout-${office}.json`;
  return floor === GROUND_FLOOR ? base : base.replace(/\.json$/, `~${floor}.json`);
}

function parseArgs(argv) {
  const opts = {
    file: null,
    floor: DEFAULT_FLOOR,
    floorGiven: false,
    office: MAIN_OFFICE,
    at: null,
    real: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--real') opts.real = true;
    else if (a === '--piso') {
      opts.floor = argv[++i];
      opts.floorGiven = true;
    } else if (a === '--oficina') opts.office = argv[++i];
    else if (a === '--en') {
      const m = /^(\d+),(\d+)$/.exec(argv[++i] || '');
      if (!m) throw new Error('--en espera <col>,<fila>, por ejemplo --en 35,13');
      opts.at = [Number(m[1]), Number(m[2])];
    } else if (a.startsWith('--')) throw new Error(`opción desconocida: ${a}`);
    else opts.file = a;
  }
  if (!opts.floor || !opts.office) throw new Error('--piso y --oficina esperan un id');
  return opts;
}

/** The user's real home, from the OS account (not from HOME/USERPROFILE, which a test may point elsewhere). */
function realHome() {
  try {
    return os.userInfo().homedir;
  } catch {
    return null;
  }
}

function isInside(file, dir) {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Tiles a character can't walk on (furniture rows below their background rows), as "col,row". */
function blockedTiles(layout, footprints) {
  const blocked = new Set();
  for (const f of layout.furniture) {
    const fp = footprints.get(f.type) || {
      footprintW: 1,
      footprintH: 1,
      backgroundTiles: 0,
      wall: false,
    };
    if (fp.wall) continue; // hangs on the wall
    for (let dr = fp.backgroundTiles; dr < fp.footprintH; dr++)
      for (let dc = 0; dc < fp.footprintW; dc++) blocked.add(`${f.col + dc},${f.row + dr}`);
  }
  return blocked;
}

function walkable(layout, blocked, c, r) {
  if (c < 0 || r < 0 || c >= layout.cols || r >= layout.rows) return false;
  const t = layout.tiles[r * layout.cols + c];
  return t !== WALL && t !== VOID && !blocked.has(`${c},${r}`);
}

/** Number of separate walkable regions (4-neighbour flood fill). */
function regionCount(layout, blocked) {
  const seen = new Set();
  let regions = 0;
  for (let r = 0; r < layout.rows; r++)
    for (let c = 0; c < layout.cols; c++) {
      if (seen.has(`${c},${r}`) || !walkable(layout, blocked, c, r)) continue;
      regions++;
      seen.add(`${c},${r}`);
      const queue = [[c, r]];
      while (queue.length) {
        const [qc, qr] = queue.pop();
        for (const [dc, dr] of NEIGHBOURS) {
          const k = `${qc + dc},${qr + dr}`;
          if (!seen.has(k) && walkable(layout, blocked, qc + dc, qr + dr)) {
            seen.add(k);
            queue.push([qc + dc, qr + dr]);
          }
        }
      }
    }
  return regions;
}

/** A doorway: walkable, with wall or void on both sides of it (left and right, or above and below), or a mat on
 *  a tile that touches a wall (the doormats piso.cjs puts in each door). */
function isDoor(layout, c, r) {
  const solid = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= layout.cols || rr >= layout.rows) return true;
    const t = layout.tiles[rr * layout.cols + cc];
    return t === WALL || t === VOID;
  };
  if (solid(c, r)) return false;
  if ((solid(c - 1, r) && solid(c + 1, r)) || (solid(c, r - 1) && solid(c, r + 1))) return true;
  return (
    !!layout.carpetTiles?.[r * layout.cols + c] &&
    NEIGHBOURS.some(([dc, dr]) => solid(c + dc, r + dr))
  );
}

/**
 * Why the kiosk can't go with its top tile at (col, row), or null if it can: its floor tile (the bottom one) must be
 * free walkable floor with no carpet, away from doors; neither tile can overlap other furniture (wall pieces
 * included); the top one can't be void; the tile in front must be walkable (so someone can stand there); and taking
 * the floor tile must not split the walkable floor in two.
 */
function whyNot(layout, footprints, blocked, col, row) {
  const floorRow = row + KIOSK.backgroundTiles;
  if (col < 0 || row < 0 || col >= layout.cols || floorRow + 1 >= layout.rows)
    return 'fuera del plano';
  if (layout.tiles[row * layout.cols + col] === VOID) return 'la loseta de arriba está vacía';
  if (!walkable(layout, blocked, col, floorRow)) return 'la loseta del piso no está libre';
  if (layout.carpetTiles?.[floorRow * layout.cols + col]) return 'hay tapete';
  if ([[0, 0], ...NEIGHBOURS].some(([dc, dr]) => isDoor(layout, col + dc, floorRow + dr)))
    return 'junto a una puerta';
  for (const f of layout.furniture) {
    const fp = footprints.get(f.type) || { footprintW: 1, footprintH: 1 };
    if (
      col >= f.col &&
      col < f.col + fp.footprintW &&
      floorRow >= f.row &&
      row < f.row + fp.footprintH
    )
      return `encima de ${f.uid}`;
  }
  if (!walkable(layout, blocked, col, floorRow + 1)) return 'no hay dónde pararse enfrente';
  if (
    regionCount(layout, new Set([...blocked, `${col},${floorRow}`])) !==
    regionCount(layout, blocked)
  )
    return 'cortaría el paso';
  return null;
}

function findSpot(layout, footprints, blocked) {
  for (let r = 0; r < layout.rows; r++)
    for (let c = 0; c < layout.cols; c++)
      if (!whyNot(layout, footprints, blocked, c, r)) return [c, r];
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const file = path.resolve(
    opts.file || path.join(home, '.pixel-agents', floorFileName(opts.office, opts.floor)),
  );
  const real = realHome();
  if (real && isInside(file, path.join(real, '.pixel-agents')) && !opts.real) {
    console.error(
      `No toco la oficina real (${file}) sin --real. Para probar, apunta HOME y USERPROFILE a otra carpeta.`,
    );
    process.exit(2);
  }
  if (!fs.existsSync(file)) throw new Error(`no existe el plano: ${file}`);
  const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
  const there = layout.furniture.find((f) => f.uid === UID);
  if (there) {
    console.log(`ya estaba: ${file} (columna ${there.col}, fila ${there.row})`);
    return;
  }
  const footprints = loadFootprints();
  const blocked = blockedTiles(layout, footprints);
  let spot = null;
  if (opts.at) {
    const why = whyNot(layout, footprints, blocked, ...opts.at);
    if (why) throw new Error(`no cabe en ${opts.at.join(',')}: ${why}`);
    spot = opts.at;
  } else {
    // With a file of its own, the preferred spot only applies if --piso says which floor it is
    const preferred = !opts.file || opts.floorGiven ? PREFERRED[opts.floor] : null;
    if (preferred && !whyNot(layout, footprints, blocked, ...preferred)) spot = preferred;
    else spot = findSpot(layout, footprints, blocked);
  }
  if (!spot) throw new Error(`no encontré una loseta libre para el quiosco en ${file}`);
  const [col, row] = spot;
  layout.furniture.push({ uid: UID, type: TYPE, col, row });
  fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
  const area = layout.areaTiles?.[(row + 1) * layout.cols + col];
  console.log(
    `listo: ${file} — columna ${col}, fila ${row} (pisa la fila ${row + 1}${area ? `, cuarto ${area}` : ''})`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

module.exports = { whyNot, findSpot, blockedTiles, loadFootprints };
