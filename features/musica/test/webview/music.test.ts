import { describe, expect, it } from 'vitest';

import type { FurnitureInstance } from '../../../../webview-ui/src/office/types.js';
import { pixelsToSprite, snapChannel } from '../../webview/coverSprite.js';
import {
  applyMusicFurniture,
  framedCover,
  glintPoint,
  MusicNotes,
  spinSprite,
} from '../../webview/musicFurniture.js';
import {
  formatTime,
  isColumnVisible,
  isMusicPlaying,
  type MusicState,
  playbackPositionMs,
} from '../../webview/musicStore.js';

const DARK = '#38292f';
const WOOD = '#a9411d';

/** 32x32 sprite: wood everywhere, a dark band where the record is. */
function turntableSprite(): string[][] {
  return Array.from({ length: 32 }, (_, y) =>
    Array.from({ length: 32 }, () => (y >= 14 && y <= 19 ? DARK : WOOD)),
  );
}

function furniture(type: string, sprite = turntableSprite()): FurnitureInstance {
  return { type, sprite, x: 0, y: 0, zY: 32 } as FurnitureInstance;
}

function state(track: Partial<MusicState['track']> | undefined, extra: Partial<MusicState> = {}) {
  return {
    receivedAt: 1_000,
    coverSprite: null,
    status: {
      type: 'musicStatus',
      enabled: true,
      spicetifyFound: true,
      extensionInstalled: true,
    },
    track: track
      ? { title: 't', artist: 'a', isPaused: false, positionMs: 0, durationMs: 180_000, ...track }
      : undefined,
    ...extra,
  } as MusicState;
}

describe('turntable', () => {
  it('paints the glint only on the black of the record', () => {
    const base = turntableSprite();
    const frame = spinSprite(base, 0);
    const [x, y] = glintPoint(0);
    expect(frame[y][x]).not.toBe(DARK);
    // Wood around it is untouched, and the base sprite is not mutated
    expect(frame[0][0]).toBe(WOOD);
    expect(base[y][x]).toBe(DARK);
    // Frames are cached per step
    expect(spinSprite(base, 0)).toBe(frame);
    expect(spinSprite(base, 8)).toBe(frame);
  });

  it('only spins while something plays', () => {
    const items = [furniture('TURNTABLE')];
    expect(applyMusicFurniture(items, 0, state(undefined))).toBe(items);
    expect(applyMusicFurniture(items, 0, state({ isPaused: true }))).toBe(items);
    expect(applyMusicFurniture(items, 0, state({}))[0].sprite).not.toBe(items[0].sprite);
  });
});

describe('album frame', () => {
  it('paints the cover into the hole', () => {
    const frame = Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => WOOD));
    const cover = Array.from({ length: 22 }, () => Array.from({ length: 22 }, () => '#ff0000'));
    const out = framedCover(frame, cover);
    expect(out[5][5]).toBe('#ff0000');
    expect(out[26][26]).toBe('#ff0000');
    expect(out[4][4]).toBe(WOOD);
    expect(out[27][27]).toBe(WOOD);
  });

  it('shows the cover even while paused, and not when the feature is off', () => {
    const cover = Array.from({ length: 22 }, () => Array.from({ length: 22 }, () => '#00ff00'));
    const items = [furniture('ALBUM_FRAME')];
    const paused = state({ isPaused: true }, { coverSprite: cover });
    expect(applyMusicFurniture(items, 0, paused)[0].sprite[10][10]).toBe('#00ff00');
    const off = { ...paused, status: { ...paused.status!, enabled: false } };
    expect(applyMusicFurniture(items, 0, off)).toBe(items);
  });
});

describe('notes', () => {
  it('rise off the turntable only while playing', () => {
    const added: unknown[] = [];
    const sink = { add: (p: unknown) => added.push(p) };
    const notes = new MusicNotes(() => 0);
    const items = [furniture('TURNTABLE')];
    notes.update(5, items, state({ isPaused: true }), sink);
    expect(added).toHaveLength(0);
    notes.update(5, items, state({}), sink);
    expect(added.length).toBeGreaterThan(0);
    expect((added[0] as { kind: string }).kind).toBe('note');
  });
});

describe('music state', () => {
  it('runs the progress from the report while playing, frozen when paused', () => {
    const s = state({ positionMs: 10_000 });
    expect(playbackPositionMs(s, 4_000)).toBe(13_000);
    expect(playbackPositionMs(state({ positionMs: 10_000, isPaused: true }), 4_000)).toBe(10_000);
    expect(playbackPositionMs(state({ positionMs: 179_000 }), 60_000)).toBe(180_000);
  });

  it('keeps the column a little while after a pause, then gives the space back', () => {
    const paused = state({ isPaused: true }, { pausedSince: 0 });
    expect(isColumnVisible(paused, 5_000)).toBe(true);
    expect(isColumnVisible(paused, 11_000)).toBe(false);
    expect(isColumnVisible(state(undefined), 0)).toBe(false);
    expect(isMusicPlaying(paused)).toBe(false);
  });

  it('formats times like a player', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(61_500)).toBe('1:01');
    expect(formatTime(221_000)).toBe('3:41');
  });
});

describe('cover pixel art', () => {
  it('snaps colors to a few levels', () => {
    expect(snapChannel(0)).toBe(0);
    expect(snapChannel(255)).toBe(255);
    expect(snapChannel(130)).toBe(153);
    const sprite = pixelsToSprite(new Uint8ClampedArray([255, 0, 130, 255]), 1);
    expect(sprite).toEqual([['#ff0099']]);
  });
});
