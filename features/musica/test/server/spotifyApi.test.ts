import * as path from 'path';
import { describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { CoverCache } from '../../server/cover.js';
import { readMusicConfig, writeMusicConfig } from '../../server/musicConfig.js';
import { createMusicFeature } from '../../server/musicFeature.js';
import { createSpotifyApi, toPlayback } from '../../server/spotifyApi.js';
import type { SpicetifyRunner } from '../../server/spicetify.js';

const TEMPLATE = path.join(__dirname, '..', '..', 'spicetify', 'javbots-musica.js');
const COVER_ID = 'ab67616d0000b273' + '1'.repeat(24);

/** A /me/player answer: a song playing on an Echo. */
function playerJson(overrides: Record<string, unknown> = {}) {
  return {
    currently_playing_type: 'track',
    is_playing: true,
    progress_ms: 61_000,
    device: { name: 'Echo Pop Oficina', type: 'Speaker', volume_percent: 34 },
    item: {
      name: 'Always',
      duration_ms: 258_000,
      artists: [{ name: 'Bon Jovi' }],
      album: { name: 'This Left Feels Right', images: [{ url: `https://i.scdn.co/image/${COVER_ID}`, width: 640 }] },
    },
    ...overrides,
  };
}

type Call = { url: string; method: string; body?: string };

/** A Spotify double: records calls and answers by URL. */
function fakeSpotify(answers: (call: Call) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: { method?: string; body?: string }) => {
    const call = { url, method: init.method ?? 'GET', body: init.body };
    calls.push(call);
    const a = answers(call);
    return new Response(a.json === undefined ? null : JSON.stringify(a.json), {
      status: a.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetcher };
}

const noSpicetify: SpicetifyRunner = async () => {
  throw new Error('spicetify: not found');
};

function fakeCovers() {
  const covers = new CoverCache();
  covers.get = async () => 'data:image/jpeg;base64,AAAA';
  return covers;
}

function client(privileged: boolean) {
  const sent: Record<string, unknown>[] = [];
  const c: FeatureClient = { send: (m) => sent.push(m), privileged };
  return { c, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
}

describe('spotify web api', () => {
  it('maps /me/player to the report shape (device when it is not this computer, volume 0..1)', () => {
    expect(toPlayback(playerJson())).toEqual({
      track: {
        title: 'Always',
        artist: 'Bon Jovi',
        album: 'This Left Feels Right',
        image: `https://i.scdn.co/image/${COVER_ID}`,
        isPaused: false,
        positionMs: 61_000,
        durationMs: 258_000,
        device: 'Echo Pop Oficina',
        volume: 0.34,
      },
    });
    const here = toPlayback(playerJson({ device: { name: 'PC', type: 'Computer', volume_percent: 100 } }));
    expect(here.track?.device).toBeUndefined();
    expect(toPlayback(playerJson({ currently_playing_type: 'episode' }))).toEqual({ track: null });
    expect(toPlayback(playerJson({ item: null }))).toEqual({ track: null });
  });

  it('logs in with PKCE and keeps the refresh token; a revoked token disconnects', async () => {
    const saved: (string | undefined)[] = [];
    let refreshStatus = 200;
    const spotify = fakeSpotify(({ url, body }) => {
      if (url.endsWith('/api/token') && body?.includes('authorization_code')) {
        return { status: 200, json: { access_token: 'acc1', expires_in: 3600, refresh_token: 'ref1' } };
      }
      if (url.endsWith('/api/token')) return { status: refreshStatus, json: { access_token: 'acc2', expires_in: 3600 } };
      if (url.includes('/me/player')) return { status: 200, json: playerJson() };
      return { status: 404 };
    });
    let clock = 1_000_000;
    const api = createSpotifyApi({
      clientId: 'cid',
      redirectUri: () => 'http://127.0.0.1:3100/api/music/spotify/callback',
      onRefreshToken: (t) => saved.push(t),
      fetcher: spotify.fetcher,
      now: () => clock,
    });
    expect(api.connected()).toBe(false);
    const url = new URL(api.authorizeUrl());
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3100/api/music/spotify/callback');
    const state = url.searchParams.get('state') ?? '';

    expect(await api.exchangeCode('code', 'otro-state')).toContain('venció');
    expect(await api.exchangeCode('code', state)).toBeNull();
    expect(saved).toEqual(['ref1']);
    expect(api.connected()).toBe(true);
    const exchange = spotify.calls.find((c) => c.body?.includes('authorization_code'));
    expect(exchange?.body).toContain('code_verifier=');
    expect(exchange?.body).not.toContain('client_secret');

    // Uses the access token while it lasts…
    expect((await api.playback())?.track?.title).toBe('Always');
    expect(spotify.calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(1);
    // …refreshes when it expires…
    clock += 3600_000;
    await api.playback();
    expect(spotify.calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(2);
    // …and a refresh Spotify rejects for good ends the session.
    clock += 3600_000;
    refreshStatus = 400;
    expect(await api.playback()).toBeUndefined();
    expect(api.connected()).toBe(false);
    expect(saved).toEqual(['ref1', undefined]);
  });

  it('runs the playback buttons against the API', async () => {
    const spotify = fakeSpotify(({ url }) => {
      if (url.endsWith('/api/token')) return { status: 200, json: { access_token: 'acc', expires_in: 3600 } };
      if (url.endsWith('/me/player?additional_types=track')) return { status: 200, json: playerJson() };
      return { status: 204 };
    });
    const api = createSpotifyApi({
      clientId: 'cid',
      redirectUri: () => 'http://127.0.0.1/cb',
      refreshToken: 'ref',
      onRefreshToken: () => {},
      fetcher: spotify.fetcher,
    });
    expect(await api.control('next', undefined)).toBe(true);
    expect(await api.control('togglePlay', undefined)).toBe(true);
    expect(await api.control('volumeUp', 0.34)).toBe(true);
    expect(await api.control('volumeDown', undefined)).toBe(false);
    expect(await api.control('nada', undefined)).toBe(false);
    const paths = spotify.calls.map((c) => `${c.method} ${c.url.replace('https://api.spotify.com/v1', '')}`);
    expect(paths).toContain('POST /me/player/next');
    expect(paths).toContain('PUT /me/player/pause');
    expect(paths).toContain('PUT /me/player/volume?volume_percent=44');
  });
});

describe('music feature with the web api', () => {
  function featureWith(answers: Parameters<typeof fakeSpotify>[0]) {
    writeMusicConfig({ ...readMusicConfig(), enabled: true, spotifyClientId: 'cid', spotifyRefreshToken: 'ref' });
    const spotify = fakeSpotify(answers);
    let clock = 5_000_000;
    const feature = createMusicFeature({
      templatePath: TEMPLATE,
      serverUrl: () => 'http://127.0.0.1:3100',
      run: noSpicetify,
      covers: fakeCovers(),
      now: () => clock,
      spotifyFetch: spotify.fetcher,
      pollSpotify: false,
      fetchLyrics: async () => undefined,
    });
    const viewer = client(true);
    feature.connect?.(viewer.c);
    const tick = (ms: number) => {
      clock += ms;
    };
    return { feature, spotify, viewer, tick };
  }

  const tokenOk = { status: 200, json: { access_token: 'acc', expires_in: 3600 } };

  it('fills in what the account plays when the extension is silent, and reports the source', async () => {
    const { feature, viewer } = featureWith(({ url }) =>
      url.endsWith('/api/token') ? tokenOk : { status: 200, json: playerJson() },
    );
    await feature.pollSpotify();
    expect(feature.current()?.title).toBe('Always');
    expect(feature.current()?.device).toBe('Echo Pop Oficina');
    feature.handleClientMessage?.({ type: 'webviewReady' }, viewer.c);
    const status = viewer.last('musicStatus') as Record<string, unknown>;
    expect(status.spotifyConfigured).toBe(true);
    expect(status.spotifyConnected).toBe(true);
    expect(status.source).toBe('spotify');
    expect(status.controls).toBe(true);
    expect(feature.screenState().track?.volume).toBe(0.34);
    feature.dispose?.();
    writeMusicConfig({ token: readMusicConfig().token });
  });

  it('leaves the extension alone while Spotify plays here, and takes over when it pauses or goes quiet', async () => {
    const { feature, spotify, tick } = featureWith(({ url }) =>
      url.endsWith('/api/token') ? tokenOk : { status: 200, json: playerJson() },
    );
    const app = (await import('fastify')).default();
    feature.registerRoutes?.(app);
    await app.ready();
    const token = readMusicConfig().token;
    const post = (track: Record<string, unknown> | null) =>
      app.inject({ method: 'POST', url: '/api/music', headers: { authorization: `Bearer ${token}` }, payload: { track } });

    await post({ title: 'Local', artist: 'PC', isPaused: false, positionMs: 0, durationMs: 100_000 });
    await feature.pollSpotify();
    expect(spotify.calls.filter((c) => c.url.includes('/me/player'))).toHaveLength(0);
    expect(feature.current()?.title).toBe('Local');

    // Paused on the PC while the account plays elsewhere: the API's song wins and the extension's pause is ignored.
    await post({ title: 'Local', artist: 'PC', isPaused: true, positionMs: 0, durationMs: 100_000 });
    await feature.pollSpotify();
    expect(feature.current()?.title).toBe('Always');
    await post({ title: 'Local', artist: 'PC', isPaused: true, positionMs: 0, durationMs: 100_000 });
    expect(feature.current()?.title).toBe('Always');

    // The extension speaks again with a playing song: it is the source once more.
    await post({ title: 'Local', artist: 'PC', isPaused: false, positionMs: 0, durationMs: 100_000 });
    expect(feature.current()?.title).toBe('Local');

    // Extension gone for a while and nothing playing anywhere: the track clears.
    tick(30_000);
    spotify.calls.length = 0;
    const silent = featureWith(({ url }) => (url.endsWith('/api/token') ? tokenOk : { status: 204 }));
    await silent.feature.pollSpotify();
    expect(silent.feature.current()).toBeUndefined();
    silent.feature.dispose?.();
    feature.dispose?.();
    await app.close();
    writeMusicConfig({ token: readMusicConfig().token });
  });

  it('disconnects on request and drops the track that came from the API', async () => {
    const { feature, viewer } = featureWith(({ url }) =>
      url.endsWith('/api/token') ? tokenOk : { status: 200, json: playerJson() },
    );
    await feature.pollSpotify();
    expect(feature.current()).toBeDefined();
    feature.handleClientMessage?.({ type: 'disconnectSpotify' }, viewer.c);
    expect(feature.current()).toBeUndefined();
    const status = viewer.last('musicStatus') as Record<string, unknown>;
    expect(status.spotifyConnected).toBe(false);
    expect(readMusicConfig().spotifyRefreshToken).toBeUndefined();
    feature.dispose?.();
    writeMusicConfig({ token: readMusicConfig().token });
  });
});
