import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

import type {
  ConnectionInfo,
  JardinCareKind,
  JardinCheck,
  JardinInboxItem,
  JardinPlantInput,
  JardinStatus,
  JardinSupplyCategory,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { GOOGLE_DRIVE_READ_SCOPE, GOOGLE_TASKS_SCOPE } from '../../google/server/constants.js';
import { GoogleApiError, GoogleReconnectNeeded } from '../../google/server/googleAccount.js';
import type { GoogleSession } from '../../google/server/googleFeature.js';
import {
  JARDIN_FIRST_SYNC_MS,
  JARDIN_FLOOR_ID,
  JARDIN_FLOOR_LABEL,
  JARDIN_LOCAL_DONE_DIR,
  JARDIN_LOCAL_INBOX_DIR,
  JARDIN_PHOTOS_DIR,
  JARDIN_SYNC_MS,
  LOG_PREFIX,
  MAX_DRIVE_FILES_PER_SYNC,
  MAX_NOTE_BYTES,
  MAX_PHOTO_BYTES,
  MAX_TEXT,
  PHOTO_ROUTE,
} from './constants.js';
import {
  CARE_KINDS,
  dueDay,
  isPhotoName,
  type JardinData,
  jardinDataPath,
  jardinDir,
  localDay,
  newId,
  readJardinData,
  readPlantInput,
  slug,
  type StoredCare,
  SUPPLY_CATEGORIES,
  writeJardinData,
} from './jardinData.js';
import {
  CalendarNotFound,
  createJardinGoogle,
  type DriveFile,
  type JardinGoogle,
  localDayOf,
} from './jardinGoogle.js';
import { plantOfPhoto, readNote } from './jardinNotes.js';
import { forgetCare, markDone, pushRecent, type SyncContext, syncGarden } from './jardinSync.js';

export interface JardinFeatureOptions {
  /** The shared Google session (features/google). */
  google: GoogleSession;
  /** The office's own token: the photos are only served to pages that have it. */
  officeToken: () => string | null;
  now?: () => number;
  /** ~/.pixel-agents/jardin.json and ~/.pixel-agents/jardin/ (tests point them at a temp folder). */
  dataFile?: string;
  dir?: string;
  /** The roof's layout (null: an empty room). */
  floorLayout?: () => Record<string, unknown> | null;
  /** Sync on a timer (tests call sync() themselves). */
  timers?: boolean;
}

type LinkState = { state: JardinCheck['state']; detail: string; help?: string };

const RECONNECT = 'La conexión con Google caducó: vuelve a conectar.';

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};
const PHOTO_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
};
const isNoteFile = (f: { name: string; mimeType: string }) =>
  f.mimeType === 'text/plain' ||
  f.mimeType === 'application/vnd.google-apps.document' ||
  /\.(txt|md)$/i.test(f.name);
const imageExt = (f: { name: string; mimeType: string }): string | null =>
  IMAGE_EXT[f.mimeType] ??
  (/\.(jpe?g|png|webp|gif|heic)$/i.exec(f.name)?.[1].toLowerCase() || null);

/**
 * The roof garden (features/jardin): the plants and their care, the garden supplies, and the reminders kept in step
 * with Google (an event on the plants calendar, which the owner creates, and a task on the garden list, which the
 * office creates). Reads the notes and photos the phone leaves in a Drive folder (read only) and in a local drop
 * folder. Privileged pages only.
 */
export function createJardinFeature(opts: JardinFeatureOptions): ServerFeature & {
  sync(): Promise<void>;
  data(): JardinData;
} {
  const now = opts.now ?? Date.now;
  const google = opts.google;
  const file = opts.dataFile ?? jardinDataPath();
  const dir = opts.dir ?? jardinDir();
  const photosDir = path.join(dir, JARDIN_PHOTOS_DIR);
  const localInbox = path.join(dir, JARDIN_LOCAL_INBOX_DIR);
  const g: JardinGoogle = createJardinGoogle(
    (url, init) => google.api(url, init),
    (url) => google.download(url),
  );
  const clients = new Set<FeatureClient>();
  let data: JardinData = readJardinData(file);
  let mtime = -1;
  let saving = false;
  let error: string | undefined;
  let syncedAt: number | undefined;
  let calendarId: string | null = null;
  let link = {
    calendar: { state: 'off', detail: 'Sin revisar todavía' } as LinkState,
    tasks: { state: 'off', detail: 'Sin revisar todavía' } as LinkState,
    drive: { state: 'off', detail: 'Sin revisar todavía' } as LinkState,
  };
  let queue: Promise<void> = Promise.resolve();

  const today = () => localDay(new Date(now()));
  const iso = () => new Date(now()).toISOString();

  const fileTime = () => {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  };
  mtime = fileTime();
  /** The owner (or the skill) may edit jardin.json by hand: pick it up before every change. */
  const fresh = () => {
    const t = fileTime();
    if (t !== mtime) {
      data = readJardinData(file);
      mtime = t;
    }
  };
  const save = () => {
    try {
      writeJardinData(data, file);
      mtime = fileTime();
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude guardar jardin.json:`, (err as Error).message);
    }
  };

  function status(): JardinStatus {
    const t = today();
    const checks: JardinCheck[] = [
      {
        id: 'google',
        label: 'Google',
        state: google.connected ? 'ok' : 'off',
        detail: !google.configured
          ? 'Faltan las llaves de Google (google.json)'
          : google.connected
            ? 'Conectado'
            : 'Sin conectar',
      },
      { id: 'calendar', label: `Calendario "${data.settings.calendar}"`, ...link.calendar },
      { id: 'tasks', label: `Lista de tareas "${data.settings.taskList}"`, ...link.tasks },
      { id: 'drive', label: `Carpeta "${data.settings.folder}" de Drive`, ...link.drive },
    ];
    const msg: JardinStatus = {
      type: 'jardinStatus',
      connected: google.connected,
      today: t,
      plants: data.plants.map((p) => ({
        id: p.id,
        name: p.name,
        ...(p.species ? { species: p.species } : {}),
        ...(p.place ? { place: p.place } : {}),
        ...(p.notes ? { notes: p.notes } : {}),
        ...(p.furniture ? { furniture: p.furniture } : {}),
        photos: p.photos,
        cares: p.cares.map((c) => ({
          kind: c.kind,
          everyDays: c.everyDays,
          time: c.time,
          ...(c.last ? { last: c.last } : {}),
          due: dueDay(c, p.since),
          synced: !!(c.sync?.eventId && c.sync?.taskId),
        })),
      })),
      supplies: data.supplies.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        unit: s.unit,
        min: s.min,
        buying: !!s.buyTaskId,
      })),
      inbox: data.inbox,
      recent: data.recent,
      checks,
      saving,
      defaultTime: data.settings.defaultTime,
      calendarName: data.settings.calendar,
      taskListName: data.settings.taskList,
      folderName: data.settings.folder,
      eventPrefix: data.settings.prefix,
    };
    if (syncedAt) msg.syncedAt = new Date(syncedAt).toISOString();
    if (error) msg.error = error;
    return msg;
  }

  const broadcast = () => {
    const msg = status() as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  };

  /** One thing at a time (syncs and the panel's changes), the panel told "saving" meanwhile. */
  function run(what: string, job: () => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      fresh();
      saving = true;
      broadcast();
      try {
        await job();
      } catch (err) {
        error =
          err instanceof GoogleReconnectNeeded
            ? RECONNECT
            : `No pude ${what}. Lo intento otra vez al rato.`;
        console.warn(`${LOG_PREFIX} ${what}:`, (err as Error).message);
      } finally {
        saving = false;
        save();
        broadcast();
      }
    });
    return queue;
  }

  const describe = (err: unknown): string =>
    err instanceof GoogleReconnectNeeded
      ? RECONNECT
      : err instanceof GoogleApiError && err.status === 403
        ? 'Google no dio permiso (¿está activada la API en tu proyecto de Google Cloud?)'
        : 'No respondió; lo intento otra vez al rato';

  /** What this sync can reach: the calendar (found, never made), the list (found or made), its tasks. */
  async function context(): Promise<SyncContext> {
    const ctx: SyncContext = {
      google: g,
      today: today(),
      calendarId: null,
      listId: null,
      tasks: null,
      note: (text) => pushRecent(data, iso(), text),
    };
    if (!google.connected) {
      const off: LinkState = { state: 'off', detail: 'Sin conectar Google' };
      link = { calendar: off, tasks: off, drive: off };
      return ctx;
    }
    try {
      calendarId = await g.findCalendar(data.settings.calendar);
      ctx.calendarId = calendarId;
      link.calendar = { state: 'ok', detail: 'Encontrado; ahí van los avisos con hora' };
    } catch (err) {
      calendarId = null;
      link.calendar =
        err instanceof CalendarNotFound
          ? {
              state: 'off',
              detail: `No existe el calendario "${data.settings.calendar}" en tu cuenta`,
              help: `Créalo tú en Google Calendar (en la compu: Otros calendarios → + → Crear un calendario, nombre "${data.settings.calendar}"). La oficina nunca crea calendarios; mientras, los avisos solo van a Tasks.`,
            }
          : { state: 'warn', detail: describe(err) };
    }
    if (!google.hasScope(GOOGLE_TASKS_SCOPE)) {
      link.tasks = {
        state: 'warn',
        detail: 'Falta el permiso de Tasks',
        help: 'Vuelve a conectar Google y acepta el permiso de tus tareas.',
      };
    } else {
      try {
        const list = await g.ensureTaskList(data.settings.taskList, data.taskListId);
        if (list.created) ctx.note(`Creé la lista de tareas "${data.settings.taskList}"`);
        data.taskListId = list.id;
        ctx.listId = list.id;
        ctx.tasks = await g.listTasks(list.id);
        link.tasks = { state: 'ok', detail: 'Lista lista; palomea ahí desde el celular' };
      } catch (err) {
        link.tasks = { state: 'warn', detail: describe(err) };
      }
    }
    return ctx;
  }

  function addInbox(item: Omit<JardinInboxItem, 'id' | 'receivedAt'>): void {
    const taken = new Set(data.inbox.map((i) => i.id));
    data.inbox.push({
      id: newId(`${item.source}-${item.name}`, taken),
      receivedAt: iso(),
      ...item,
    });
  }

  function savePhoto(bytes: Buffer, name: string, ext: string, day: string): string {
    fs.mkdirSync(photosDir, { recursive: true });
    const base = slug(name.replace(/\.[a-z0-9]+$/i, ''));
    let out = `${day}-${base}.${ext}`;
    for (let i = 2; fs.existsSync(path.join(photosDir, out)); i++)
      out = `${day}-${base}-${i}.${ext}`;
    fs.writeFileSync(path.join(photosDir, out), bytes, { mode: 0o600 });
    return out;
  }

  function takePhoto(photo: string, name: string, source: 'drive' | 'local'): void {
    const plant = plantOfPhoto(name, data.plants);
    if (plant) {
      plant.photos.push(photo);
      pushRecent(
        data,
        iso(),
        `Foto nueva de ${plant.name} (${source === 'drive' ? 'del celular' : 'de la compu'})`,
      );
    } else {
      addInbox({ kind: 'photo', source, name, photo, why: 'No sé de qué planta es.' });
    }
  }

  async function takeNote(
    ctx: SyncContext,
    body: string,
    name: string,
    source: 'drive' | 'local',
    day: string,
  ) {
    for (const line of readNote(
      body.slice(0, MAX_NOTE_BYTES),
      data.plants,
      day,
      data.settings.defaultTime,
    )) {
      if (line.kind === 'care') {
        for (const id of line.plantIds) {
          const care = data.plants
            .find((p) => p.id === id)
            ?.cares.find((c) => c.kind === line.care);
          if (care) await markDone(ctx, care, line.day);
        }
        pushRecent(
          data,
          iso(),
          `${source === 'drive' ? 'Del celular' : 'De la compu'}: "${line.text.slice(0, MAX_TEXT)}"`,
        );
      } else if (line.kind === 'newPlant') {
        addInbox({
          kind: 'note',
          source,
          name,
          text: line.text.slice(0, MAX_TEXT),
          why: 'Planta nueva: revísala antes de agregarla.',
          newPlant: line.plant,
        });
      } else {
        addInbox({ kind: 'note', source, name, text: line.text.slice(0, MAX_TEXT), why: line.why });
      }
    }
  }

  /** The Drive folder (read only): each new file once. */
  async function readDrive(ctx: SyncContext): Promise<void> {
    if (!google.connected) return;
    if (!google.hasScope(GOOGLE_DRIVE_READ_SCOPE)) {
      link.drive = {
        state: 'off',
        detail: 'Falta el permiso de leer Drive',
        help: 'Vuelve a conectar Google y acepta "Ver todos tus archivos de Google Drive" (solo lectura). En Google Cloud activa también la Google Drive API.',
      };
      return;
    }
    let files: DriveFile[];
    try {
      const folderId = await g.findFolder(data.settings.folder, data.folderId);
      if (!folderId) {
        link.drive = {
          state: 'warn',
          detail: `No encontré la carpeta "${data.settings.folder}" en tu Drive`,
          help: `Crea en Drive (Mi unidad) una carpeta llamada "${data.settings.folder}"; ahí deja el celular las fotos y las notas.`,
        };
        return;
      }
      data.folderId = folderId;
      files = await g.listFolder(folderId);
    } catch (err) {
      link.drive = { state: 'warn', detail: describe(err) };
      return;
    }
    const pending = files.filter((f) => !data.processed[f.id]).slice(0, MAX_DRIVE_FILES_PER_SYNC);
    for (const f of pending) {
      const day = (f.createdTime && localDayOf(f.createdTime)) || ctx.today;
      const ext = imageExt(f);
      if (ext) {
        if ((f.size ?? 0) > MAX_PHOTO_BYTES) {
          addInbox({
            kind: 'note',
            source: 'drive',
            name: f.name,
            why: 'La foto pesa demasiado; no la copié.',
          });
        } else {
          takePhoto(savePhoto(await g.fileContent(f), f.name, ext, day), f.name, 'drive');
        }
      } else if (isNoteFile(f)) {
        await takeNote(ctx, (await g.fileContent(f)).toString('utf8'), f.name, 'drive', day);
      }
      // Anything else (a PDF, a video) is skipped, once.
      data.processed[f.id] = iso();
      save();
    }
    const read = Object.keys(data.processed).length;
    link.drive = {
      state: 'ok',
      detail: `Carpeta encontrada; ${read} archivo${read === 1 ? '' : 's'} leído${read === 1 ? '' : 's'}`,
    };
  }

  /** ~/.pixel-agents/jardin/entrada/: the computer's drop folder (the skill writes here). Moved to leidos/ after. */
  async function readLocal(ctx: SyncContext): Promise<void> {
    let names: string[];
    try {
      names = fs
        .readdirSync(localInbox)
        .filter((n) => fs.statSync(path.join(localInbox, n)).isFile());
    } catch {
      return;
    }
    const done = path.join(localInbox, JARDIN_LOCAL_DONE_DIR);
    for (const name of names.sort()) {
      const full = path.join(localInbox, name);
      const day = localDay(fs.statSync(full).mtime);
      const kind = { name, mimeType: '' };
      const ext = imageExt(kind);
      if (ext && fs.statSync(full).size <= MAX_PHOTO_BYTES) {
        takePhoto(savePhoto(fs.readFileSync(full), name, ext, day), name, 'local');
      } else if (isNoteFile(kind)) {
        await takeNote(ctx, fs.readFileSync(full, 'utf8'), name, 'local', day);
      } else {
        continue; // not ours to read: leave it there
      }
      fs.mkdirSync(done, { recursive: true });
      fs.renameSync(full, path.join(done, `${Date.now()}-${name}`));
      save();
    }
  }

  function sync(): Promise<void> {
    return run('sincronizar con Google', async () => {
      error = undefined;
      const ctx = await context();
      await readLocal(ctx);
      await readDrive(ctx);
      if (ctx.calendarId || ctx.listId) {
        await syncGarden(ctx, data);
        syncedAt = now();
      }
    });
  }

  /** The calendar and list ids for a change the panel asked for (no extra lookups when a sync already found them). */
  const quick = (): Pick<SyncContext, 'google' | 'calendarId' | 'listId'> => ({
    google: g,
    calendarId,
    listId: data.taskListId ?? null,
  });

  const findPlant = (id: unknown) => data.plants.find((p) => p.id === id);

  function savePlant(input: JardinPlantInput, fromInbox?: string): Promise<void> {
    return run('guardar la planta', async () => {
      const t = today();
      let plant = input.id ? findPlant(input.id) : undefined;
      if (!plant) {
        plant = {
          id: newId(input.name, new Set(data.plants.map((p) => p.id))),
          name: input.name,
          photos: [],
          since: t,
          cares: [],
        };
        data.plants.push(plant);
      }
      plant.name = input.name;
      for (const k of ['species', 'place', 'notes', 'furniture'] as const) {
        if (input[k]) plant[k] = input[k];
        else delete plant[k];
      }
      const next: StoredCare[] = [];
      for (const c of input.cares) {
        const old = plant.cares.find((x) => x.kind === c.kind);
        next.push({
          kind: c.kind,
          everyDays: c.everyDays,
          time: c.time ?? data.settings.defaultTime,
          ...(c.last ? { last: c.last } : old?.last ? { last: old.last } : {}),
          ...(old?.sync ? { sync: old.sync } : {}),
        });
      }
      for (const old of plant.cares)
        if (!next.some((c) => c.kind === old.kind)) await forgetCare(quick(), old);
      plant.cares = next;
      if (fromInbox) {
        const item = data.inbox.find((i) => i.id === fromInbox);
        if (item?.photo) plant.photos.push(item.photo);
        data.inbox = data.inbox.filter((i) => i.id !== fromInbox);
      }
    }).then(sync);
  }

  function deletePlant(id: string): Promise<void> {
    return run('borrar la planta', async () => {
      const plant = findPlant(id);
      if (!plant) return;
      for (const care of plant.cares) await forgetCare(quick(), care);
      data.plants = data.plants.filter((p) => p.id !== id);
    });
  }

  function markCare(plantId: string, kind: JardinCareKind): Promise<void> {
    return run('marcar el cuidado', async () => {
      const plant = findPlant(plantId);
      const care = plant?.cares.find((c) => c.kind === kind);
      if (!plant || !care) return;
      await markDone(quick(), care, today());
      pushRecent(data, iso(), `Hecho: ${kind} ${plant.name}`);
    }).then(sync);
  }

  function readSupply(raw: unknown) {
    const o = (typeof raw === 'object' && raw ? raw : {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, MAX_TEXT) : '';
    const quantity = Number(o.quantity);
    const min = Number(o.min);
    if (!name || !Number.isFinite(quantity) || !Number.isFinite(min) || quantity < 0 || min < 0)
      return null;
    return {
      id: typeof o.id === 'string' ? o.id : undefined,
      name,
      category: SUPPLY_CATEGORIES.includes(o.category as JardinSupplyCategory)
        ? (o.category as JardinSupplyCategory)
        : 'otro',
      quantity,
      unit: typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim().slice(0, 20) : 'pza',
      min,
    };
  }

  function saveSupply(raw: unknown): Promise<void> {
    const input = readSupply(raw);
    if (!input) return Promise.resolve();
    return run('guardar el inventario', async () => {
      const old = input.id ? data.supplies.find((s) => s.id === input.id) : undefined;
      if (old) Object.assign(old, { ...input, id: old.id });
      else
        data.supplies.push({
          ...input,
          id: newId(input.name, new Set(data.supplies.map((s) => s.id))),
        });
    }).then(sync);
  }

  function deleteSupply(id: string): Promise<void> {
    return run('borrar del inventario', async () => {
      const s = data.supplies.find((x) => x.id === id);
      if (!s) return;
      // An open "Comprar …" of the office is left in Tasks: it's the owner's list to check.
      data.supplies = data.supplies.filter((x) => x.id !== id);
    });
  }

  function resolveInbox(msg: Record<string, unknown>): Promise<void> {
    return run('acomodar lo del celular', async () => {
      const item = data.inbox.find((i) => i.id === msg.id);
      if (!item) return;
      const plant = findPlant(msg.plantId);
      if (msg.action === 'care') {
        const care = plant?.cares.find((c) => c.kind === msg.kind);
        if (!plant || !care) return;
        await markDone(
          quick(),
          care,
          item.receivedAt ? localDay(new Date(item.receivedAt)) : today(),
        );
        pushRecent(data, iso(), `Hecho: ${care.kind} ${plant.name} (nota acomodada)`);
      } else if (msg.action === 'photo') {
        if (!plant || !item.photo) return;
        plant.photos.push(item.photo);
      } else if (msg.action === 'discard') {
        if (
          item.photo &&
          isPhotoName(item.photo) &&
          !data.plants.some((p) => p.photos.includes(item.photo as string))
        )
          fs.rmSync(path.join(photosDir, item.photo), { force: true });
      } else return;
      data.inbox = data.inbox.filter((i) => i.id !== item.id);
    }).then(sync);
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let first: ReturnType<typeof setTimeout> | undefined;
  const offGoogle = google.onChange(() => {
    calendarId = null;
    void sync();
  });
  if (opts.timers !== false) {
    // Catch up at start (a day passed with the office closed), then every few minutes, page open or not.
    first = setTimeout(() => void sync(), JARDIN_FIRST_SYNC_MS);
    first.unref?.();
    timer = setInterval(() => void sync(), JARDIN_SYNC_MS);
    timer.unref?.();
  }

  return {
    name: 'jardin',
    sync,
    data: () => data,

    floors() {
      return [
        {
          id: JARDIN_FLOOR_ID,
          // The roof's level is worked out by the registry: always the top floor.
          level: 0,
          roof: true,
          label: JARDIN_FLOOR_LABEL,
          defaultLayout: opts.floorLayout?.() ?? null,
        },
      ];
    },

    registerRoutes(app: FastifyInstance) {
      app.get(PHOTO_ROUTE, async (request, reply) => {
        const token = String((request.query as Record<string, unknown>).token ?? '');
        const office = opts.officeToken();
        if (!office || !sameToken(token, office))
          return reply.code(401).send({ error: 'unauthorized' });
        const name = String((request.params as Record<string, unknown>).file ?? '');
        if (!isPhotoName(name)) return reply.code(404).send({ error: 'not found' });
        const full = path.join(photosDir, name);
        if (!fs.existsSync(full)) return reply.code(404).send({ error: 'not found' });
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        return reply
          .header('Cache-Control', 'private, max-age=86400')
          .type(PHOTO_TYPES[ext] ?? 'application/octet-stream')
          .send(fs.readFileSync(full));
      });
    },

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      if (!client.privileged) return false;
      fresh();
      switch (msg.type) {
        case 'webviewReady':
          client.send(status() as unknown as Record<string, unknown>);
          return false; // the core handler still runs
        case 'refreshJardin':
          void sync();
          return true;
        case 'saveJardinPlant': {
          const plant = readPlantInput(msg.plant, data.settings.defaultTime);
          if (plant)
            void savePlant(plant, typeof msg.fromInbox === 'string' ? msg.fromInbox : undefined);
          return true;
        }
        case 'deleteJardinPlant':
          if (typeof msg.id === 'string') void deletePlant(msg.id);
          return true;
        case 'markJardinCare':
          if (typeof msg.plantId === 'string' && CARE_KINDS.includes(msg.kind as JardinCareKind))
            void markCare(msg.plantId, msg.kind as JardinCareKind);
          return true;
        case 'saveJardinSupply':
          void saveSupply(msg.supply);
          return true;
        case 'deleteJardinSupply':
          if (typeof msg.id === 'string') void deleteSupply(msg.id);
          return true;
        case 'resolveJardinInbox':
          void resolveInbox(msg);
          return true;
        default:
          return false;
      }
    },

    /** For the connections board (features/conexiones). The Google light itself is features/google's. */
    connections(): ConnectionInfo[] {
      const worst = [link.calendar, link.tasks, link.drive].find((l) => l.state !== 'ok');
      return [
        {
          id: 'jardin',
          name: 'Jardín (calendario, Tasks y Drive)',
          feature: 'Jardín',
          purpose:
            'Avisos de riego y cuidados en tu calendario y tus tareas; notas y fotos del celular por Drive',
          auth: 'La sesión de Google (features/google), permisos calendar, tasks y drive.readonly',
          state: !google.connected ? 'off' : worst ? 'warn' : 'ok',
          detail: !google.connected ? 'Sin conectar Google' : (worst?.detail ?? 'Funcionando'),
          ...(syncedAt ? { lastUsedAt: new Date(syncedAt).toISOString() } : {}),
        },
      ];
    },

    dispose() {
      offGoogle();
      if (timer) clearInterval(timer);
      if (first) clearTimeout(first);
      timer = undefined;
    },
  };
}
