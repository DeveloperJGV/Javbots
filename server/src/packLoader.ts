import * as fs from 'fs';
import * as path from 'path';

import { isValidOfficeId, type OfficeDef } from '../../core/src/offices.js';

/**
 * Private packs (privado/<name>/ in the repo, never committed; esbuild copies them to dist/packs/<name>/): what a
 * pack adds that isn't code. Its code features are compiled in through the feature registry.
 *
 * dist/packs/<name>/pack.json:
 *   {
 *     "name": "mi-paquete",
 *     "mainOffice": { "label": "Casa", "title": "Javbots · Casa" },    // optional: names of the main office
 *     "offices": [{ "id": "trabajo", "label": "Trabajo", "profiles": ["trabajo"], "defaultLayout": "planos/x.json" }]
 *   }
 * dist/packs/<name>/assets/   characters, pets and furniture: the pack folder is loaded like an external asset dir.
 */
export interface LoadedPacks {
  offices: OfficeDef[];
  /** Starting layout of each pack office, by id. */
  officeLayouts: Record<string, Record<string, unknown> | null>;
  mainOffice: { label?: string; title?: string };
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

/** Reads every pack under `<distRoot>/packs/`. Nothing there = no packs (the public build). */
export function loadPacks(distRoot: string): LoadedPacks {
  const out: LoadedPacks = {
    offices: [],
    officeLayouts: {},
    mainOffice: {},
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
      const layout = str(o.defaultLayout);
      // The layout must stay inside the pack folder
      const file = layout ? path.resolve(packDir, layout) : null;
      out.officeLayouts[office.id] =
        file && file.startsWith(packDir + path.sep) && fs.existsSync(file)
          ? (readJson(file) as Record<string, unknown> | null)
          : null;
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
