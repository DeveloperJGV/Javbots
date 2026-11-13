import { describe, expect, it } from 'vitest';

import { SPOTIFY_API_URL, spotifyBaseUrl } from '../../server/constants.js';
import { createSpotifyPlaylists } from '../../server/playlists/spotifyPlaylists.js';
import { createSpotifyApi, SpotifyError } from '../../server/spotifyApi.js';
import { createFakeSpotify, FAKE_SCOPES_FULL } from '../dobles/fakeSpotify.js';

function setup(scopes: 'full' | 'old' = 'full') {
  const fake = createFakeSpotify({ scopes });
  const sleeps: number[] = [];
  const savedScopes: string[] = [];
  const spotify = createSpotifyApi({
    clientId: 'cliente-de-prueba',
    redirectUri: () => 'http://127.0.0.1:1/callback',
    refreshToken: 'refresco-de-prueba',
    onRefreshToken: () => undefined,
    onScopes: (s) => savedScopes.push(s),
    fetcher: fake.fetcher,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { fake, spotify, api: createSpotifyPlaylists(spotify.request), sleeps, savedScopes };
}

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof SpotifyError ? err.kind : 'other';
  }
};

describe('spotify playlists client', () => {
  it('lists only the owner lists, with their counts', async () => {
    const { api } = setup();
    const lists = await api.myPlaylists();
    expect(lists).toHaveLength(6);
    expect(lists.every((l) => l.name.startsWith('Mis me gusta'))).toBe(true);
    expect(lists[0].count).toBeGreaterThan(0);
  });

  it('reads songs from lists (item and old track shape), top, liked and albums', async () => {
    const { api, fake } = setup();
    const a = await api.playlistSongs('lista80s');
    const b = await api.playlistSongs('listaRock');
    expect(a.length).toBe(fake.playlistById('lista80s')!.trackIds.length);
    expect(b.length).toBe(fake.playlistById('listaRock')!.trackIds.length);
    expect(
      a.every((s) => s.year! >= 1980 && s.year! < 1990 && s.uri.startsWith('spotify:track:')),
    ).toBe(true);
    const top = await api.topTracks();
    expect(new Set(top.map((s) => s.uri)).size).toBe(top.length);
    expect((await api.likedSongs()).length).toBe(Math.ceil(fake.tracks.length / 2));
    const albums = await api.artistAlbums(fake.artists[0].id);
    expect(albums).toHaveLength(3);
    const songs = await api.albumSongs(albums[0]);
    expect(songs).toHaveLength(5);
    expect(songs[0].album).toBe(albums[0].name);
    expect(songs[0].year).toBe(albums[0].year);
    expect((await api.topArtists())[0]).toEqual({
      id: fake.artists[0].id,
      name: fake.artists[0].name,
    });
  });

  it('creates a private list, adds 250 songs in 3 batches and removes it through /me/library', async () => {
    const { api, fake } = setup();
    const created = await api.createPlaylist('Hoy suena · 12 nov · Prueba', 'Hecha por la oficina');
    expect(created.url).toBe(`https://open.spotify.com/playlist/${created.id}`);
    expect(fake.playlistById(created.id)?.public).toBe(false);
    const uris = Array.from({ length: 250 }, (_, i) => fake.tracks[i % fake.tracks.length].uri);
    await api.addSongs(created.id, uris);
    expect(fake.callsTo(/\/items$/, 'POST')).toHaveLength(3);
    expect(fake.playlistById(created.id)?.trackIds).toHaveLength(250);
    await api.removePlaylist(created.id);
    const del = fake.callsTo(/^\/me\/library$/, 'DELETE');
    expect(del[0].query.uris).toBe(`spotify:playlist:${created.id}`);
    expect(fake.library.has(created.id)).toBe(false);
  });

  it('stores the granted scopes and reports a missing permission as "permission"', async () => {
    const full = setup();
    expect(full.spotify.scopes()).toBeUndefined();
    await full.api.myId();
    expect(full.spotify.scopes()).toEqual(FAKE_SCOPES_FULL.split(' '));
    expect(full.savedScopes).toEqual([FAKE_SCOPES_FULL]);
    const old = setup('old');
    expect(await kindOf(old.api.myPlaylists())).toBe('permission');
    expect(old.spotify.scopes()).not.toContain('playlist-read-private');
  });

  it('refreshes an expired token once and retries', async () => {
    const { api, fake } = setup();
    await api.myId();
    const issued = fake.state.tokensIssued;
    fake.expireToken();
    expect((await api.myPlaylists()).length).toBe(6);
    expect(fake.state.tokensIssued).toBe(issued + 1);
  });

  it('waits a short 429 out and retries; fails a long one at once without sleeping', async () => {
    const s = setup();
    s.fake.fault({ match: /\/albums$/, status: 429, retryAfter: 2 });
    expect(await s.api.artistAlbums(s.fake.artists[0].id)).toHaveLength(3);
    expect(s.sleeps).toEqual([2000]);
    s.fake.fault({ match: /\/albums$/, status: 429, retryAfter: 7200 });
    let caught: unknown;
    try {
      await s.api.artistAlbums(s.fake.artists[1].id);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpotifyError);
    expect((caught as SpotifyError).kind).toBe('rate-limit');
    expect((caught as SpotifyError).retryAfterSec).toBe(7200);
    expect(s.sleeps).toEqual([2000]);
  });

  it('maps other failures: 403 without scope text, 404, 5xx after a retry, no session', async () => {
    const s = setup();
    s.fake.fault({ match: /^\/me$/, status: 403, message: 'Premium required' });
    expect(await kindOf(s.api.myId())).toBe('forbidden');
    s.fake.fault({ match: /^\/me\/player\/play$/, status: 404 });
    expect(await kindOf(s.api.play('x'))).toBe('not-found');
    s.fake.fault({ match: /^\/me$/, status: 503, times: 2 });
    expect(await kindOf(s.api.myId())).toBe('http');
    s.fake.fault({ match: /^\/me$/, status: 502 });
    expect(await kindOf(s.api.myId())).toBe('ok');
    s.spotify.disconnect();
    expect(await kindOf(s.api.myId())).toBe('ok'); // cached id: no call
    expect(await kindOf(s.api.topTracks())).toBe('no-session');
  });

  it('only accepts local overrides of the Spotify URLs', () => {
    const env = (v: string) => ({ X: v });
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, env('http://127.0.0.1:4555/v1/'))).toBe(
      'http://127.0.0.1:4555/v1',
    );
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, env('http://localhost:80'))).toBe(
      'http://localhost:80',
    );
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, env('https://evil.example/v1'))).toBe(
      SPOTIFY_API_URL,
    );
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, env('http://127.0.0.1.evil.example:1/v1'))).toBe(
      SPOTIFY_API_URL,
    );
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, env('http://127.0.0.1/v1'))).toBe(SPOTIFY_API_URL);
    expect(spotifyBaseUrl('X', SPOTIFY_API_URL, {})).toBe(SPOTIFY_API_URL);
  });
});
