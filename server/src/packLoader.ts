import * as fs from 'fs';
import * as path from 'path';

import {
  type FloorSpec,
  isValidOfficeId,
  MAIN_OFFICE,
  type OfficeDef,
} from '../../core/src/offices.js';

/**
 * Private packs (privado/<name>/ in the repo, never committed; esbuild copies them to dist/packs/<name>/): what a
 * pack adds that isn't code. Its code features are compiled in through the feature registry.
 *
 * dist/packs/<name>/pack.json:
 *   {
 *     "name": "mi-paquete",
 *     "mainOffice": { "label": "Casa", "title": "Javbots · Casa" },    // optional: names of the main office
 *     "offices": [{ "id": "estudio", "label": "Estudio", "profiles": ["estudio"], "defaultLayout": "planos/x.json" }]
 *   }
 * Both "mainOffice" and each office may list "floors" besides the ground floor (core/src/offices.ts):
 *     "floors": [{ "id": "azotea", "level": 2, "button": "A", "label": "Azotea", "defaultLayout": "planos/y.json" }]
 * dist/packs/<name>/assets/   characters, pets and furniture: the pack folder is loaded like an external asset dir.
 */
export interface LoadedPacks {
  offices: OfficeDef[];
  /** Starting layout of each pack office, by id. */
  officeLayouts: Record<string, Record<string, unknown> | null>;
  mainOffice: { label?: string; title?: string };
  /** Floors the packs add to their offices and to the main office (officeRegistry.addFloors). */
  floors: FloorSpec[];
  /** Asset folders of the packs (characters, pets, furniture). */
  assetDirs: string[];
  names: string[];
}

const PACKS_DIR = 'packs';
const PACK_FILE = 'pack.json';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v.slice(0, 80) : undefined;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
  } catch (err) {
    console.warn(`[Packs] No se pudo leer ${file}:`, (err as Error).message);
    return null;
  }
}

/** A layout file shipped in dist (a feature's floor), or null when it is missing or not a JSON object. */
export function readLayoutFile(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  const raw = readJson(file);
  return isObject(raw) ? raw : null;
}

/** A layout file of the pack (it must stay inside the pack folder), or null. */
function readPackLayout(packDir: string, value: unknown): Record<string, unknown> | null {
  const layout = str(value);
  const file = layout ? path.resolve(packDir, layout) : null;
  return file && file.startsWith(packDir + path.sep) && fs.existsSync(file)
    ? (readJson(file) as Record<string, unknown> | null)
    : null;
}

/** The "floors" of an office in pack.json (validated later, by officeRegistry.addFloors). */
function readFloors(value: unknown, office: string, packDir: string): FloorSpec[] {
  const out: FloorSpec[] = [];
  for (const f of Array.isArray(value) ? value : []) {
    const roof = isObject(f) && f.roof === true;
    if (!isObject(f) || typeof f.id !== 'string' || (typeof f.level !== 'number' && !roof))
      continue;
    const floor: FloorSpec = {
      id: f.id,
      level: typeof f.level === 'number' ? f.level : 0,
      label: str(f.label) ?? f.id,
      office,
      defaultLayout: readPackLayout(packDir, f.defaultLayout),
    };
    const button = str(f.button);
    if (button) floor.button = button;
    if (roof) floor.roof = true;
    out.push(floor);
  }
  return out;
}

/** Reads every pack under `<distRoot>/packs/`. Nothing there = no packs (the public build). */
export function loadPacks(distRoot: string): LoadedPacks {
  const out: LoadedPacks = {
    offices: [],
    officeLayouts: {},
    mainOffice: {},
    floors: [],
    assetDirs: [],
    names: [],
  };
  const root = path.join(distRoot, PACKS_DIR);
  if (!fs.existsSync(root)) return out;
  for (const dir of fs.readdirSync(root).sort()) {
    const packDir = path.join(root, dir);
    const raw = readJson(path.join(packDir, PACK_FILE));
    if (!isObject(raw)) continue;
    out.names.push(str(raw.name) ?? dir);
    if (isObject(raw.mainOffice)) {
      out.mainOffice = {
        label: str(raw.mainOffice.label) ?? out.mainOffice.label,
        title: str(raw.mainOffice.title) ?? out.mainOffice.title,
      };
      out.floors.push(...readFloors(raw.mainOffice.floors, MAIN_OFFICE, packDir));
    }
    for (const o of Array.isArray(raw.offices) ? raw.offices : []) {
      if (!isObject(o) || !isValidOfficeId(o.id) || out.offices.some((x) => x.id === o.id))
        continue;
      const office: OfficeDef = {
        id: o.id,
        label: str(o.label) ?? o.id,
        profiles: strings(o.profiles),
      };
      const title = str(o.title);
      if (title) office.title = title;
      const alsoInMain = strings(o.alsoInMain);
      if (alsoInMain.length) office.alsoInMain = alsoInMain;
      const mainProfile = str(o.mainProfile);
      if (mainProfile) office.mainProfile = mainProfile;
      out.offices.push(office);
      out.officeLayouts[office.id] = readPackLayout(packDir, o.defaultLayout);
      out.floors.push(...readFloors(o.floors, office.id, packDir));
    }
    const assets = path.join(packDir, 'assets');
    if (fs.existsSync(assets)) out.assetDirs.push(packDir); // loaded like an external dir: <dir>/assets/…
  }
  if (out.names.length) {
    console.log(
      `[Packs] ${out.names.join(', ')}: ${out.offices.length} oficina(s) además de la principal`,
    );
  }
  return out;
}
