import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { CoverCache } from '../../server/cover.js';
import { cleanLines, fetchLrclib, type Lyrics, parseLrc, songKey } from '../../server/lyrics.js';
import { createMusicFeature } from '../../server/musicFeature.js';
import { readMusicConfig } from '../../server/musicConfig.js';

const LINES = [
  { timeMs: 1000, text: 'We are no strangers to love' },
  { timeMs: 5000, text: 'You know the rules and so do I' },
  { timeMs: 9000, text: '♪' },
];

describe('lyrics parsing', () => {
  it('parses LRC times', () => {
    expect(parseLrc('[00:01.50] Hola\n[01:02.00]Adiós\nsin tiempo')).toEqual([
      { timeMs: 1500, text: 'Hola' },
      { timeMs: 62000, text: 'Adiós' },
    ]);
  });

  it('rejects placeholders that are not real lyrics', () => {
    expect(cleanLines([{ timeMs: 0, text: 'probe' }], true)).toBeUndefined();
    expect(cleanLines('nope', true)).toBeUndefined();
    expect(cleanLines(LINES, true)).toHaveLength(3);
  });

  it('sorts synced lines and drops lines without a time', () => {
    const lines = cleanLines([...LINES].reverse().concat([{ text: 'sin tiempo' } as never]), true);
    expect(lines?.map((l) => l.timeMs)).toEqual([1000, 5000, 9000]);
  });

  it('keys songs ignoring case and spaces at the ends', () => {
    expect(songKey(' Never Gonna ', 'RICK')).toBe(songKey('never gonna', 'rick'));
  });
});

describe('LRCLIB', () => {
  const answer =
    (body: unknown, status = 200) =>
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
  const song = { title: 'Una', artist: 'Otra', durationMs: 200_000 };

  it('prefers synced lyrics, falls back to plain', async () => {
    const lrc = LINES.map((l) => `[00:0${l.timeMs / 1000}.00]${l.text}`).join('\n');
    expect((await fetchLrclib(song, answer({ syncedLyrics: lrc })))?.synced).toBe(true);
    const plain = await fetchLrclib(
      song,
      answer({
        syncedLyrics: '[00:00.00]probe',
        plainLyrics: 'línea uno de la canción\nlínea dos de la canción',
      }),
    );
    expect(plain).toMatchObject({ synced: false, source: 'lrclib' });
  });

  it('searches by title and artist when the exact lookup misses (Spotify album differs)', async () => {
    const lrc = LINES.map((l) => `[00:0${l.timeMs / 1000}.00]${l.text}`).join('\n');
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      if (url.includes('/api/get')) return new Response('{}', { status: 404 });
      return new Response(
        JSON.stringify([
          { duration: 400, syncedLyrics: lrc }, // another version: too long
          {
            duration: 181,
            plainLyrics: 'una letra simple de la canción\nsegunda línea de la letra',
          },
          { duration: 179, syncedLyrics: lrc },
        ]),
        { status: 200 },
      );
    };
    const found = await fetchLrclib(
      {
        title: 'La Chica Del Bikini Azul',
        artist: 'Luis Miguel',
        album: 'Otro',
        durationMs: 180_000,
      },
      fetcher,
    );
    expect(found).toMatchObject({ synced: true, source: 'lrclib' });
    expect(urls[1]).toContain('/api/search');
    expect(urls[1]).not.toContain('album');
  });

  it('returns nothing for misses, instrumentals and junk', async () => {
    expect(await fetchLrclib(song, answer({}, 404))).toBeUndefined();
    expect(await fetchLrclib(song, answer({ instrumental: true }))).toBeUndefined();
    expect(await fetchLrclib(song, answer({ syncedLyrics: '[00:00.00]probe' }))).toBeUndefined();
  });
});

describe('lyrics in the music feature', () => {
  function setup(lrclib?: Lyrics) {
    const covers = new CoverCache();
    covers.get = async () => undefined;
    const fetchLyrics = vi.fn(async () => lrclib);
    const feature = createMusicFeature({
      templatePath: 'x',
      serverUrl: () => null,
      run: async () => {
        throw new Error('no spicetify');
      },
      covers,
      fetchLyrics,
    });
    const sent: Record<string, unknown>[] = [];
    const client: FeatureClient = { send: (m) => sent.push(m), privileged: false };
    feature.connect?.(client);
    // No Spicetify in tests: turn the feature on explicitly (it is automatic otherwise)
    feature.handleClientMessage?.({ type: 'setMusicEnabled', enabled: true }, client);
    return { feature, sent, fetchLyrics };
  }

  async function post(
    feature: ReturnType<typeof createMusicFeature>,
    url: string,
    payload: object,
  ) {
    const app = Fastify();
    feature.registerRoutes?.(app);
    const res = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: { authorization: `Bearer ${readMusicConfig().token}` },
    });
    await app.close();
    return res;
  }

  it('uses the Spotify lyrics even when they arrive before the track report', async () => {
    const { feature, sent, fetchLyrics } = setup();
    await post(feature, '/api/music/lyrics', {
      title: 'Una',
      artist: 'Otra',
      synced: true,
      lines: LINES,
    });
    const res = await post(feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    expect(res.json()).toMatchObject({ ok: true, needLyrics: false });
    expect(feature.currentLyrics()?.source).toBe('spotify');
    const last = [...sent].reverse().find((m) => m.type === 'musicLyrics') as { lines?: unknown[] };
    expect(last.lines).toHaveLength(3);
    expect(fetchLyrics).not.toHaveBeenCalled();
    feature.dispose?.();
  });

  it('asks LRCLIB right away when Spotify has none, and after a while when Spotify is silent', async () => {
    const lrclib: Lyrics = { synced: true, source: 'lrclib', lines: LINES };
    const a = setup(lrclib);
    await post(a.feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    await post(a.feature, '/api/music/lyrics', { title: 'Una', artist: 'Otra', lines: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(a.fetchLyrics).toHaveBeenCalledTimes(1);
    expect(a.feature.currentLyrics()?.source).toBe('lrclib');
    a.feature.dispose?.();

    const b = setup(lrclib);
    const res = await post(b.feature, '/api/music', { track: { title: 'Dos', artist: 'Otra' } });
    expect(res.json()).toMatchObject({ needLyrics: true });
    expect(b.fetchLyrics).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 4_100));
    expect(b.fetchLyrics).toHaveBeenCalledTimes(1);
    b.feature.dispose?.();
  }, 10_000);

  it('says "loading" while it looks, and "none" once nothing turned up', async () => {
    const { feature, sent } = setup(undefined);
    const lastLyrics = () =>
      [...sent].reverse().find((m) => m.type === 'musicLyrics') as {
        title?: string;
        loading?: boolean;
        lines?: unknown[];
      };
    await post(feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    expect(lastLyrics()).toMatchObject({ title: 'Una', loading: true });
    await post(feature, '/api/music/lyrics', { title: 'Una', artist: 'Otra', lines: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(lastLyrics()).toEqual({ type: 'musicLyrics', title: 'Una', artist: 'Otra' });
    feature.dispose?.();
  });

  it('looks again when a song without lyrics comes back', async () => {
    const { feature, fetchLyrics } = setup(undefined);
    await post(feature, '/api/music/lyrics', { title: 'Una', artist: 'Otra', lines: null });
    await post(feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    await post(feature, '/api/music', { track: { title: 'Dos', artist: 'Otra' } });
    await post(feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchLyrics).toHaveBeenCalledTimes(2);
    feature.dispose?.();
  });

  it('drops the lyrics when the song changes', async () => {
    const { feature } = setup();
    await post(feature, '/api/music/lyrics', {
      title: 'Una',
      artist: 'Otra',
      synced: true,
      lines: LINES,
    });
    await post(feature, '/api/music', { track: { title: 'Una', artist: 'Otra' } });
    await post(feature, '/api/music', { track: { title: 'Otra canción', artist: 'Otra' } });
    expect(feature.currentLyrics()).toBeUndefined();
    feature.dispose?.();
  });
});
