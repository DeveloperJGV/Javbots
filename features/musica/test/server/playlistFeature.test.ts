import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PlaylistRecipe, PlaylistStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { PLAYLIST_DURATION_SLACK_MS } from '../../server/constants.js';
import { CoverCache } from '../../server/cover.js';
import { readMusicConfig, writeMusicConfig } from '../../server/musicConfig.js';
import { createMusicFeature } from '../../server/musicFeature.js';
import type { SpicetifyRunner } from '../../server/spicetify.js';
import { createFakeSpotify } from '../dobles/fakeSpotify.js';

const TEMPLATE = path.join(__dirname, '..', '..', 'spicetify', 'javbots-musica.js');
const dataFile = () => path.join(os.homedir(), '.pixel-agents', 'playlists.json');

const noSpicetify: SpicetifyRunner = async () => {
  throw new Error('spicetify: not found');
};

function seeded(seed = 3) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function client(privileged: boolean) {
  const sent: Record<string, unknown>[] = [];
  const c: FeatureClient = { send: (m) => sent.push(m), privileged };
  const last = () =>
    [...sent].reverse().find((m) => m.type === 'playlistStatus') as PlaylistStatus | undefined;
  return { c, sent, last };
}

function setup(
  opts: { scopes?: 'full' | 'old'; savedScopes?: string; rotateRefresh?: boolean } = {},
) {
  const fake = createFakeSpotify({ scopes: opts.scopes, rotateRefresh: opts.rotateRefresh });
  const config = readMusicConfig();
  writeMusicConfig({
    token: config.token,
    spotifyClientId: 'cliente-de-prueba',
    spotifyRefreshToken: 'refresco-de-prueba',
    ...(opts.savedScopes ? { spotifyScopes: opts.savedScopes } : {}),
  });
  const covers = new CoverCache();
  covers.get = async () => undefined;
  const music = createMusicFeature({
    templatePath: TEMPLATE,
    serverUrl: () => 'http://127.0.0.1:1',
    run: noSpicetify,
    covers,
    pollSpotify: false,
    spotifyFetch: fake.fetcher,
    spotifySleep: async () => undefined,
    rng: seeded(),
  });
  const owner = client(true);
  const guest = client(false);
  music.connect!(owner.c);
  music.connect!(guest.c);
  const send = async (cmd: Record<string, unknown>, who = owner) => {
    music.handleClientMessage!({ type: 'playlistCommand', ...cmd }, who.c);
    await music.playlists.settle();
  };
  return { fake, music, owner, guest, send };
}

const recipe = (over: Partial<PlaylistRecipe> = {}): PlaylistRecipe => ({
  id: '',
  name: 'Para trabajar',
  top: true,
  liked: true,
  surprise: false,
  playlists: [],
  artists: [],
  decades: [],
  minutes: 60,
  discover: false,
  avoidRecent: true,
  ...over,
});

beforeEach(() => {
  fs.rmSync(dataFile(), { force: true });
});

describe('playlist del día', () => {
  it('runs open → preview → reject → reroll → create → keep / delete', async () => {
    const { fake, owner, send } = setup();
    await send({ action: 'open' });
    let st = owner.last()!;
    expect(st.connected).toBe(true);
    expect(st.needsReconnect).toBe(false);
    expect(st.playlists).toHaveLength(6);
    expect(st.artists.length).toBeGreaterThan(0);
    expect(st.recipes).toHaveLength(4);

    await send({ action: 'preview', recipe: recipe() });
    st = owner.last()!;
    expect(st.error).toBeUndefined();
    expect(st.preview!.songs.length).toBeGreaterThan(5);
    expect(Math.abs(st.preview!.totalMs - 60 * 60_000)).toBeLessThanOrEqual(
      PLAYLIST_DURATION_SLACK_MS,
    );

    const gone = st.preview!.songs[2];
    await send({ action: 'reject', uri: gone.uri });
    st = owner.last()!;
    expect(st.preview!.songs.some((s) => s.uri === gone.uri)).toBe(false);
    expect(st.rejected[0]).toMatchObject({ uri: gone.uri, title: gone.title, artist: gone.artist });

    const callsBefore = fake.state.calls.length;
    await send({ action: 'reroll' });
    st = owner.last()!;
    expect(fake.state.calls.length).toBe(callsBefore); // same material, no Spotify call
    expect(st.preview!.songs.some((s) => s.uri === gone.uri)).toBe(false);

    const uris = st.preview!.songs.map((s) => s.uri);
    await send({ action: 'create', play: true });
    st = owner.last()!;
    expect(st.error).toBeUndefined();
    expect(st.preview).toBeUndefined();
    expect(st.lists).toHaveLength(1);
    expect(st.lists[0]).toMatchObject({ kept: false, count: uris.length });
    expect(st.lists[0].name).toMatch(/^Hoy suena · \d+ \w+ · Para trabajar$/);
    const created = fake.playlistById(st.lists[0].id)!;
    expect(created.trackIds.map((id) => `spotify:track:${id}`)).toEqual(uris);
    expect(created.description).toBe('Hecha por la oficina');
    expect(fake.state.played).toEqual([`spotify:playlist:${created.id}`]);

    await send({ action: 'keep', id: created.id });
    expect(owner.last()!.lists[0].kept).toBe(true);

    // Persisted: a new office reads the same state.
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
    expect(saved.lists[0]).toMatchObject({ id: created.id, kept: true });
    expect(saved.lists[0].uris).toEqual(uris);
    expect(saved.rejected[0].uri).toBe(gone.uri);

    await send({ action: 'delete', id: created.id });
    st = owner.last()!;
    expect(st.lists).toHaveLength(0);
    expect(fake.library.has(created.id)).toBe(false);
    // Kept in the file for "don't repeat what's recent".
    const after = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
    expect(after.lists[0].removedAt).toBeTruthy();

    // A new preview avoids what went into this week's list.
    await send({ action: 'preview', recipe: recipe() });
    const again = owner.last()!.preview!.songs.map((s) => s.uri);
    expect(again.some((u) => uris.includes(u))).toBe(false);
  });

  it('never deletes a list it did not create (no call to Spotify)', async () => {
    const { fake, owner, send } = setup();
    await send({ action: 'delete', id: 'lista80s' });
    expect(owner.last()!.error).toMatch(/no la hizo la oficina/);
    expect(fake.callsTo(/library/)).toHaveLength(0);
    expect(fake.library.has('lista80s')).toBe(true);
  });

  it('asks to reconnect with an old session and calls nothing', async () => {
    const old =
      'user-read-currently-playing user-read-playback-state user-modify-playback-state user-top-read';
    const { fake, music, owner, send } = setup({ scopes: 'old', savedScopes: old });
    await send({ action: 'open' });
    await send({ action: 'preview', recipe: recipe() });
    const st = owner.last()!;
    expect(st.needsReconnect).toBe(true);
    expect(st.error).toBeUndefined();
    expect(fake.state.calls).toHaveLength(0);
    const web = music.connections!().find((c) => c.id === 'spotify-web-api')!;
    expect(web.state).toBe('warn');
    expect(web.detail).toBe('Falta el permiso de playlists: vuelve a conectar Spotify');
  });

  it('turns a missing-scope answer into needsReconnect when the scopes were unknown', async () => {
    const { owner, send } = setup({ scopes: 'old' });
    await send({ action: 'open' });
    expect(owner.last()!.needsReconnect).toBe(true);
    expect(owner.last()!.error).toBeUndefined();
  });

  it('keeps the preview when discovering hits the rate limit', async () => {
    const { fake, owner, send } = setup();
    fake.fault({ match: /^\/artists\/[^/]+\/albums$/, status: 429, retryAfter: 9000, times: 10 });
    await send({ action: 'preview', recipe: recipe({ discover: true, minutes: 30 }) });
    const st = owner.last()!;
    expect(st.error).toBeUndefined();
    expect(st.preview!.songs.length).toBeGreaterThan(0);
    expect(st.preview!.songs.every((s) => !s.discover)).toBe(true);
    expect(st.note).toBe('Spotify no dejó buscar cosas nuevas ahora; va solo con lo tuyo');
  });

  it('adds songs to discover when Spotify lets it', async () => {
    const { owner, send } = setup();
    await send({ action: 'preview', recipe: recipe({ discover: true, minutes: 60 }) });
    const st = owner.last()!;
    expect(st.preview!.songs.some((s) => s.discover)).toBe(true);
  });

  it('builds from chosen artists and lists, and explains a failed play', async () => {
    const { fake, owner, send } = setup();
    fake.state.activeDevice = false;
    await send({ action: 'open' });
    const artist = { id: fake.artists[3].id, name: fake.artists[3].name };
    await send({
      action: 'preview',
      recipe: recipe({
        top: false,
        liked: false,
        artists: [artist],
        playlists: ['lista70s', 'listaAjena1'],
        minutes: 30,
      }),
    });
    expect(owner.last()!.preview!.songs.length).toBeGreaterThan(0);
    expect(fake.callsTo(/listaAjena1/)).toHaveLength(0);
    await send({ action: 'create' }); // autoPlay on by default
    const st = owner.last()!;
    expect(st.error).toBeUndefined();
    expect(st.lists).toHaveLength(1);
    expect(st.note).toBe('Lista creada. No se pudo poner a sonar: abre Spotify en algún aparato');
  });

  it('removes a half-created list and reports the error', async () => {
    const { fake, owner, send } = setup();
    await send({ action: 'preview', recipe: recipe() });
    fake.fault({
      match: /^\/playlists\/[^/]+\/items$/,
      method: 'POST',
      status: 400,
      message: 'Bad uris',
    });
    await send({ action: 'create', play: false });
    const st = owner.last()!;
    expect(st.error).toBeTruthy();
    expect(st.lists).toHaveLength(0);
    expect(fake.state.removed).toEqual([fake.state.created[0].id]);
  });

  it('saves, replaces and deletes recipes, and the autoplay switch', async () => {
    const { owner, send } = setup();
    await send({ action: 'saveRecipe', recipe: recipe({ name: 'Mía' }) });
    let st = owner.last()!;
    const mine = st.recipes.find((r) => r.name === 'Mía')!;
    expect(mine.id).not.toBe('');
    await send({ action: 'saveRecipe', recipe: { ...mine, name: 'Mía 2' } });
    st = owner.last()!;
    expect(st.recipes.filter((r) => r.id === mine.id).map((r) => r.name)).toEqual(['Mía 2']);
    await send({ action: 'deleteRecipe', id: mine.id });
    expect(owner.last()!.recipes.some((r) => r.id === mine.id)).toBe(false);
    await send({ action: 'saveRecipe', recipe: { name: 'Vacía' } });
    expect(owner.last()!.error).toMatch(/fuente/);
    await send({ action: 'setAutoPlay', play: false });
    expect(owner.last()!.autoPlay).toBe(false);
    expect(JSON.parse(fs.readFileSync(dataFile(), 'utf-8')).autoPlay).toBe(false);
  });

  it('keeps the preview and the saved permissions when Spotify rotates the refresh token', async () => {
    const { fake, owner, send } = setup({ rotateRefresh: true });
    await send({ action: 'preview', recipe: recipe() });
    await send({ action: 'create', play: false });
    const created = owner.last()!.lists[0];
    await send({ action: 'preview', recipe: recipe({ name: 'Otra' }) });
    expect(owner.last()!.preview?.recipeName).toBe('Otra');
    // The access token dies; the next call refreshes it and gets a new refresh token with it.
    fake.expireToken();
    await send({ action: 'delete', id: created.id });
    const config = readMusicConfig();
    expect(config.spotifyRefreshToken).not.toBe('refresco-de-prueba');
    expect(config.spotifyScopes).toContain('playlist-modify-private');
    const st = owner.last()!;
    expect(st.error).toBeUndefined();
    expect(st.lists).toHaveLength(0);
    expect(st.preview?.recipeName).toBe('Otra');
    expect(st.needsReconnect).toBe(false);
  });

  it('sends nothing to guests and ignores their commands', async () => {
    const { fake, music, guest, owner, send } = setup();
    music.handleClientMessage!({ type: 'webviewReady' }, guest.c);
    music.handleClientMessage!({ type: 'webviewReady' }, owner.c);
    expect(owner.last()).toBeDefined();
    await send({ action: 'preview', recipe: recipe() }, guest);
    await send({ action: 'delete', id: 'lista80s' }, guest);
    expect(guest.sent.some((m) => m.type === 'playlistStatus')).toBe(false);
    expect(fake.state.calls).toHaveLength(0);
    await send({ action: 'open' });
    expect(guest.sent.some((m) => m.type === 'playlistStatus')).toBe(false);
  });
});
