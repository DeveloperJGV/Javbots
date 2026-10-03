import type { DayNightMode } from '../../../../core/src/messages.js';

/**
 * Visual-effect toggles (shadows, particles, day/night). Module state rather
 * than render params, same shape as the renderer's setGhostHeadlessAgents: the
 * rAF loop reads them every frame, so a toggle lands on the next one. Defaults
 * mirror the server's (everything on, lighting follows the clock).
 */
let shadowsEnabled = true;
let particlesEnabled = true;
let dayNightMode: DayNightMode = 'auto';

export function setShadowsEnabled(enabled: boolean): void {
  shadowsEnabled = enabled;
}

export function areShadowsEnabled(): boolean {
  return shadowsEnabled;
}

export function setParticlesEnabled(enabled: boolean): void {
  particlesEnabled = enabled;
}

export function areParticlesEnabled(): boolean {
  return particlesEnabled;
}

export function setDayNightMode(mode: DayNightMode): void {
  dayNightMode = mode;
}

export function getDayNightMode(): DayNightMode {
  return dayNightMode;
}

/** Cycle order of the toolbar button. */
export function nextDayNightMode(mode: DayNightMode): DayNightMode {
  if (mode === 'auto') return 'day';
  if (mode === 'day') return 'night';
  return 'auto';
}
