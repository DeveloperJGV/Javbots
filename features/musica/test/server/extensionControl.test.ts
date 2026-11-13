import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { describe, expect, it } from 'vitest';

/**
 * The Spicetify extension runs inside Spotify, so it is exercised here in a sandbox: a fake Spicetify, a fake
 * WebSocket and no network. Only the playback commands and their answers are checked.
 */
const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'spicetify', 'javbots-musica.js'),
  'utf-8',
);

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | undefined;
  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(d: string) {
    this.sent.push(d);
  }
}

interface Calls {
  [name: string]: number;
}

function load(opts: {
  playerApi?: Record<string, () => unknown>;
  playbackApi?: Record<string, unknown>;
}) {
  const calls: Calls = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const Player = {
    data: { item: null, isPaused: false },
    addEventListener: () => {},
    getProgress: () => 0,
    getDuration: () => 0,
    getVolume: () => 0.5,
    setVolume: () => count('Player.setVolume'),
    isPlaying: () => true,
    back: () => count('Player.back'),
    next: () => count('Player.next'),
    togglePlay: () => count('Player.togglePlay'),
  };
  const warnings: unknown[][] = [];
  const sandbox = {
    Spicetify: { Player, Platform: { PlayerAPI: opts.playerApi, PlaybackAPI: opts.playbackApi } },
    WebSocket: FakeSocket,
    fetch: () => new Promise(() => {}),
    setTimeout: () => 0,
    setInterval: () => 0,
    console: { warn: (...a: unknown[]) => warnings.push(a), log: () => {} },
    encodeURIComponent,
    JSON,
    Promise,
    Math,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Date,
    isFinite,
  };
  (sandbox as Record<string, unknown>).globalThis = sandbox;
  FakeSocket.last = undefined;
  vm.runInNewContext(SOURCE, sandbox);
  const socket = FakeSocket.last as FakeSocket | undefined;
  if (!socket) throw new Error('the extension did not open its control socket');
  return {
    calls,
    count,
    warnings,
    socket,
    async command(action: string, id?: number) {
      socket.onmessage?.({ data: JSON.stringify(id === undefined ? { action } : { action, id }) });
      // Let the command's promise settle.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    },
    answers: () => socket.sent.map((d) => JSON.parse(d) as Record<string, unknown>),
  };
}

describe('extension playback commands', () => {
  it('goes back through PlayerAPI.skipToPrevious and confirms it', async () => {
    let skipped = 0;
    const ext = load({ playerApi: { skipToPrevious: async () => void skipped++ } });
    await ext.command('previous', 7);
    expect(skipped).toBe(1);
    expect(ext.calls['Player.back']).toBeUndefined();
    expect(ext.answers()).toEqual([{ type: 'controlResult', id: 7, ok: true }]);
  });

  it('reports the reason when Spotify rejects the command (Player.back() hides it)', async () => {
    const ext = load({
      playerApi: {
        skipToPrevious: () =>
          Promise.reject(new Error("Command failed with code '3' and reasons 'x'")),
      },
    });
    await ext.command('previous', 8);
    expect(ext.answers()).toEqual([
      {
        type: 'controlResult',
        id: 8,
        ok: false,
        error: "Command failed with code '3' and reasons 'x'",
      },
    ]);
    expect(ext.warnings).toHaveLength(1);
  });

  it('reports a command that throws right away', async () => {
    const ext = load({
      playerApi: {
        skipToNext: () => {
          throw new Error('boom');
        },
      },
    });
    await ext.command('next', 9);
    expect(ext.answers()).toEqual([{ type: 'controlResult', id: 9, ok: false, error: 'boom' }]);
  });

  it('falls back to the Spicetify shortcut when PlayerAPI is missing', async () => {
    const ext = load({});
    await ext.command('previous', 1);
    await ext.command('next', 2);
    await ext.command('togglePlay', 3);
    expect(ext.calls).toEqual({ 'Player.back': 1, 'Player.next': 1, 'Player.togglePlay': 1 });
    expect(ext.answers().map((a) => a.ok)).toEqual([true, true, true]);
  });

  it('pauses or resumes through PlayerAPI and sets the volume through PlaybackAPI', async () => {
    let paused = 0;
    let volume: number | undefined;
    const ext = load({
      playerApi: { pause: async () => void paused++, resume: async () => {} },
      playbackApi: {
        setVolume: async (v: number) => {
          volume = v;
        },
      },
    });
    await ext.command('togglePlay', 1);
    await ext.command('volumeUp', 2);
    expect(paused).toBe(1);
    expect(volume).toBe(0.6);
    expect(ext.calls['Player.setVolume']).toBeUndefined();
    expect(ext.answers().map((a) => a.ok)).toEqual([true, true]);
  });

  it('answers nothing to an office that sends no id, and ignores unknown commands', async () => {
    let skipped = 0;
    const ext = load({ playerApi: { skipToPrevious: async () => void skipped++ } });
    await ext.command('previous');
    await ext.command('rm -rf', 4);
    expect(skipped).toBe(1);
    expect(ext.answers()).toEqual([]);
  });
});
