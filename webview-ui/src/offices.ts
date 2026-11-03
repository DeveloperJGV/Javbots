/**
 * Which office this page shows (core/src/offices.ts). The page asks for one with `?oficina=` (remembered per
 * browser) and the server answers with officesLoaded: the offices it has and the one it gave this page (the main
 * office when the asked one doesn't exist). Switching reloads the page. VS Code always shows the main office.
 */
import type { OfficeInfo } from '../../core/src/messages.js';
import { MAIN_OFFICE, sitsInOffice } from '../../core/src/offices.js';
import { OFFICE_STORAGE_KEY, OFFICE_URL_PARAM } from './constants.js';
import { isBrowserRuntime } from './runtime.js';

function readRequested(): string {
  if (!isBrowserRuntime) return MAIN_OFFICE;
  const fromUrl = new URLSearchParams(window.location.search).get(OFFICE_URL_PARAM);
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(OFFICE_STORAGE_KEY) ?? MAIN_OFFICE;
  } catch {
    return MAIN_OFFICE; // storage blocked
  }
}

/** The office this page asks for (fixed for the life of the page; the server may answer with the main one). */
export const requestedOffice: string = readRequested();

export interface OfficesState {
  /** The office the server gave this page. */
  current: string;
  offices: OfficeInfo[];
  mainLabel?: string;
  mainTitle?: string;
}

class OfficesStore {
  private state: OfficesState = { current: requestedOffice, offices: [] };
  private listeners = new Set<() => void>();

  get = (): OfficesState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(next: OfficesState): void {
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Whether an agent of this Claude Code profile is drawn in this page's office. */
  sitsHere(profile: string | undefined): boolean {
    return sitsInOffice(profile, this.state.current, this.state.offices);
  }
}

export const officesStore = new OfficesStore();

export function switchOffice(office: string): void {
  if (office === officesStore.get().current) return;
  try {
    window.localStorage.setItem(OFFICE_STORAGE_KEY, office);
  } catch {
    /* the URL still carries it */
  }
  const url = new URL(window.location.href);
  url.searchParams.set(OFFICE_URL_PARAM, office);
  window.location.assign(url.toString());
}
