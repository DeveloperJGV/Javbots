import type {
  OfertasAsistenteBusquedaSimilares,
  OfertasAsistenteEstado,
  OfertasAsistenteFallo,
  OfertasAsistenteInvestigacion,
  OfertasAsistenteJob,
  OfertasAsistenteResultado,
  OfertasResults,
  OfertasStatus,
} from '../../../core/src/messages.js';
import { OFERTAS_PANEL_TYPES, type OfertasTab } from './constants.js';

export interface OfertasState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: OfertasStatus;
  /** The search in course (or the last one): its query while waiting, the server's answer after. */
  results?: OfertasResults;
  /** Only answers to this search are taken; older ones are ignored. */
  requestId?: string;
  open: boolean;
  tab: OfertasTab;
  /** The optional assistant: whether it can be used and what it is doing (undefined = the server said nothing). */
  asistente?: OfertasAsistenteEstado;
  /** Its answers on this page, by target (asistenteKey): a watched search, or a product of a live search. */
  asistenteResults: Record<string, AsistenteEntry>;
}

/** What the assistant said about one product: the data of each job, or why the last try gave nothing. */
export interface AsistenteEntry {
  precio?: OfertasAsistenteInvestigacion;
  similares?: OfertasAsistenteBusquedaSimilares;
  error?: { job: OfertasAsistenteJob; reason: OfertasAsistenteFallo; detail?: string };
}

/** Where an answer belongs: "w:<watch id>" or "g:<search id>:<group key>". */
export function asistenteKey(t: {
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}): string | undefined {
  if (t.watchId) return `w:${t.watchId}`;
  if (t.requestId && t.groupKey) return `g:${t.requestId}:${t.groupKey}`;
  return undefined;
}

let counter = 0;
const newRequestId = () => `${Date.now().toString(36)}-${++counter}`;

/** The deals finder (features/ofertas), outside React: the panel reads it, OfficeState lights the kiosk. */
class OfertasStore {
  private state: OfertasState = { open: false, tab: 'buscar', asistenteResults: {} };
  private listeners = new Set<() => void>();

  get = (): OfertasState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<OfertasState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: OfertasStatus): void {
    this.set({ status });
  }

  setAsistente(estado: OfertasAsistenteEstado): void {
    this.set({ asistente: estado });
  }

  /** The end of one query: its data replaces the earlier one of the same job, or the reason it failed is kept. */
  setAsistenteResult(r: OfertasAsistenteResultado): void {
    const key = asistenteKey(r);
    if (!key) return;
    const prev = this.state.asistenteResults[key] ?? {};
    const next: AsistenteEntry = { ...prev };
    if (r.ok) {
      if (r.precio) next.precio = r.precio;
      if (r.similares) next.similares = r.similares;
      if (prev.error?.job === r.job) delete next.error;
    } else if (r.reason) {
      next.error = { job: r.job, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) };
    }
    this.set({ asistenteResults: { ...this.state.asistenteResults, [key]: next } });
  }

  /** Starts a search: returns the id to send, and shows "Buscando…" until its answer comes. */
  startSearch(query: string): string {
    const requestId = newRequestId();
    this.set({
      requestId,
      results: {
        type: 'ofertasResults',
        requestId,
        query,
        searching: true,
        groups: [],
        deals: [],
        sources: this.state.status?.sources ?? [],
        links: [],
      },
    });
    return requestId;
  }

  /** An answer from the server; one from an older search is ignored. */
  setResults(results: OfertasResults): void {
    if (results.requestId !== this.state.requestId) return;
    this.set({ results });
  }

  /** The search field was emptied: forgets the search on screen; an answer still on its way is ignored. */
  clearSearch(): void {
    if (!this.state.results && !this.state.requestId) return;
    this.set({ results: undefined, requestId: undefined });
  }

  open(tab?: OfertasTab): void {
    this.set({ open: true, ...(tab ? { tab } : {}) });
  }

  close(): void {
    this.set({ open: false });
  }

  setTab(tab: OfertasTab): void {
    this.set({ tab });
  }
}

export const ofertasStore = new OfertasStore();

/** A piece that opens the panel (the kiosk, off or on). */
export const isOfertasFurniture = (type: string | undefined): boolean =>
  OFERTAS_PANEL_TYPES.includes((type ?? '').split(':')[0]);
