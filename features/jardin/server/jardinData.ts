import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  JardinCareKind,
  JardinInboxItem,
  JardinPlantInput,
  JardinSupplyCategory,
} from '../../../core/src/messages.js';
import {
  DEFAULT_CARE_TIME,
  DEFAULT_EVENT_PREFIX,
  DEFAULT_GARDEN_FOLDER,
  DEFAULT_GARDEN_TASK_LIST,
  DEFAULT_PLANTS_CALENDAR,
  JARDIN_DATA_FILE,
  JARDIN_DIR,
  LOG_PREFIX,
  MAX_EVERY_DAYS,
  MAX_TEXT,
} from './constants.js';

export const CARE_KINDS: readonly JardinCareKind[] = ['regar', 'abonar', 'limpiar', 'podar'];
export const SUPPLY_CATEGORIES: readonly JardinSupplyCategory[] = [
  'planta',
  'herramienta',
  'tierra',
  'abono',
  'maceta',
  'otro',
];

/** What the office made in Google for one care: the ids (to never duplicate) and what they say right now. */
export interface CareSync {
  eventId?: string;
  /** "<day>|<time>|<title>" the event was last written with. */
  eventSig?: string;
  taskId?: string;
  /** "<day>|<title>" the task was last written with. */
  taskSig?: string;
}

export interface StoredCare {
  kind: JardinCareKind;
  everyDays: number;
  time: string;
  /** YYYY-MM-DD of the last time it was really done. */
  last?: string;
  sync?: CareSync;
}

export interface StoredPlant {
  id: string;
  name: string;
  species?: string;
  place?: string;
  notes?: string;
  furniture?: string;
  photos: string[];
  /** YYYY-MM-DD it was added: a care never done is due that day. */
  since: string;
  cares: StoredCare[];
}

export interface StoredSupply {
  id: string;
  name: string;
  category: JardinSupplyCategory;
  quantity: number;
  unit: string;
  min: number;
  /** The "Comprar …" task the office opened (one until the supply is back over its minimum). */
  buyTaskId?: string;
}

export interface JardinSettings {
  calendar: string;
  taskList: string;
  folder: string;
  prefix: string;
  defaultTime: string;
}

export interface JardinData {
  plants: StoredPlant[];
  supplies: StoredSupply[];
  inbox: JardinInboxItem[];
  recent: Array<{ at: string; text: string }>;
  /** Drive files already read (id → ISO time): each one is processed once. */
  processed: Record<string, string>;
  /** Ids of what the office found or made, so it doesn't look them up every time. */
  taskListId?: string;
  folderId?: string;
  /** The owner's names (calendar, list, folder, prefix, default time), when they changed a default. */
  settings: JardinSettings;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const text = (v: unknown, max = MAX_TEXT): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v);
export const isTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v);

// ── Days (local) ──
const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}
export const maxDay = (a: string, b: string): string => (a > b ? a : b);

/** When a care is due: from the last time it was really done, never from a fixed rhythm. Never done: since added. */
export function dueDay(care: Pick<StoredCare, 'last' | 'everyDays'>, since: string): string {
  return care.last ? addDays(care.last, care.everyDays) : since;
}

/** The day its reminder goes on: the due day, or today while it's late (it rolls to the next day until done). */
export const reminderDay = (due: string, today: string): string => maxDay(due, today);

export function jardinDir(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', JARDIN_DIR);
}
export function jardinDataPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', JARDIN_DATA_FILE);
}

export function defaultSettings(): JardinSettings {
  return {
    calendar: DEFAULT_PLANTS_CALENDAR,
    taskList: DEFAULT_GARDEN_TASK_LIST,
    folder: DEFAULT_GARDEN_FOLDER,
    prefix: DEFAULT_EVENT_PREFIX,
    defaultTime: DEFAULT_CARE_TIME,
  };
}

export const emptyData = (): JardinData => ({
  plants: [],
  supplies: [],
  inbox: [],
  recent: [],
  processed: {},
  settings: defaultSettings(),
});

function readCare(raw: unknown): StoredCare | null {
  const c = obj(raw);
  if (!CARE_KINDS.includes(c.kind as JardinCareKind)) return null;
  const every = Number(c.everyDays);
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY_DAYS) return null;
  const care: StoredCare = {
    kind: c.kind as JardinCareKind,
    everyDays: every,
    time: isTime(c.time) ? c.time : DEFAULT_CARE_TIME,
  };
  if (isDay(c.last)) care.last = c.last;
  const s = obj(c.sync);
  const sync: CareSync = {};
  for (const k of ['eventId', 'eventSig', 'taskId', 'taskSig'] as const)
    if (typeof s[k] === 'string') sync[k] = s[k];
  if (Object.keys(sync).length) care.sync = sync;
  return care;
}

/** Reads jardin.json; anything malformed is dropped (and kept out of the next write), never thrown. */
export function readJardinData(file = jardinDataPath()): JardinData {
  let raw: Raw = {};
  try {
    raw = obj(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  const data = emptyData();
  const ajustes = obj(raw.ajustes);
  data.settings = {
    calendar: text(ajustes.calendario) ?? data.settings.calendar,
    taskList: text(ajustes.listaDeTareas) ?? data.settings.taskList,
    folder: text(ajustes.carpetaDrive) ?? data.settings.folder,
    prefix: text(ajustes.prefijo) ?? data.settings.prefix,
    defaultTime: isTime(ajustes.horaPorDefecto)
      ? ajustes.horaPorDefecto
      : data.settings.defaultTime,
  };
  for (const p of Array.isArray(raw.plants) ? raw.plants : []) {
    const o = obj(p);
    const id = text(o.id, 40);
    const name = text(o.name);
    if (!id || !name) continue;
    const plant: StoredPlant = {
      id,
      name,
      photos: (Array.isArray(o.photos) ? o.photos : []).filter(
        (f): f is string => typeof f === 'string' && isPhotoName(f),
      ),
      since: isDay(o.since) ? o.since : localDay(new Date()),
      cares: [],
    };
    for (const k of ['species', 'place', 'notes', 'furniture'] as const) {
      const v = text(o[k], k === 'notes' ? 1000 : MAX_TEXT);
      if (v) plant[k] = v;
    }
    const seen = new Set<string>();
    for (const c of Array.isArray(o.cares) ? o.cares : []) {
      const care = readCare(c);
      if (care && !seen.has(care.kind)) {
        seen.add(care.kind);
        plant.cares.push(care);
      }
    }
    data.plants.push(plant);
  }
  for (const s of Array.isArray(raw.supplies) ? raw.supplies : []) {
    const o = obj(s);
    const id = text(o.id, 40);
    const name = text(o.name);
    if (!id || !name) continue;
    const supply: StoredSupply = {
      id,
      name,
      category: SUPPLY_CATEGORIES.includes(o.category as JardinSupplyCategory)
        ? (o.category as JardinSupplyCategory)
        : 'otro',
      quantity: Number.isFinite(Number(o.quantity)) ? Number(o.quantity) : 0,
      unit: text(o.unit, 20) ?? 'pza',
      min: Number.isFinite(Number(o.min)) ? Number(o.min) : 0,
    };
    if (typeof o.buyTaskId === 'string') supply.buyTaskId = o.buyTaskId;
    data.supplies.push(supply);
  }
  for (const i of Array.isArray(raw.inbox) ? raw.inbox : []) {
    const o = obj(i);
    if (typeof o.id === 'string' && typeof o.name === 'string')
      data.inbox.push(o as unknown as JardinInboxItem);
  }
  for (const r of Array.isArray(raw.recent) ? raw.recent : []) {
    const o = obj(r);
    if (typeof o.at === 'string' && typeof o.text === 'string')
      data.recent.push({ at: o.at, text: o.text });
  }
  for (const [k, v] of Object.entries(obj(raw.processed)))
    if (typeof v === 'string') data.processed[k] = v;
  if (typeof raw.taskListId === 'string') data.taskListId = raw.taskListId;
  if (typeof raw.folderId === 'string') data.folderId = raw.folderId;
  return data;
}

/** Writes jardin.json atomically (0600: it's personal). The settings go back under their Spanish names. */
export function writeJardinData(data: JardinData, file = jardinDataPath()): void {
  const def = defaultSettings();
  const ajustes: Raw = {};
  if (data.settings.calendar !== def.calendar) ajustes.calendario = data.settings.calendar;
  if (data.settings.taskList !== def.taskList) ajustes.listaDeTareas = data.settings.taskList;
  if (data.settings.folder !== def.folder) ajustes.carpetaDrive = data.settings.folder;
  if (data.settings.prefix !== def.prefix) ajustes.prefijo = data.settings.prefix;
  if (data.settings.defaultTime !== def.defaultTime)
    ajustes.horaPorDefecto = data.settings.defaultTime;
  const out: Raw = {
    version: 1,
    ...(Object.keys(ajustes).length ? { ajustes } : {}),
    plants: data.plants,
    supplies: data.supplies,
    inbox: data.inbox,
    recent: data.recent,
    processed: data.processed,
  };
  if (data.taskListId) out.taskListId = data.taskListId;
  if (data.folderId) out.folderId = data.folderId;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const PHOTO_RE = /^[a-z0-9][a-z0-9._-]{0,120}\.(jpe?g|png|webp|gif|heic)$/i;
/** A photo file name the office wrote (no folders, no dots at the start). */
export const isPhotoName = (name: string): boolean => PHOTO_RE.test(name) && !name.includes('..');

/** Lowercase, no accents, words split by spaces: how names and notes are compared. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** "Monstera deliciosa" → "monstera-deliciosa" (ids and photo names). */
export const slug = (s: string): string =>
  fold(s).replace(/ñ/g, 'n').replace(/\s+/g, '-').slice(0, 40) || 'x';

/** A new id that isn't taken. */
export function newId(base: string, taken: ReadonlySet<string>): string {
  const b = slug(base);
  if (!taken.has(b)) return b;
  for (let i = 2; ; i++) if (!taken.has(`${b}-${i}`)) return `${b}-${i}`;
}

/** Checks a plant from the panel (or the inbox); null when it's not usable. */
export function readPlantInput(raw: unknown, defaultTime: string): JardinPlantInput | null {
  const o = obj(raw);
  const name = text(o.name);
  if (!name) return null;
  const out: JardinPlantInput = { name, cares: [] };
  if (typeof o.id === 'string' && o.id) out.id = o.id;
  for (const k of ['species', 'place', 'notes', 'furniture'] as const) {
    const v = text(o[k], k === 'notes' ? 1000 : MAX_TEXT);
    if (v) out[k] = v;
  }
  const seen = new Set<string>();
  for (const c of Array.isArray(o.cares) ? o.cares : []) {
    const care = readCare({ ...obj(c), time: obj(c).time || defaultTime });
    if (!care || seen.has(care.kind)) continue;
    seen.add(care.kind);
    out.cares.push({
      kind: care.kind,
      everyDays: care.everyDays,
      time: care.time,
      ...(care.last ? { last: care.last } : {}),
    });
  }
  return out;
}
