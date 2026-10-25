import Fastify from 'fastify';
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { CoverCache } from '../../server/cover.js';
import { readMusicConfig, writeMusicConfig } from '../../server/musicConfig.js';
import { createMusicFeature } from '../../server/musicFeature.js';
import { startScreenServer } from '../../server/screenServer.js';
import {
  enabledExtensions,
  installExtension,
  isExtensionInstalled,
  renderExtension,
  type SpicetifyRunner,
} from '../../server/spicetify.js';
import { coverUrlFrom, parseTrackReport } from '../../server/track.js';

const COVER_ID = 'ab67616d0000b273' + '0'.repeat(24);
const TEMPLATE = path.join(__dirname, '..', '..', 'spicetify', 'javbots-musica.js');

/** A Spicetify CLI double backed by a temp userdata folder. */
function fakeSpicetify(userdata: string | null) {
  const calls: string[][] = [];
  const run: SpicetifyRunner = async (args) => {
    calls.push(args);
    if (!userdata) throw new Error('spicetify: not found');
    if (args[0] === 'path') return `${userdata}\n`;
    if (args[0] === 'config' && args[1] === 'extensions') {
      const ini = path.join(userdata, 'config-xpui.ini');
      const list = [...enabledExtensions(userdata), args[2]].join('|');
      fs.writeFileSync(ini, `[AdditionalOptions]\nextensions = ${list}\n`);
    }
    return '';
  };
  return { run, calls };
}

/** Covers never hit the network in tests. */
function fakeCovers(result: string | undefined = 'data:image/jpeg;base64,AAAA') {
  const covers = new CoverCache();
  covers.get = async () => result;
  return covers;
}

function client(privileged: boolean) {
  const sent: Record<string, unknown>[] = [];
  const c: FeatureClient = { send: (m) => sent.push(m), privileged };
  return { c, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('track reports', () => {
  it('parses a full report and normalizes the cover to the CDN URL', () => {
    const r = parseTrackReport({
      track: {
        title: ' Canción ',
        artist: 'Alguien',
        album: 'Disco',
        image: `spotify:image:${COVER_ID}`,
        isPaused: false,
        positionMs: 61_000,
        durationMs: 200_000,
        device: 'Echo Dot',
      },
    });
    expect(r).toEqual({
      title: 'Canción',
      artist: 'Alguien',
      album: 'Disco',
      coverUrl: `https://i.scdn.co/image/${COVER_ID}`,
      isPaused: false,
      positionMs: 61_000,
      durationMs: 200_000,
      device: 'Echo Dot',
    });
  });

  it('treats a missing or null track as "nothing playing" and rejects junk', () => {
    expect(parseTrackReport({ track: null })).toBeNull();
    expect(parseTrackReport({})).toBeNull();
    expect(parseTrackReport('x')).toBeUndefined();
    expect(parseTrackReport({ track: { artist: 'sin título' } })).toBeUndefined();
  });

  it('never maps a cover to anything but Spotify image ids', () => {
    expect(coverUrlFrom('https://evil.example/image/abc')).toBeUndefined();
    expect(coverUrlFrom('spotify:image:../../etc/passwd')).toBeUndefined();
    expect(coverUrlFrom(`https://i.scdn.co/image/${COVER_ID}`)).toBe(
      `https://i.scdn.co/image/${COVER_ID}`,
    );
    expect(coverUrlFrom(`https://image-cdn-ak.spotifycdn.com/image/${COVER_ID}`)).toBe(
      `https://i.scdn.co/image/${COVER_ID}`,
    );
    expect(
      coverUrlFrom(`https://image-cdn-ak.spotifycdn.com.evil.example/image/${COVER_ID}`),
    ).toBeUndefined();
  });

  it('clamps the position to the duration', () => {
    const r = parseTrackReport({ track: { title: 't', positionMs: 9_999, durationMs: 1_000 } });
    expect(r?.positionMs).toBe(1_000);
  });
});

describe('music config', () => {
  it('creates a private token once and keeps it', () => {
    const a = readMusicConfig();
    const b = readMusicConfig();
    expect(a.token.length).toBeGreaterThanOrEqual(16);
    expect(b.token).toBe(a.token);
    // No explicit choice yet: automatic (on only where Spicetify is installed)
    expect(a.enabled).toBeUndefined();
    expect(fs.existsSync(path.join(os.homedir(), '.pixel-agents', 'music.json'))).toBe(true);
  });
});

describe('music feature', () => {
  let userdata: string;

  beforeEach(() => {
    userdata = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-spicetify-'));
  });
  afterEach(() => {
    fs.rmSync(userdata, { recursive: true, force: true });
  });

  async function serverWith(feature: ReturnType<typeof createMusicFeature>) {
    const app = Fastify();
    feature.registerRoutes?.(app);
    await app.ready();
    return app;
  }

  it('accepts reports only with the music token and broadcasts them', async () => {
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => 'http://127.0.0.1:3100',
      run: fakeSpicetify(userdata).run,
      covers: fakeCovers(),
    });
    const viewer = client(false);
    feature.connect?.(viewer.c);
    const app = await serverWith(feature);
    const body = { track: { title: 'Una', artist: 'Otra', image: `spotify:image:${COVER_ID}` } };

    const denied = await app.inject({ method: 'POST', url: '/api/music', payload: body });
    expect(denied.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/music',
      payload: body,
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/music',
      payload: body,
      headers: { authorization: `Bearer ${readMusicConfig().token}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-private-network']).toBe('true');
    await flush();
    const msg = viewer.last('musicNowPlaying') as { track?: { title: string; cover?: string } };
    expect(msg.track?.title).toBe('Una');
    expect(msg.track?.cover).toBe('data:image/jpeg;base64,AAAA');
    await app.close();
    feature.dispose?.();
  });

  it('sends the token to privileged clients only, and hides the track when disabled', async () => {
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => 'http://127.0.0.1:3100',
      run: fakeSpicetify(userdata).run,
      covers: fakeCovers(undefined),
    });
    const owner = client(true);
    const guest = client(false);
    feature.connect?.(owner.c);
    feature.connect?.(guest.c);
    expect(feature.handleClientMessage?.({ type: 'webviewReady' }, owner.c)).toBe(false);
    feature.handleClientMessage?.({ type: 'webviewReady' }, guest.c);
    expect((owner.last('musicStatus') as { token?: string }).token).toBe(readMusicConfig().token);
    expect((guest.last('musicStatus') as { token?: string }).token).toBeUndefined();

    const app = await serverWith(feature);
    await app.inject({
      method: 'POST',
      url: '/api/music',
      payload: { track: { title: 'Una' } },
      headers: { authorization: `Bearer ${readMusicConfig().token}` },
    });
    expect(
      feature.handleClientMessage?.({ type: 'setMusicEnabled', enabled: false }, guest.c),
    ).toBe(true);
    expect((guest.last('musicNowPlaying') as { track?: unknown }).track).toBeUndefined();
    expect(readMusicConfig().enabled).toBe(false);
    feature.handleClientMessage?.({ type: 'setMusicEnabled', enabled: true }, guest.c);
    await app.close();
    feature.dispose?.();
  });

  it('installs the extension only for privileged clients', async () => {
    const spicetify = fakeSpicetify(userdata);
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => 'http://127.0.0.1:3100',
      run: spicetify.run,
      covers: fakeCovers(),
    });
    const guest = client(false);
    feature.handleClientMessage?.({ type: 'installMusicExtension' }, guest.c);
    await flush();
    expect(spicetify.calls.some((c) => c[0] === 'apply')).toBe(false);
    feature.dispose?.();
  });
});

describe('automatic on/off and playback control', () => {
  it('is off where Spicetify is missing, unless the user turns it on', async () => {
    // Forget any explicit choice an earlier test saved
    writeMusicConfig({ token: readMusicConfig().token });
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => null,
      run: fakeSpicetify(null).run,
      covers: fakeCovers(),
    });
    const viewer = client(true);
    feature.connect?.(viewer.c);
    await flush();
    feature.handleClientMessage?.({ type: 'webviewReady' }, viewer.c);
    expect((viewer.last('musicStatus') as { enabled: boolean }).enabled).toBe(false);
    feature.handleClientMessage?.({ type: 'setMusicEnabled', enabled: true }, viewer.c);
    expect((viewer.last('musicStatus') as { enabled: boolean }).enabled).toBe(true);
    feature.dispose?.();
  });

  it('relays playback commands from the owner only, to the connected extension', () => {
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => null,
      run: fakeSpicetify(null).run,
      covers: fakeCovers(),
    });
    const owner = client(true);
    const guest = client(false);
    feature.connect?.(owner.c);
    feature.connect?.(guest.c);
    const sent: string[] = [];
    let onClose = () => {};
    feature.attachControl({
      send: (d) => sent.push(d),
      close: () => {},
      on: (_e, l) => {
        onClose = l;
      },
    });
    expect((owner.last('musicStatus') as { controls?: boolean }).controls).toBe(true);
    feature.handleClientMessage?.({ type: 'musicControl', action: 'next' }, guest.c);
    feature.handleClientMessage?.({ type: 'musicControl', action: 'rm -rf' }, owner.c);
    feature.handleClientMessage?.({ type: 'musicControl', action: 'togglePlay' }, owner.c);
    expect(sent).toEqual(['{"action":"togglePlay"}']);
    onClose();
    expect((owner.last('musicStatus') as { controls?: boolean }).controls).toBe(false);
    feature.dispose?.();
  });
});

describe('spicetify install', () => {
  let userdata: string;
  beforeEach(() => {
    userdata = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-spicetify-'));
    fs.writeFileSync(path.join(userdata, 'config-xpui.ini'), 'extensions = popupLyrics.js\n');
  });
  afterEach(() => fs.rmSync(userdata, { recursive: true, force: true }));

  it('writes the extension with URL and token, enables it once and applies', async () => {
    const spicetify = fakeSpicetify(userdata);
    const result = await installExtension({
      run: spicetify.run,
      templatePath: TEMPLATE,
      serverUrl: 'http://127.0.0.1:3100',
      token: 'tok-1234567890abcdef',
    });
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(
      path.join(userdata, 'Extensions', 'javbots-musica.js'),
      'utf-8',
    );
    expect(written).toContain("'http://127.0.0.1:3100'");
    expect(written).toContain("'tok-1234567890abcdef'");
    expect(written).not.toContain('__JAVBOTS_');
    expect(enabledExtensions(userdata)).toEqual(['popupLyrics.js', 'javbots-musica.js']);
    expect(isExtensionInstalled(userdata)).toBe(true);
    expect(spicetify.calls.at(-1)).toEqual(['apply']);

    // Reinstall: no second "config extensions" (it would duplicate or toggle the entry)
    spicetify.calls.length = 0;
    await installExtension({
      run: spicetify.run,
      templatePath: TEMPLATE,
      serverUrl: 'http://127.0.0.1:3100',
      token: 'tok-1234567890abcdef',
    });
    expect(spicetify.calls.some((c) => c[0] === 'config')).toBe(false);
  });

  it('reports a missing Spicetify instead of throwing', async () => {
    const result = await installExtension({
      run: fakeSpicetify(null).run,
      templatePath: TEMPLATE,
      serverUrl: 'http://127.0.0.1:3100',
      token: 't',
    });
    expect(result.ok).toBe(false);
  });

  it('renders every placeholder', () => {
    expect(renderExtension('a __JAVBOTS_URL__ b __JAVBOTS_TOKEN__ __JAVBOTS_URL__', 'U', 'T')).toBe(
      'a U b T U',
    );
  });
});

describe('cover cache', () => {
  it('refuses non-CDN URLs, non-images and oversized files', async () => {
    const respond = (type: string, size: number) =>
      new CoverCache(
        async () =>
          new Response(new Uint8Array(size), { status: 200, headers: { 'content-type': type } }),
      );
    const url = `https://i.scdn.co/image/${COVER_ID}`;
    expect(await respond('image/jpeg', 10).get('https://evil.example/x.jpg')).toBeUndefined();
    expect(await respond('text/html', 10).get(url)).toBeUndefined();
    expect(await respond('image/jpeg', 600 * 1024).get(url)).toBeUndefined();
    expect(await respond('image/jpeg', 3).get(url)).toBe('data:image/jpeg;base64,AAAA');
  });
});

describe('screen port', () => {
  let userdata: string;

  beforeEach(() => {
    userdata = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-spicetify-'));
  });
  afterEach(() => {
    fs.rmSync(userdata, { recursive: true, force: true });
  });

  it('keeps a valid screenPort in music.json and drops a bad one', () => {
    const token = readMusicConfig().token;
    writeMusicConfig({ token, screenPort: 3101 });
    expect(readMusicConfig().screenPort).toBe(3101);
    writeMusicConfig({ token, screenPort: 80 });
    expect(readMusicConfig().screenPort).toBeUndefined();
  });

  it('moves the position forward while playing and freezes it while paused', async () => {
    let t = 10_000;
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => 'http://127.0.0.1:3100',
      run: fakeSpicetify(userdata).run,
      covers: fakeCovers(),
      now: () => t,
    });
    await flush();
    expect(feature.screenState().track).toBeNull();
    const app = Fastify();
    feature.registerRoutes?.(app);
    await app.ready();
    const post = (track: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/music',
        payload: { track },
        headers: { authorization: `Bearer ${readMusicConfig().token}` },
      });

    await post({ title: 'Una', artist: 'Otra', positionMs: 5_000, durationMs: 200_000 });
    t += 3_000;
    expect(feature.screenState().track).toMatchObject({ title: 'Una', positionMs: 8_000, isPaused: false });

    await post({ title: 'Una', artist: 'Otra', positionMs: 9_000, durationMs: 200_000, isPaused: true });
    t += 5_000;
    expect(feature.screenState().track?.positionMs).toBe(9_000);

    await app.close();
    feature.dispose?.();
  });

  it('serves state and cover only with the music token', async () => {
    const token = 'x'.repeat(32);
    const server = startScreenServer({
      port: 0,
      host: '127.0.0.1',
      token: () => token,
      state: () => ({ track: null }),
      cover: () => 'data:image/png;base64,AQID',
    });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const auth = { authorization: `Bearer ${token}` };

    expect((await fetch(`${base}/api/music/now`)).status).toBe(401);
    expect(await (await fetch(`${base}/api/music/now`, { headers: auth })).json()).toEqual({ track: null });
    const cover = await fetch(`${base}/api/music/cover`, { headers: auth });
    expect(cover.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await cover.arrayBuffer())]).toEqual([1, 2, 3]);
    expect((await fetch(`${base}/api/music`, { method: 'POST', headers: auth })).status).toBe(405);

    await new Promise((resolve) => server.close(resolve));
  });

  it('relays the playback buttons of a screen, only with the token and only known commands', async () => {
    const token = 'y'.repeat(32);
    const sent: string[] = [];
    const server = startScreenServer({
      port: 0,
      host: '127.0.0.1',
      token: () => token,
      state: () => ({ track: null }),
      cover: () => undefined,
      control: (action) => {
        if (action !== 'next' && action !== 'volumeUp') return false;
        sent.push(action);
        return true;
      },
    });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/music/control`;
    const post = (body: string, auth = `Bearer ${token}`) =>
      fetch(url, { method: 'POST', headers: { authorization: auth }, body });

    expect((await post('{"action":"next"}', 'Bearer nope')).status).toBe(401);
    expect((await post('{"action":"next"}')).status).toBe(200);
    expect((await post('{"action":"volumeUp"}')).status).toBe(200);
    expect((await post('{"action":"rm -rf"}')).status).toBe(409);
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ action: 'next', pad: 'z'.repeat(4000) }))).status).not.toBe(200);
    expect(sent).toEqual(['next', 'volumeUp']);

    await new Promise((resolve) => server.close(resolve));
  });

  it('keeps volume and tempo only when they make sense', () => {
    expect(parseTrackReport({ track: { title: 'A', volume: 0.4, tempo: 92 } })).toMatchObject({ volume: 0.4, tempo: 92 });
    const junk = parseTrackReport({ track: { title: 'A', volume: 7, tempo: 'fast' } });
    expect(junk?.volume).toBeUndefined();
    expect(junk?.tempo).toBeUndefined();
  });
});
