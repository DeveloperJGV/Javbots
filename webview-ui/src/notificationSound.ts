import {
  ISAAC_DANCE_AUDIO_URLS,
  ISAAC_DANCE_AUDIO_VOLUME,
  ISAAC_DANCE_BASS,
  ISAAC_DANCE_BASS_VOLUME,
  ISAAC_DANCE_EIGHTH_SEC,
  ISAAC_DANCE_MELODY,
  ISAAC_DANCE_MELODY_VOLUME,
  ISAAC_DANCE_SEC,
  NOTIFICATION_NOTE_1_HZ,
  NOTIFICATION_NOTE_1_START_SEC,
  NOTIFICATION_NOTE_2_HZ,
  NOTIFICATION_NOTE_2_START_SEC,
  NOTIFICATION_NOTE_DURATION_SEC,
  NOTIFICATION_VOLUME,
  PARTY_NOTE_DURATION_SEC,
  PARTY_NOTE_GAP_SEC,
  PARTY_NOTES_HZ,
  PARTY_VOLUME,
  PERMISSION_NOTE_1_HZ,
  PERMISSION_NOTE_1_START_SEC,
  PERMISSION_NOTE_2_HZ,
  PERMISSION_NOTE_2_START_SEC,
  PERMISSION_NOTE_DURATION_SEC,
  PERMISSION_VOLUME,
} from './constants.js';
import { isE2E } from './runtime.js';

let soundEnabled = true;
let audioCtx: AudioContext | null = null;

/** E2E test hook: append every (attempted) sound invocation to a window-side log
 *  under window.__pixelAgentsTestHooks.playedSounds (namespace and type
 *  declared by testHooks.ts). Records BEFORE the soundEnabled gate so tests
 *  verify dispatch independent of user audio prefs. Gated on the e2e harness
 *  flag so this unbounded log never grows in a real session. */
function recordSoundForTests(kind: 'done' | 'permission' | 'party' | 'isaac'): void {
  if (!isE2E || typeof window === 'undefined') return;
  if (!window.__pixelAgentsTestHooks) window.__pixelAgentsTestHooks = {};
  if (!window.__pixelAgentsTestHooks.playedSounds) {
    window.__pixelAgentsTestHooks.playedSounds = [];
  }
  window.__pixelAgentsTestHooks.playedSounds.push({ kind, at: Date.now() });
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playNote(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number = NOTIFICATION_NOTE_DURATION_SEC,
  volume: number = NOTIFICATION_VOLUME,
  wave: OscillatorType = 'sine',
): void {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + duration);
}

export async function playDoneSound(): Promise<void> {
  recordSoundForTests('done');
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    // Resume suspended context (webviews suspend until user gesture)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Ascending two-note chime: E5 → B5
    playNote(audioCtx, NOTIFICATION_NOTE_1_HZ, NOTIFICATION_NOTE_1_START_SEC);
    playNote(audioCtx, NOTIFICATION_NOTE_2_HZ, NOTIFICATION_NOTE_2_START_SEC);
  } catch {
    // Audio may not be available
  }
}

export async function playPermissionSound(): Promise<void> {
  recordSoundForTests('permission');
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Descending two-note tap: A5 → E5
    playNote(
      audioCtx,
      PERMISSION_NOTE_1_HZ,
      PERMISSION_NOTE_1_START_SEC,
      PERMISSION_NOTE_DURATION_SEC,
      PERMISSION_VOLUME,
    );
    playNote(
      audioCtx,
      PERMISSION_NOTE_2_HZ,
      PERMISSION_NOTE_2_START_SEC,
      PERMISSION_NOTE_DURATION_SEC,
      PERMISSION_VOLUME,
    );
  } catch {
    // Audio may not be available
  }
}

/** Party mode (fork, Fase 5.5): a quick rising arpeggio, after the done chime has rung. */
export async function playPartySound(): Promise<void> {
  recordSoundForTests('party');
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const start = NOTIFICATION_NOTE_2_START_SEC + NOTIFICATION_NOTE_DURATION_SEC;
    PARTY_NOTES_HZ.forEach((hz, i) => {
      playNote(
        audioCtx!,
        hz,
        start + i * PARTY_NOTE_GAP_SEC,
        PARTY_NOTE_DURATION_SEC,
        PARTY_VOLUME,
      );
    });
  } catch {
    // Audio may not be available
  }
}

let isaacAudio: HTMLAudioElement | null = null;

/** The 8-bit tune Isaac dances to: square-wave melody over a triangle bass. */
async function playIsaacChiptune(): Promise<void> {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const ctx = audioCtx;
  const eighth = ISAAC_DANCE_EIGHTH_SEC;
  for (const [hz, start, len] of ISAAC_DANCE_MELODY) {
    playNote(ctx, hz, start * eighth, len * eighth * 0.9, ISAAC_DANCE_MELODY_VOLUME, 'square');
  }
  for (const [hz, start, len] of ISAAC_DANCE_BASS) {
    playNote(ctx, hz, start * eighth, len * eighth * 0.9, ISAAC_DANCE_BASS_VOLUME, 'triangle');
  }
}

/** Try the user's own track (a file under the public `privado/` folder, never committed);
 *  resolves false when none plays, so the caller falls back to the chiptune. */
function playIsaacTrack(urls: readonly string[]): Promise<boolean> {
  const [url, ...rest] = urls;
  if (!url || typeof Audio === 'undefined') return Promise.resolve(false);
  const audio = new Audio(url);
  audio.volume = ISAAC_DANCE_AUDIO_VOLUME;
  return audio
    .play()
    .then(() => {
      isaacAudio = audio;
      window.setTimeout(() => {
        if (isaacAudio === audio) {
          audio.pause();
          isaacAudio = null;
        }
      }, ISAAC_DANCE_SEC * 1000);
      return true;
    })
    .catch(() => playIsaacTrack(rest));
}

/** Easter egg (fork): Isaac's dance music. */
export async function playIsaacDanceSound(): Promise<void> {
  recordSoundForTests('isaac');
  if (!soundEnabled) return;
  try {
    if (await playIsaacTrack(ISAAC_DANCE_AUDIO_URLS)) return;
    await playIsaacChiptune();
  } catch {
    // Audio may not be available
  }
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch {
    // ignore
  }
}
