import type {
  ComicsLookupFound,
  ComicsLookupReason,
  LibrosCoverProgress,
  LibrosCoverState,
} from '../../../core/src/messages.js';
import {
  emptySeries,
  isoDay,
  normalizeSeries,
  ownedNumbers,
  volumeListText,
} from '../core/series.js';
import { type ComicGrouping, type ComicLit, DEFAULT_COMIC_GROUPING } from '../core/shelves.js';
import type { Series } from '../core/types.js';
import { COMICS_PANEL_TYPES } from './constants.js';

export interface ComicsStatusView {
  series: Series[];
  file: string;
  problems: string[];
  covers: LibrosCoverState[];
  coverRun?: LibrosCoverProgress;
}

export type ComicFormMode = 'new' | 'edit';

export type ComicsView =
  | { kind: 'shelves' }
  | { kind: 'series'; id: string; volume?: number }
  | { kind: 'form'; mode: ComicFormMode; draft: Series; owned: string }
  | { kind: 'covers' };

export interface ComicLookupView {
  requestId: string;
  state: 'buscando' | 'ok' | 'nada';
  found?: ComicsLookupFound[];
  reason?: ComicsLookupReason;
}

export type ComicOpKind = 'pick' | 'dismiss' | 'remove' | 'upload';

export interface ComicsState {
  open: boolean;
  status?: ComicsStatusView;
  view: ComicsView;
  selectedId?: string;
  grouping: ComicGrouping;
  /** Only the missing volumes lit. */
  onlyMissing: boolean;
  lit?: ComicLit;
  pending?: { requestId: string; kind: 'save' | 'delete'; mode?: ComicFormMode };
  formError?: string;
  lastSaved?: string;
  savedInRow: number;
  focusName: number;
  lookup?: ComicLookupView;
  op?: { requestId: string; kind: ComicOpKind; id?: string };
  opError?: string;
}

export const CONNECTION_LOST_TEXT = 'Se cayó la conexión con la oficina; vuelve a intentarlo.';

let counter = 0;
const newRequestId = () => `${Date.now().toString(36)}-${++counter}`;

const initial = (): ComicsState => ({
  open: false,
  view: { kind: 'shelves' },
  grouping: DEFAULT_COMIC_GROUPING,
  onlyMissing: false,
  savedInRow: 0,
  focusName: 0,
});

export function seriesFromWire(raw: unknown, today = isoDay(Date.now())): Series | null {
  return normalizeSeries(raw, today)?.series ?? null;
}

/** What stays after "save and next": kind, format, language, publishers, genre and whose. */
export function nextSeriesDraft(d: Series, today: string): Series {
  return emptySeries(today, {
    kind: d.kind,
    format: d.format,
    language: d.language,
    publisher: d.publisher,
    localPublisher: d.localPublisher,
    genre: d.genre,
    owner: d.owner,
  });
}

/** Comics and manga (features/comics), outside React: the panel reads it, useComics feeds it. */
export class ComicsStore {
  private state: ComicsState = initial();
  private listeners = new Set<() => void>();

  get = (): ComicsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<ComicsState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.state = initial();
    for (const l of this.listeners) l();
  }

  open(): void {
    this.set({ open: true, view: { kind: 'shelves' } });
  }

  close(): void {
    this.set({
      open: false,
      pending: undefined,
      formError: undefined,
      lit: undefined,
      op: undefined,
      opError: undefined,
      lookup: undefined,
    });
  }

  setStatus(raw: {
    series: unknown[];
    file: string;
    problems: string[];
    covers?: LibrosCoverState[];
    coverRun?: LibrosCoverProgress;
  }): void {
    const series = raw.series.map((s) => seriesFromWire(s)).filter((s): s is Series => s !== null);
    let { view } = this.state;
    const openId = view.kind === 'series' ? view.id : null;
    if (openId !== null && !series.some((s) => s.id === openId)) view = { kind: 'shelves' };
    this.set({
      status: {
        series,
        file: raw.file,
        problems: raw.problems,
        covers: Array.isArray(raw.covers) ? raw.covers : [],
        coverRun: raw.coverRun,
      },
      view,
    });
  }

  connectionLost(): void {
    const next: Partial<ComicsState> = {};
    if (this.state.op && this.state.op.kind !== 'upload') {
      next.op = undefined;
      next.opError = CONNECTION_LOST_TEXT;
    }
    if (this.state.pending) {
      next.pending = undefined;
      next.formError = CONNECTION_LOST_TEXT;
    }
    if (this.state.lookup?.state === 'buscando')
      next.lookup = { ...this.state.lookup, state: 'nada', reason: 'sin-respuesta' };
    if (Object.keys(next).length > 0) this.set(next);
  }

  setResult(result: { requestId: string; ok: boolean; id?: string; error?: string }): void {
    const op = this.state.op;
    if (op && op.requestId === result.requestId) {
      this.set({ op: undefined, opError: result.ok ? undefined : (result.error ?? 'No se pudo.') });
      return;
    }
    const pending = this.state.pending;
    if (!pending || pending.requestId !== result.requestId) return;
    if (!result.ok) {
      this.set({ pending: undefined, formError: result.error ?? 'No se pudo.' });
      return;
    }
    if (pending.kind === 'delete') {
      this.set({ pending: undefined, view: { kind: 'shelves' }, selectedId: undefined });
      return;
    }
    const view = this.state.view;
    if (pending.mode === 'new' && view.kind === 'form') {
      this.set({
        pending: undefined,
        formError: undefined,
        lastSaved: view.draft.title,
        savedInRow: this.state.savedInRow + 1,
        view: {
          kind: 'form',
          mode: 'new',
          draft: nextSeriesDraft(view.draft, isoDay(Date.now())),
          owned: '',
        },
        selectedId: result.id,
        focusName: this.state.focusName + 1,
        lookup: undefined,
      });
      return;
    }
    // A quick change from the card (a volume, «voy en») stays on the card
    const stay = view.kind === 'series' ? view : undefined;
    this.set({
      pending: undefined,
      formError: undefined,
      selectedId: result.id,
      view: stay ?? (result.id ? { kind: 'series', id: result.id } : { kind: 'shelves' }),
      lookup: undefined,
    });
  }

  show(view: ComicsView): void {
    this.set({ view, formError: undefined, opError: undefined });
  }

  select(id: string | undefined): void {
    if (id !== this.state.selectedId) this.set({ selectedId: id });
  }

  openSeries(id: string, volume?: number): void {
    if (!this.state.status?.series.some((s) => s.id === id)) return;
    this.set({ selectedId: id, view: { kind: 'series', id, volume }, opError: undefined });
  }

  newSeries(keep: Partial<Series> = {}): void {
    this.set({
      view: { kind: 'form', mode: 'new', draft: emptySeries(isoDay(Date.now()), keep), owned: '' },
      formError: undefined,
      lastSaved: undefined,
      savedInRow: 0,
      focusName: this.state.focusName + 1,
      lookup: undefined,
    });
  }

  edit(s: Series): void {
    this.set({
      view: { kind: 'form', mode: 'edit', draft: { ...s }, owned: volumeListText(ownedNumbers(s)) },
      formError: undefined,
      lastSaved: undefined,
      lookup: undefined,
      focusName: this.state.focusName + 1,
    });
  }

  leaveForm(): void {
    const v = this.state.view;
    if (v.kind !== 'form') return;
    this.set({ lookup: undefined });
    const saved = v.draft.id ? this.state.status?.series.some((s) => s.id === v.draft.id) : false;
    this.show(
      v.mode === 'edit' && saved ? { kind: 'series', id: v.draft.id } : { kind: 'shelves' },
    );
  }

  updateDraft(patch: Partial<Series>, owned?: string): void {
    const v = this.state.view;
    if (v.kind === 'form')
      this.set({ view: { ...v, draft: { ...v.draft, ...patch }, owned: owned ?? v.owned } });
  }

  startSave(mode: ComicFormMode): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'save', mode }, formError: undefined });
    return requestId;
  }

  startDelete(): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'delete' }, formError: undefined });
    return requestId;
  }

  setFormError(message: string | undefined): void {
    this.set({ formError: message });
  }

  startLookup(): string {
    const requestId = newRequestId();
    this.set({ lookup: { requestId, state: 'buscando' } });
    return requestId;
  }

  setLookup(r: {
    requestId: string;
    ok: boolean;
    found?: ComicsLookupFound[];
    reason?: ComicsLookupReason;
  }): void {
    const l = this.state.lookup;
    if (!l || l.requestId !== r.requestId) return;
    this.set({
      lookup:
        r.ok && r.found?.length
          ? { ...l, state: 'ok', found: r.found }
          : { ...l, state: 'nada', reason: r.reason ?? 'nada' },
    });
  }

  /** «Pasar a la ficha»: what the source said for result n goes into the draft (only what it said). */
  useLookup(n: number): void {
    const f = this.state.lookup?.found?.[n];
    const v = this.state.view;
    if (!f || v.kind !== 'form') return;
    const patch: Partial<Series> = { title: f.title };
    if (f.writers.length) patch.writers = [...f.writers];
    if (f.artists.length) patch.artists = [...f.artists];
    if (f.volumes) patch.totalVolumes = f.volumes;
    if (f.finished) patch.finished = true;
    if (f.year) patch.year = f.year;
    if (f.source === 'anilist' && !v.draft.kind) patch.kind = 'manga';
    this.set({ view: { ...v, draft: { ...v.draft, ...patch } }, lookup: undefined });
  }

  dropLookup(): void {
    this.set({ lookup: undefined });
  }

  startOp(kind: ComicOpKind, id?: string): string {
    const requestId = newRequestId();
    this.set({ op: { requestId, kind, id }, opError: undefined });
    return requestId;
  }

  endUpload(requestId: string, error?: string): void {
    if (this.state.op?.requestId !== requestId) return;
    this.set({ op: undefined, opError: error });
  }

  setOpError(message: string | undefined): void {
    this.set({ opError: message });
  }

  setGrouping(grouping: ComicGrouping): void {
    this.set({ grouping });
  }

  toggleOnlyMissing(): void {
    this.set({ onlyMissing: !this.state.onlyMissing, lit: undefined });
  }

  light(lit: ComicLit | undefined): void {
    this.set({ lit, onlyMissing: false });
  }
}

export const comicsStore = new ComicsStore();

export const isComicsFurniture = (type: string | undefined): boolean =>
  COMICS_PANEL_TYPES.includes((type ?? '').split(':')[0]);
