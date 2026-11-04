import type { JardinStatus } from '../../../core/src/messages.js';
import { JARDIN_PANEL_SECTION, JARDIN_PANEL_TYPES } from './constants.js';

const baseType = (type: string | undefined): string => (type ?? '').split(':')[0];

export interface JardinState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: JardinStatus;
  open: boolean;
  /** The plant whose furniture was clicked (the panel shows it first). */
  focus?: string;
  /** The section to scroll to (the shed opens on the supplies). */
  section?: 'hoy' | 'inventario';
}

/** The roof garden (features/jardin), outside React: the panel reads it, OfficeState draws thirsty plants with it. */
class JardinStore {
  private state: JardinState = { open: false };
  private listeners = new Set<() => void>();

  get = (): JardinState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<JardinState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: JardinStatus): void {
    this.set({ status });
  }

  open(focus?: string, section?: JardinState['section']): void {
    this.set({ open: true, focus, section });
  }

  /** Opens the panel for a clicked piece of furniture. */
  openFor(type: string | undefined): void {
    const base = baseType(type);
    this.open(plantOfFurniture(type, this.state.status), JARDIN_PANEL_SECTION[base]);
  }

  close(): void {
    this.set({ open: false, focus: undefined, section: undefined });
  }
}

export const jardinStore = new JardinStore();

/** The plant a piece of furniture stands for (a plant names its furniture by type), if any. */
export function plantOfFurniture(
  type: string | undefined,
  status: JardinStatus | undefined,
): string | undefined {
  const base = baseType(type);
  if (!base || !status) return undefined;
  return status.plants.find((p) => p.furniture && baseType(p.furniture) === base)?.id;
}

/** A piece that opens the garden panel: the roof's control pieces, or a plant's own furniture. */
export const isJardinFurniture = (type: string | undefined, status?: JardinStatus): boolean =>
  JARDIN_PANEL_TYPES.includes(baseType(type)) || plantOfFurniture(type, status) !== undefined;
