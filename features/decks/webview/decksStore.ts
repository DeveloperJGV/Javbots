import { emptyDeck, isoDay } from '../core/deck.js';
import type { Deck, DeckCard } from '../core/types.js';
import { DECKS_PANEL_TYPES } from './constants.js';

/** What decksStatus carries (core/asyncapi.yaml, block "Decks"). */
export interface DecksStatusView {
  decks: Deck[];
  folder: string;
  db: {
    state: 'missing' | 'loading' | 'ready' | 'error';
    count?: number;
    updatedAt?: string;
    detail?: string;
  };
  problems: string[];
}

export interface ImportResultView {
  ok: boolean;
  deck?: Deck;
  problems: string[];
}

export type DecksView =
  | { kind: 'row' }
  | { kind: 'box'; id: string }
  | { kind: 'edit'; draft: Deck }
  | { kind: 'import' };

export interface DecksState {
  open: boolean;
  /** Undefined until the server sends it (tokened pages only). */
  status?: DecksStatusView;
  /** The deck at the front of the row (by id, so it stays chosen when the list changes). */
  selectedId?: string;
  view: DecksView;
  /** Cards known so far (asked with decksCards, or found by a search). */
  cards: ReadonlyMap<number, DeckCard>;
  /** Codes the database does not have. */
  missing: ReadonlySet<number>;
  search: { requestId?: string; query: string; cards: DeckCard[]; pending: boolean };
  importing: { requestId?: string; text: string; pending: boolean; result?: ImportResultView };
  /** A save was sent and its deck has not come back in a status yet. */
  savePending: boolean;
}

let counter = 0;
const newRequestId = () => `${Date.now().toString(36)}-${++counter}`;

const byName = (a: Deck, b: Deck) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** The row's order: by name, so the ruler reads like an index. */
export const sortDecks = (decks: readonly Deck[]): Deck[] => [...decks].sort(byName);

const initial = (): DecksState => ({
  open: false,
  view: { kind: 'row' },
  cards: new Map(),
  missing: new Set(),
  search: { query: '', cards: [], pending: false },
  importing: { text: '', pending: false },
  savePending: false,
});

/** The Yu-Gi-Oh! decks (features/decks), outside React: the panel reads it, the hook feeds it from the server. */
export class DecksStore {
  private state: DecksState = initial();
  private listeners = new Set<() => void>();
  /** Codes already asked for (answered or not): never asked twice. */
  private requested = new Set<number>();
  /**
   * The save in course: an existing deck comes back with a newer updatedAt; a new one is the id that was not in the
   * list before. Other statuses (the folder changing, the database loading) may come first and are not it.
   */
  private saving?: { id: string; updatedAt: string; known: ReadonlySet<string> };

  get = (): DecksState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<DecksState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** For tests. */
  reset(): void {
    this.state = initial();
    this.requested.clear();
    this.saving = undefined;
    for (const l of this.listeners) l();
  }

  open(): void {
    this.set({ open: true, view: { kind: 'row' } });
  }

  close(): void {
    this.saving = undefined;
    this.set({ open: false, savePending: false });
  }

  setStatus(status: DecksStatusView): void {
    const decks = sortDecks(status.decks);
    let { selectedId, view } = this.state;
    const saving = this.saving;
    const saved = saving
      ? decks.find((d) =>
          saving.id
            ? d.id === saving.id && d.updatedAt !== saving.updatedAt
            : !saving.known.has(d.id),
        )
      : undefined;
    if (saved) {
      // The deck just saved: at the front of the row, and open
      this.saving = undefined;
      selectedId = saved.id;
      if (view.kind === 'edit') view = { kind: 'box', id: saved.id };
    }
    if (!selectedId || !decks.some((d) => d.id === selectedId)) selectedId = decks[0]?.id;
    if (view.kind === 'box' && !decks.some((d) => d.id === (view as { id: string }).id))
      view = { kind: 'row' };
    // The database just became ready: codes reported missing before may be there now.
    const dbArrived = status.db.state === 'ready' && this.state.status?.db.state !== 'ready';
    if (dbArrived) this.requested.clear();
    this.set({
      status: { ...status, decks },
      selectedId,
      view,
      savePending: this.saving !== undefined,
      ...(dbArrived ? { missing: new Set<number>() } : {}),
    });
  }

  select(id: string | undefined): void {
    if (id !== this.state.selectedId) this.set({ selectedId: id });
  }

  show(view: DecksView): void {
    this.saving = undefined;
    this.set({ view, savePending: false });
  }

  /** The editor with a deck to change, or a new empty one. */
  edit(deck?: Deck): void {
    const draft = deck
      ? { ...deck, main: [...deck.main], extra: [...deck.extra], side: [...deck.side] }
      : emptyDeck(isoDay(Date.now()));
    this.saving = undefined;
    this.set({ view: { kind: 'edit', draft }, savePending: false });
  }

  updateDraft(draft: Deck): void {
    if (this.state.view.kind === 'edit') this.set({ view: { kind: 'edit', draft } });
  }

  /** A save of this deck was sent (id "" for a new one). */
  markSaving(deck: Pick<Deck, 'id' | 'updatedAt'>): void {
    this.saving = {
      id: deck.id,
      updatedAt: deck.updatedAt,
      known: new Set((this.state.status?.decks ?? []).map((d) => d.id)),
    };
    this.set({ savePending: true });
  }

  /** The cards of these codes that were never asked for (and marks them asked). */
  needCards(ids: readonly number[]): number[] {
    const out: number[] = [];
    for (const id of ids) {
      if (this.state.cards.has(id) || this.state.missing.has(id) || this.requested.has(id))
        continue;
      this.requested.add(id);
      out.push(id);
    }
    return out;
  }

  /** The database was missing when they were asked: ask again later. */
  forgetRequested(): void {
    this.requested.clear();
  }

  addCards(cards: readonly DeckCard[], missing: readonly number[] = []): void {
    if (!cards.length && !missing.length) return;
    const next = new Map(this.state.cards);
    for (const c of cards) next.set(c.id, c);
    const gone = new Set(this.state.missing);
    for (const id of missing) gone.add(id);
    for (const c of cards) gone.delete(c.id);
    this.set({ cards: next, missing: gone });
  }

  startSearch(query: string): string {
    const requestId = newRequestId();
    this.set({ search: { requestId, query, cards: this.state.search.cards, pending: true } });
    return requestId;
  }

  clearSearch(): void {
    this.set({ search: { query: '', cards: [], pending: false } });
  }

  /** An answer from the server; one from an older search is ignored. */
  setSearchResults(requestId: string, cards: DeckCard[]): void {
    if (requestId !== this.state.search.requestId) return;
    this.set({ search: { ...this.state.search, cards, pending: false } });
    this.addCards(cards);
  }

  setImportText(text: string): void {
    this.set({ importing: { ...this.state.importing, text } });
  }

  startImport(): string {
    const requestId = newRequestId();
    this.set({ importing: { requestId, text: this.state.importing.text, pending: true } });
    return requestId;
  }

  setImportResult(requestId: string, result: ImportResultView): void {
    if (requestId !== this.state.importing.requestId) return;
    this.set({ importing: { ...this.state.importing, pending: false, result } });
  }

  clearImport(): void {
    this.set({ importing: { text: '', pending: false } });
  }
}

export const decksStore = new DecksStore();

/** A piece that opens the decks panel (the shelf, any rotation or state). */
export const isDecksFurniture = (type: string | undefined): boolean =>
  DECKS_PANEL_TYPES.includes((type ?? '').split(':')[0]);
