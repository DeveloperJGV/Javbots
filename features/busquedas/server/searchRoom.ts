import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type {
  SearchCriteriaSet,
  SearchRequest,
  SearchRequestState,
  SearchResult,
  SearchResultMark,
  SearchRoomStatus,
} from '../../../core/src/messages.js';
import {
  LOG_PREFIX,
  MAX_FIELD_CHARS,
  MAX_REQUESTS,
  MAX_RESULTS,
  MAX_RESULTS_FILE_BYTES,
  MAX_TEXT_CHARS,
  MAX_WHY_CHARS,
  REQUESTS_DIR,
  RESULTS_DIR,
  RESULTS_POLL_MS,
  STATE_FILE,
} from './constants.js';
import type { CriteriaStore } from './criteria.js';
import type { AgentLauncher } from './herdrLauncher.js';

/** A request as kept in estado.json; its results live in resultados/<id>.json, written by the agent. */
export interface StoredRequest {
  id: string;
  text: string;
  place?: string;
  when?: string;
  criteriaId: string;
  createdAt: string;
  state: SearchRequestState;
  note?: string;
  /** herdr's name for the agent that has it. */
  agent?: string;
  /** What the owner did with each result, by result id. */
  marks: Record<string, SearchResultMark>;
}

/** Where a request's files go, with forward slashes (they are read by an agent, maybe in Git Bash). */
export interface RequestPaths {
  briefFile: string;
  resultsFile: string;
}

export interface SearchRoomOptions {
  /** The room's id, in every message (`room`). Also the herdr tab label's base. */
  room: string;
  /** Tab label in herdr. */
  label: string;
  /** ~/.pixel-agents/<room>/: pedidos/, resultados/ and estado.json. Created on the first request. */
  dir: string;
  criteria: CriteriaStore;
  /** The room's result kinds, best first (an unknown kind becomes the last one). */
  kinds: readonly string[];
  /** The request's brief (markdown) the agent reads: what to look for, the criteria, the skill, where to deliver. */
  brief(req: StoredRequest, criteria: SearchCriteriaSet | undefined, paths: RequestPaths): string;
  launcher?: AgentLauncher;
  now?: () => number;
  pollMs?: number;
  newId?: () => string;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const text = (v: unknown, max = MAX_FIELD_CHARS): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
  return s ? s.slice(0, max) : undefined;
};
const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const ID_RE = /^[a-z0-9]{6,32}$/;
const fwd = (p: string) => p.replace(/\\/g, '/');

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'resultado';

/** http(s) links only: anything else (javascript:, file:) is dropped before it reaches a page. */
export function safeLink(v: unknown): string | undefined {
  const s = text(v, 600);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The agent's results file (resultados/<id>.json, Spanish keys as the skill says) → checked results, best first:
 * recommended before discarded, then by score, then by number of reviews. Anything odd is dropped, never trusted.
 */
export function readResults(
  raw: unknown,
  kinds: readonly string[],
): { results: SearchResult[]; note?: string } {
  const r = obj(raw);
  const list = Array.isArray(r.resultados) ? r.resultados.slice(0, MAX_RESULTS) : [];
  const ids = new Set<string>();
  const results: SearchResult[] = [];
  for (const item of list) {
    const e = obj(item);
    const name = text(e.nombre, 120);
    if (!name) continue;
    const kindRaw = (text(e.tipo, 40) ?? '').toLowerCase();
    const kind = kinds.includes(kindRaw) ? kindRaw : kinds[kinds.length - 1];
    let id = slug(name);
    for (let n = 2; ids.has(id); n++) id = `${slug(name)}-${n}`;
    ids.add(id);
    const verdict =
      text(e.veredicto, 20)?.toLowerCase() === 'descartado' ? 'descartado' : 'recomendado';
    const res: SearchResult = {
      id,
      name,
      kind,
      why: text(e.porque ?? e['por qué'], MAX_WHY_CHARS) ?? '',
      score: Math.round(num(e.puntuacion ?? e['puntuación'], 0, 100) ?? 0),
      verdict,
    };
    const rating = num(e.calificacion ?? e['calificación'], 0, 5);
    const reviews = num(e.resenas ?? e['reseñas'], 0, 10_000_000);
    if (rating !== undefined) res.rating = rating;
    if (reviews !== undefined) res.reviews = Math.round(reviews);
    const phone = text(e.telefono ?? e['teléfono'], 60);
    const address = text(e.direccion ?? e['dirección']);
    const link = safeLink(e.liga);
    const source = text(e.fuente, 120);
    if (phone) res.phone = phone;
    if (address) res.address = address;
    if (link) res.link = link;
    if (source) res.source = source;
    results.push(res);
  }
  results.sort(
    (a, b) =>
      Number(a.verdict === 'descartado') - Number(b.verdict === 'descartado') ||
      b.score - a.score ||
      (b.reviews ?? 0) - (a.reviews ?? 0),
  );
  const note = text(r.nota, MAX_WHY_CHARS);
  return note ? { results, note } : { results };
}

/** One line to paste into any Claude Code session (a single line: a multi-line paste sends itself too early). */
export const briefLine = (briefFile: string): string =>
  `Lee el encargo en ${briefFile} y síguelo paso a paso.`;

/**
 * The generic part of a room where an agent searches with criteria (features/busquedas): requests saved by the owner,
 * a brief per request for the agent, the agent launched in herdr, its results read from a file it writes, and the
 * owner's marks. The room (features/directorio, later the freelance room) brings its criteria, kinds and brief.
 */
export function createSearchRoom(opts: SearchRoomOptions) {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? (() => randomBytes(5).toString('hex'));
  const stateFile = path.join(opts.dir, STATE_FILE);
  const listeners = new Set<() => void>();
  const cache = new Map<string, { mtimeMs: number; results: SearchResult[]; note?: string }>();
  let requests: StoredRequest[] = load();
  let launcherState: { available: boolean; detail?: string } = opts.launcher
    ? { available: false, detail: 'Revisando herdr…' }
    : { available: false, detail: 'Esta oficina no puede abrir terminales.' };

  const changed = () => listeners.forEach((l) => l());
  /** Requests whose agent is being opened right now (a second click waits). */
  const launching = new Set<string>();

  function load(): StoredRequest[] {
    try {
      const raw = obj(JSON.parse(fs.readFileSync(stateFile, 'utf8')));
      if (!Array.isArray(raw.pedidos)) return [];
      return (raw.pedidos as unknown[])
        .map(obj)
        .filter((p) => typeof p.id === 'string' && ID_RE.test(p.id) && typeof p.text === 'string')
        .map((p) => ({
          ...(p as unknown as StoredRequest),
          marks: obj(p.marks) as StoredRequest['marks'],
        }));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn(`${LOG_PREFIX} No pude leer ${stateFile}:`, (err as Error).message);
      return [];
    }
  }

  function persist(): void {
    fs.mkdirSync(opts.dir, { recursive: true });
    const tmp = `${stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ pedidos: requests }, null, 2) + '\n');
    fs.renameSync(tmp, stateFile);
  }

  const paths = (id: string): RequestPaths => ({
    briefFile: fwd(path.join(opts.dir, REQUESTS_DIR, `${id}.md`)),
    resultsFile: fwd(path.join(opts.dir, RESULTS_DIR, `${id}.json`)),
  });

  function writeBrief(req: StoredRequest): void {
    const p = paths(req.id);
    const set = opts.criteria.read().find((c) => c.id === req.criteriaId);
    fs.mkdirSync(path.join(opts.dir, REQUESTS_DIR), { recursive: true });
    fs.mkdirSync(path.join(opts.dir, RESULTS_DIR), { recursive: true });
    fs.writeFileSync(p.briefFile, opts.brief(req, set, p));
  }

  const find = (id: unknown) => requests.find((r) => r.id === id);

  /** Reads the results files that changed since the last look. True when something new came. */
  function poll(): boolean {
    let news = false;
    for (const req of requests) {
      const file = path.join(opts.dir, RESULTS_DIR, `${req.id}.json`);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        if (cache.delete(req.id)) news = true;
        continue;
      }
      if (cache.get(req.id)?.mtimeMs === stat.mtimeMs || stat.size > MAX_RESULTS_FILE_BYTES)
        continue;
      try {
        const raw = obj(JSON.parse(fs.readFileSync(file, 'utf8')));
        if (raw.pedido !== undefined && raw.pedido !== req.id) continue;
        cache.set(req.id, { mtimeMs: stat.mtimeMs, ...readResults(raw, opts.kinds) });
        if (req.state !== 'listo') {
          req.state = 'listo';
          delete req.note;
          persist();
        }
        news = true;
      } catch {
        // half-written: next time
      }
    }
    return news;
  }

  function statusParts(): Pick<SearchRoomStatus, 'room' | 'requests' | 'criteria' | 'launcher'> {
    const out: SearchRequest[] = requests.map((req) => {
      const found = cache.get(req.id);
      const results = (found?.results ?? []).map((r) =>
        req.marks[r.id] ? { ...r, mark: req.marks[r.id] } : r,
      );
      const msg: SearchRequest = {
        id: req.id,
        text: req.text,
        criteriaId: req.criteriaId,
        createdAt: req.createdAt,
        state: req.state,
        brief: briefLine(paths(req.id).briefFile),
        results,
      };
      if (req.place) msg.place = req.place;
      if (req.when) msg.when = req.when;
      if (req.note) msg.note = req.note;
      if (found?.note) msg.resultsNote = found.note;
      return msg;
    });
    return {
      room: opts.room,
      requests: out,
      criteria: opts.criteria.read(),
      launcher: launcherState,
    };
  }

  function create(msg: Raw): string | null {
    const t = text(msg.text, MAX_TEXT_CHARS);
    const sets = opts.criteria.read();
    const criteriaId =
      typeof msg.criteriaId === 'string' && sets.some((s) => s.id === msg.criteriaId)
        ? msg.criteriaId
        : sets[0]?.id;
    if (!t || !criteriaId) return null;
    const req: StoredRequest = {
      id: newId(),
      text: t,
      criteriaId,
      createdAt: new Date(now()).toISOString(),
      state: 'nuevo',
      marks: {},
    };
    const place = text(msg.place, 120);
    const when = text(msg.when, 120);
    if (place) req.place = place;
    if (when) req.when = when;
    requests = [req, ...requests].slice(0, MAX_REQUESTS);
    writeBrief(req);
    persist();
    changed();
    return req.id;
  }

  async function launch(id: unknown): Promise<void> {
    const req = find(id);
    if (!req || !opts.launcher || launching.has(req.id)) return;
    launching.add(req.id);
    writeBrief(req); // the criteria may have changed since it was saved
    const waiting = req.state === 'esperando' ? req.agent : undefined;
    req.state = 'buscando';
    req.note = 'Abriendo el agente en herdr…';
    changed();
    try {
      const got = await opts.launcher.launch({
        name: `${opts.room.slice(0, 20)}-${req.id.slice(0, 8)}`,
        label: opts.label,
        cwd: opts.dir,
        prompt: briefLine(paths(req.id).briefFile),
        agent: waiting,
      });
      req.agent = got.agent;
      if (got.ready) {
        req.state = 'buscando';
        req.note = `El agente está buscando (pestaña "${opts.label}" de herdr).`;
      } else {
        req.state = 'esperando';
        req.note = `${got.detail ?? 'Claude espera tu respuesta en herdr.'} Contesta en la pestaña "${opts.label}" y luego presiona "Mandar encargo".`;
      }
    } catch (err) {
      req.state = 'error';
      req.note = `No pude abrir el agente: ${(err as Error).message.slice(0, 200)}. Usa "Copiar encargo".`;
      console.warn(`${LOG_PREFIX} ${opts.room}: no pude lanzar el agente:`, (err as Error).message);
    }
    launching.delete(req.id);
    poll();
    persist();
    changed();
  }

  function mark(msg: Raw): boolean {
    const req = find(msg.requestId);
    const resultId = typeof msg.resultId === 'string' ? msg.resultId : '';
    if (!req || !cache.get(req.id)?.results.some((r) => r.id === resultId)) return false;
    if (msg.mark === 'ninguno') delete req.marks[resultId];
    else if (msg.mark === 'contactado' || msg.mark === 'descartado') req.marks[resultId] = msg.mark;
    else return false;
    persist();
    changed();
    return true;
  }

  function remove(id: unknown): void {
    const req = find(id);
    if (!req) return;
    requests = requests.filter((r) => r !== req);
    cache.delete(req.id);
    for (const f of Object.values(paths(req.id))) fs.rmSync(f, { force: true });
    persist();
    changed();
  }

  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (requests.length && poll()) changed();
  }, opts.pollMs ?? RESULTS_POLL_MS);
  timer.unref?.();

  poll();

  return {
    statusParts,
    poll: () => {
      if (poll()) changed();
    },
    /** Asks the launcher whether it can open agents (it caches); tells listeners when that changed. */
    async refreshLauncher(): Promise<void> {
      if (!opts.launcher) return;
      const next = await opts.launcher.check();
      if (next.available !== launcherState.available || next.detail !== launcherState.detail) {
        launcherState = {
          available: next.available,
          ...(next.detail ? { detail: next.detail } : {}),
        };
        changed();
      }
    },
    find: (id: unknown): (StoredRequest & { results: SearchResult[] }) | undefined => {
      const req = find(id);
      return req ? { ...req, results: cache.get(req.id)?.results ?? [] } : undefined;
    },
    create,
    launch,
    mark,
    /** After the room scheduled it (not something a page can set by itself). */
    markScheduled(requestId: string, resultId: string): void {
      const req = find(requestId);
      if (!req) return;
      req.marks[resultId] = 'agendado';
      persist();
      changed();
    },
    remove,
    saveCriteria(sets: unknown): boolean {
      const saved = opts.criteria.save(sets);
      if (saved) changed();
      return !!saved;
    },
    /**
     * The generic messages for this room (createSearchRequest, launchSearchAgent, markSearchResult,
     * deleteSearchRequest, saveSearchCriteria). True when consumed. The caller checks the privilege first.
     */
    handleMessage(msg: Raw): boolean {
      if (msg.room !== opts.room) return false;
      switch (msg.type) {
        case 'createSearchRequest':
          create(msg);
          return true;
        case 'launchSearchAgent':
          void launch(msg.id);
          return true;
        case 'markSearchResult':
          mark(msg);
          return true;
        case 'deleteSearchRequest':
          remove(msg.id);
          return true;
        case 'saveSearchCriteria':
          if (opts.criteria.save(msg.criteria)) changed();
          return true;
        default:
          return false;
      }
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      if (timer) clearInterval(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}

export type SearchRoom = ReturnType<typeof createSearchRoom>;
