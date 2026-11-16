import type { ColeccionCoverProgress, ColeccionCoverState } from '../../../core/src/messages.js';
import { emptyGame, isoDay, normalizeGame } from '../core/game.js';
import type { Game } from '../core/types.js';
import { COLECCION_PANEL_TYPES } from './constants.js';

/** What coleccionStatus carries (core/asyncapi.yaml, block "Game collection"). */
export interface ColeccionStatusView {
  games: Game[];
  file: string;
  problems: string[];
  /** The IGDB key is set (never the key itself). */
  igdbKey: boolean;
  /** The last cover search of each game since the office started. */
  covers: ColeccionCoverState[];
  /** «Buscar las que faltan»: its progress, or its summary once it ended. */
  coverRun?: ColeccionCoverProgress;
}

/** A cover action sent and not answered yet (only one at a time). */
export type CoverOpKind =
  'pick' | 'dismiss' | 'remove' | 'key' | 'keyRemove' | 'condition' | 'upload';

/** How the form was opened: a new game (and then another), an edit, or a "se busca" gap that was bought. */
export type FormMode = 'new' | 'edit' | 'acquire';

export type ColeccionView =
  | { kind: 'shelves' }
  | { kind: 'case'; id: string }
  | { kind: 'wanted'; id: string }
  | { kind: 'form'; mode: FormMode; draft: Game }
  | { kind: 'tonight' }
  | { kind: 'covers' };

export interface ColeccionState {
  open: boolean;
  /** Undefined until the server sends it (tokened pages only). */
  status?: ColeccionStatusView;
  view: ColeccionView;
  /** The box with the keyboard / selection outline. */
  selectedId?: string;
  bySeries: boolean;
  /** Only the "se busca" gaps lit. */
  onlyWanted: boolean;
  /** A series lit on every shelf (from the search). */
  litSeries?: string;
  /** The form: a save in course, its error, the last title saved and how many went in a row. */
  pending?: { requestId: string; kind: 'save' | 'delete'; mode?: FormMode };
  formError?: string;
  lastSaved?: string;
  savedInRow: number;
  /** Changes when the form must put the cursor back in the name (after "save and next"). */
  focusName: number;
  /** A cover action (pick, remove, key, condition, upload) waiting for its answer, and the last one's error. */
  op?: { requestId: string; kind: CoverOpKind; id?: string };
  opError?: string;
  /** «Elige una» the person closed with «Ninguna», by game: the search stamp it was. */
  dismissedChoice?: Record<string, string>;
  /** The run summary the person closed (its finishedAt). */
  dismissedRun?: string;
  /** The run's floating box folded to one line. */
  runMinimized?: boolean;
}

/** Said when the connection to the office drops with something waiting for an answer. */
export const CONNECTION_LOST_TEXT = 'Se cayó la conexión con la oficina; vuelve a intentarlo.';

let counter = 0;
const newRequestId = () => `${Date.now().toString(36)}-${++counter}`;

const initial = (): ColeccionState => ({
  open: false,
  view: { kind: 'shelves' },
  bySeries: true,
  onlyWanted: false,
  savedInRow: 0,
  focusName: 0,
});

/** A game from the wire, typed (the same lenient reading as the file). */
export function fromWire(raw: unknown, today = isoDay(Date.now())): Game | null {
  return normalizeGame(raw, today)?.game ?? null;
}

/** The game collection (features/coleccion), outside React: the panel reads it, useColeccion feeds it. */
export class ColeccionStore {
  private state: ColeccionState = initial();
  private listeners = new Set<() => void>();

  get = (): ColeccionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<ColeccionState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** For tests. */
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
      litSeries: undefined,
      op: undefined,
      opError: undefined,
    });
  }

  setStatus(raw: {
    games: unknown[];
    file: string;
    problems: string[];
    igdbKey?: boolean;
    covers?: ColeccionCoverState[];
    coverRun?: ColeccionCoverProgress;
  }): void {
    const games = raw.games.map((g) => fromWire(g)).filter((g): g is Game => g !== null);
    let { view } = this.state;
    const exists = (id: string) => games.some((g) => g.id === id);
    if ((view.kind === 'case' || view.kind === 'wanted') && !exists(view.id))
      view = { kind: 'shelves' };
    this.set({
      status: {
        games,
        file: raw.file,
        problems: raw.problems,
        igdbKey: raw.igdbKey === true,
        covers: Array.isArray(raw.covers) ? raw.covers : [],
        coverRun: raw.coverRun,
      },
      view,
    });
  }

  /** A cover action is about to be sent: its request id (the answer comes as coleccionResult). */
  startOp(kind: CoverOpKind, id?: string): string {
    const requestId = newRequestId();
    this.set({ op: { requestId, kind, id }, opError: undefined });
    return requestId;
  }

  /** An upload ended (it answers over HTTP, not with coleccionResult). */
  endUpload(requestId: string, error?: string): void {
    if (this.state.op?.requestId !== requestId) return;
    this.set({ op: undefined, opError: error });
  }

  setOpError(message: string | undefined): void {
    this.set({ opError: message });
  }

  /** «Ninguna»: hides that game's choice until it is searched again. */
  dismissChoice(id: string, stamp: string): void {
    this.set({ dismissedChoice: { ...this.state.dismissedChoice, [id]: stamp } });
  }

  dismissRun(finishedAt: string): void {
    this.set({ dismissedRun: finishedAt });
  }

  /** Folds the run's floating box to one line, or opens it again. */
  minimizeRun(min: boolean): void {
    this.set({ runMinimized: min });
  }

  /**
   * The connection to the office dropped: an answer that was waiting will never come, so the buttons come back
   * (an upload answers over HTTP on its own, so it is left to finish).
   */
  connectionLost(): void {
    const next: Partial<ColeccionState> = {};
    if (this.state.op && this.state.op.kind !== 'upload') {
      next.op = undefined;
      next.opError = CONNECTION_LOST_TEXT;
    }
    if (this.state.pending) {
      next.pending = undefined;
      next.formError = CONNECTION_LOST_TEXT;
    }
    if (Object.keys(next).length > 0) this.set(next);
  }

  /** The server's answer to a save or a delete (or to a cover action). */
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
      // Many in a row: the console (and own / wanted) stays, the rest clears, the cursor goes back to the name
      const d = view.draft;
      const next = {
        ...emptyGame(isoDay(Date.now()), d.platform, d.wanted),
        owner: d.owner,
        region: d.region,
      };
      this.set({
        pending: undefined,
        formError: undefined,
        lastSaved: d.title,
        savedInRow: this.state.savedInRow + 1,
        view: { kind: 'form', mode: 'new', draft: next },
        selectedId: result.id,
        focusName: this.state.focusName + 1,
      });
      return;
    }
    this.set({
      pending: undefined,
      formError: undefined,
      selectedId: result.id,
      view: result.id ? { kind: 'case', id: result.id } : { kind: 'shelves' },
    });
  }

  show(view: ColeccionView): void {
    this.set({ view, formError: undefined, opError: undefined });
  }

  select(id: string | undefined): void {
    if (id !== this.state.selectedId) this.set({ selectedId: id });
  }

  /** Opens a box: the case for a game, the poster for a gap. */
  openItem(id: string): void {
    const g = this.state.status?.games.find((x) => x.id === id);
    if (!g) return;
    this.set({
      selectedId: id,
      view: g.wanted ? { kind: 'wanted', id } : { kind: 'case', id },
      opError: undefined,
    });
  }

  /** The form for a new game (on a platform when it comes from a shelf), an edit, or a bought gap. */
  newGame(platform = '', wanted = false): void {
    this.set({
      view: { kind: 'form', mode: 'new', draft: emptyGame(isoDay(Date.now()), platform, wanted) },
      formError: undefined,
      lastSaved: undefined,
      savedInRow: 0,
      focusName: this.state.focusName + 1,
    });
  }

  edit(game: Game, mode: Exclude<FormMode, 'new'> = 'edit'): void {
    const draft =
      mode === 'acquire' ? { ...game, wanted: false, price: '', seenAt: '' } : { ...game };
    this.set({ view: { kind: 'form', mode, draft }, formError: undefined, lastSaved: undefined });
  }

  /** Leaves the form: an edit (or a gap being bought) goes back to its case or poster, a new one to the shelves. */
  leaveForm(): void {
    const v = this.state.view;
    if (v.kind !== 'form') return;
    const saved = v.draft.id
      ? this.state.status?.games.find((g) => g.id === v.draft.id)
      : undefined;
    if (v.mode === 'new' || !saved) this.show({ kind: 'shelves' });
    else
      this.show(saved.wanted ? { kind: 'wanted', id: saved.id } : { kind: 'case', id: saved.id });
  }

  updateDraft(patch: Partial<Game>): void {
    const v = this.state.view;
    if (v.kind === 'form') this.set({ view: { ...v, draft: { ...v.draft, ...patch } } });
  }

  /** A save is about to be sent: its request id. */
  startSave(mode: FormMode): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'save', mode }, formError: undefined });
    return requestId;
  }

  startDelete(): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'delete' }, formError: undefined });
    return requestId;
  }

  setFormError(message: string): void {
    this.set({ formError: message });
  }

  toggleSeries(): void {
    this.set({ bySeries: !this.state.bySeries });
  }

  toggleOnlyWanted(): void {
    this.set({ onlyWanted: !this.state.onlyWanted, litSeries: undefined });
  }

  lightSeries(series: string | undefined): void {
    this.set({ litSeries: series, onlyWanted: false });
  }
}

export const coleccionStore = new ColeccionStore();

/** A piece that opens the collection panel. */
export const isColeccionFurniture = (type: string | undefined): boolean =>
  COLECCION_PANEL_TYPES.includes((type ?? '').split(':')[0]);
