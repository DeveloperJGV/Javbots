/**
 * Which office (building) and floor this page shows (core/src/offices.ts). The page asks for an office with
 * `?oficina=` and a floor of it with `?piso=` (both remembered per browser, the floor per office) and the server
 * answers with officesLoaded: the offices it has, their floors, and the office and floor it gave this page (the
 * main office and the ground floor when the asked ones don't exist). Switching reloads the page. VS Code always
 * shows the main office's ground floor. Agents are only drawn on the ground floor: that's where their seats are.
 */
import type { FloorInfo, OfficeInfo } from '../../core/src/messages.js';
import { GROUND_FLOOR, MAIN_OFFICE, sitsInOffice } from '../../core/src/offices.js';
import {
  FLOOR_STORAGE_KEY_PREFIX,
  FLOOR_URL_PARAM,
  OFFICE_STORAGE_KEY,
  OFFICE_URL_PARAM,
} from './constants.js';
import { isBrowserRuntime } from './runtime.js';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function readRequested(): string {
  if (!isBrowserRuntime || typeof window === 'undefined') return MAIN_OFFICE; // VS Code, Node tests
  const fromUrl = new URLSearchParams(window.location.search).get(OFFICE_URL_PARAM);
  return fromUrl || (readStored(OFFICE_STORAGE_KEY) ?? MAIN_OFFICE);
}

function readRequestedFloor(office: string): string {
  if (!isBrowserRuntime || typeof window === 'undefined') return GROUND_FLOOR;
  const fromUrl = new URLSearchParams(window.location.search).get(FLOOR_URL_PARAM);
  return fromUrl || (readStored(FLOOR_STORAGE_KEY_PREFIX + office) ?? GROUND_FLOOR);
}

/** The office this page asks for (fixed for the life of the page; the server may answer with the main one). */
export const requestedOffice: string = readRequested();
/** The floor of that office this page asks for (the server may answer with the ground floor). */
export const requestedFloor: string = readRequestedFloor(requestedOffice);

export interface OfficesState {
  /** The office the server gave this page. */
  current: string;
  /** The floor of it the server gave this page. */
  floor: string;
  offices: OfficeInfo[];
  /** Floors of the main office besides the ground floor, top floor first. */
  mainFloors?: FloorInfo[];
  mainLabel?: string;
  mainTitle?: string;
}

/** An office's floors besides the ground floor, top floor first. */
export function floorsOf(state: OfficesState, office: string): FloorInfo[] {
  if (office === MAIN_OFFICE) return state.mainFloors ?? [];
  return state.offices.find((o) => o.id === office)?.floors ?? [];
}

class OfficesStore {
  private state: OfficesState = {
    current: requestedOffice,
    floor: requestedFloor,
    offices: [],
  };
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

  /** Whether this page shows its office's ground floor (the only one with agents). */
  onGroundFloor(): boolean {
    return this.state.floor === GROUND_FLOOR;
  }

  /** Whether an agent of this Claude Code profile is drawn in this page (its office, on the ground floor). */
  sitsHere(profile: string | undefined): boolean {
    return this.onGroundFloor() && sitsInOffice(profile, this.state.current, this.state.offices);
  }
}

export const officesStore = new OfficesStore();

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* the URL still carries it */
  }
}

/** Goes to another office, on the floor this browser last saw there (the ground floor the first time). */
export function switchOffice(office: string): void {
  if (office === officesStore.get().current) return;
  remember(OFFICE_STORAGE_KEY, office);
  const url = new URL(window.location.href);
  url.searchParams.set(OFFICE_URL_PARAM, office);
  url.searchParams.delete(FLOOR_URL_PARAM);
  window.location.assign(url.toString());
}

/** Goes to another floor of this page's office. */
export function switchFloor(floor: string): void {
  const { current, floor: here } = officesStore.get();
  if (floor === here) return;
  remember(FLOOR_STORAGE_KEY_PREFIX + current, floor);
  const url = new URL(window.location.href);
  url.searchParams.set(OFFICE_URL_PARAM, current);
  if (floor === GROUND_FLOOR) url.searchParams.delete(FLOOR_URL_PARAM);
  else url.searchParams.set(FLOOR_URL_PARAM, floor);
  window.location.assign(url.toString());
}
