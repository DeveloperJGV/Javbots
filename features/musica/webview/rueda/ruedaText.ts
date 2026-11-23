import type { RuedaStatus } from '../../../../core/src/messages.js';

/** Steps offered in the panel (the program accepts 1-25). */
export const RUEDA_STEPS = [1, 2, 3, 5, 10];

/** Why a key goes to Windows, in words (the server's reason codes). */
const REASON_TEXT: Record<string, string> = {
  spotify: 'mueve el aparato donde suena Spotify',
  paused: 'está en pausa',
  no_session: 'no tiene sesión de Spotify',
  rate_limited: 'Spotify pidió esperar un momento',
  offline: 'no hay conexión con Spotify',
  forbidden: 'Spotify no dejó cambiar el volumen',
  not_found: 'Spotify ya no ve ese aparato',
  error: 'Spotify respondió con un error',
  no_data: 'todavía no sabe qué suena',
  stale: 'no sabe qué suena desde hace rato',
  nothing_playing: 'no suena nada en Spotify',
  this_computer: 'Spotify suena en esta computadora',
  no_volume_control: 'ese aparato no deja mover el volumen',
};

export const reasonText = (reason: string | undefined): string =>
  (reason && REASON_TEXT[reason]) || 'otra razón';

/** The headline under the scene: where the wheel goes right now. */
export function headline(s: RuedaStatus): string {
  if (!s.installed && !s.running) return 'Rueda de volumen: no está en esta computadora';
  if (!s.running) return 'Rueda de volumen: apagada';
  if (s.settings.paused) return 'En pausa: la rueda solo mueve Windows';
  if (s.mode === 'spotify' && s.device)
    return `La rueda mueve ${s.device.name}${s.device.volume !== undefined ? ` · ${s.device.volume}` : ''}`;
  return 'La rueda mueve Windows';
}

/** The second line: why, or what plays where. */
export function detail(s: RuedaStatus): string {
  if (!s.installed && !s.running)
    return 'Es un programa aparte para Windows. Préndelo una vez a mano (doble clic en rueda.pyw) y después se maneja desde aquí.';
  if (!s.running) return 'Préndela para que la rueda siga a tu música.';
  if (s.signingIn) return 'Esperando que aceptes en el navegador…';
  if (s.mode === 'spotify') return 'Suena en otro aparato: la rueda le sube y le baja ahí.';
  const why = reasonText(s.reason);
  return `Va a Windows porque ${why}.`;
}

/** The last key, for the small line: "Última vuelta: a Windows (no suena nada en Spotify), 10:02". */
export function lastKeyText(s: RuedaStatus): string | null {
  const k = s.lastKey;
  if (!s.running || !k) return null;
  const when = k.at ? hhmm(k.at) : '';
  if (k.to === 'spotify') return `Última vuelta: al aparato de Spotify${when ? `, ${when}` : ''}`;
  return `Última vuelta: a Windows (${reasonText(k.reason)})${when ? `, ${when}` : ''}`;
}

/** "10:02" from the program's local ISO time (digital, 24 h). */
export function hhmm(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** What the knob scene shows. */
export interface SceneTarget {
  /** Off: dark scene. */
  on: boolean;
  /** Where the cable goes. */
  to: 'spotify' | 'windows';
  /** 0-100, or undefined (unknown: the knob rests at 0). */
  volume?: number;
  /** Notes come out of the speaker. */
  playing: boolean;
}

export function sceneTarget(s: RuedaStatus | undefined): SceneTarget {
  if (!s || !s.running) return { on: false, to: 'windows', playing: false };
  const spotify = s.mode === 'spotify' && !s.settings.paused;
  return {
    on: true,
    to: spotify ? 'spotify' : 'windows',
    volume: s.device?.volume,
    playing: Boolean(s.device?.playing),
  };
}
