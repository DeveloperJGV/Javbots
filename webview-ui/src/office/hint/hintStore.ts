/** The sign under the mouse: what the piece there opens, and where the cursor is (CSS px of the window). */
export interface FurnitureHintState {
  label: string;
  x: number;
  y: number;
}

/** The one hover sign of the office, outside React: OfficeCanvas sets it, FurnitureHint draws it. */
class HintStore {
  private state: FurnitureHintState | null = null;
  private listeners = new Set<() => void>();

  get = (): FurnitureHintState | null => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(next: FurnitureHintState | null): void {
    const h = this.state;
    if (h === next || (h && next && h.label === next.label && h.x === next.x && h.y === next.y))
      return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  clear(): void {
    this.set(null);
  }
}

export const hintStore = new HintStore();
