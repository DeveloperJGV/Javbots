import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PlaylistStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { PLAYLIST_SCORE, PLAYLIST_SEARCH_MAX_CALLS } from '../../server/constants.js';
import { CoverCache } from '../../server/cover.js';
import { readMusicConfig, writeMusicConfig } from '../../server/musicConfig.js';
import { createMusicFeature } from '../../server/musicFeature.js';
import {
  originText,
  parseDescription,
  requestTitle,
  searchQuery,
} from '../../server/playlists/describe.js';
import { gatherDescribed } from '../../server/playlists/describeSearch.js';
import { createSpotifyPlaylists } from '../../server/playlists/spotifyPlaylists.js';
import type { SpicetifyRunner } from '../../server/spicetify.js';
import { createSpotifyApi } from '../../server/spotifyApi.js';
import { createFakeSpotify, FAKE_OWNER_ID } from '../dobles/fakeSpotify.js';

const TEMPLATE = path.join(__dirname, '..', '..', 'spicetify', 'javbots-musica.js');
const dataFile = () => path.join(os.homedir(), '.pixel-agents', 'playlists.json');

const noSpicetify: SpicetifyRunner = async () => {
  throw new Error('spicetify: not found');
};

function seeded(seed = 5) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function setup(opts: { publicReadable?: boolean } = {}) {
  const fake = createFakeSpotify({ publicReadable: opts.publicReadable });
  const config = readMusicConfig();
  writeMusicConfig({
    token: config.token,
    spotifyClientId: 'cliente-de-prueba',
    spotifyRefreshToken: 'refresco-de-prueba',
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
  const sent: Record<string, unknown>[] = [];
  const owner: FeatureClient = { send: (m) => sent.push(m), privileged: true };
  music.connect!(owner);
  const last = () =>
    [...sent].reverse().find((m) => m.type === 'playlistStatus') as unknown as PlaylistStatus;
  const send = async (cmd: Record<string, unknown>) => {
    music.handleClientMessage!({ type: 'playlistCommand', ...cmd }, owner);
    await music.playlists.settle();
  };
  /** Builds from a description and creates it; returns the new list's id. */
  const createFrom = async (text: string, minutes = 60) => {
    await send({ action: 'describe', text, minutes });
    await send({ action: 'create', play: false });
    return last().lists[0].id;
  };
  return { fake, last, send, createFrom };
}

const yearOfAlbum = (album: string | undefined) => Number(/(\d{4})$/.exec(album ?? '')?.[1]);

beforeEach(() => {
  fs.rmSync(dataFile(), { force: true });
});

describe('reading a description by rules', () => {
  it('understands lengths and snaps them to 30 min / 1 h / 2 h', () => {
    expect(parseDescription('algo tranquilo para media hora').minutes).toBe(30);
    expect(parseDescription('rock para 2 horas').minutes).toBe(120);
    expect(parseDescription('dos horas de jazz').minutes).toBe(120);
    expect(parseDescription('una hora y media de cumbia').minutes).toBe(120);
    expect(parseDescription('una hora de pop').minutes).toBe(60);
    expect(parseDescription('45 minutos').minutes).toBe(60);
    expect(parseDescription('20 min de rock').minutes).toBe(30);
    expect(parseDescription('rock de los 80').minutes).toBeUndefined();
  });

  it('understands decades and years', () => {
    expect(parseDescription('rock de los 80').years).toEqual([[1980, 1989]]);
    expect(parseDescription('baladas noventas').years).toEqual([[1990, 1999]]);
    expect(parseDescription("pop 90's").years).toEqual([[1990, 1999]]);
    expect(parseDescription('éxitos del 2005').years).toEqual([[2005, 2005]]);
    expect(parseDescription('del 1990 al 1995').years).toEqual([[1990, 1995]]);
    expect(parseDescription('los 2000s').years).toEqual([[2000, 2009]]);
    expect(parseDescription('treinta minutos de los 70').years).toEqual([[1970, 1979]]);
    expect(parseDescription('treinta minutos de los 70').minutes).toBe(30);
  });

  it('understands whose music and the genre, without case or accents', () => {
    const d = parseDescription('ROCK En ESPAÑOL de los 90 para manejar de noche');
    expect(d.genres).toEqual(['rock en espanol']);
    expect(d.keywords).toEqual(['manejar', 'noche']);
    expect(d.onlyMine).toBe(false);
    expect(searchQuery(d)).toBe('manejar noche genre:"rock en espanol" year:1990-1999');

    const mine = parseDescription('solo lo mío, de mis me gusta');
    expect(mine.onlyMine).toBe(true);
    expect(mine.liked).toBe(true);
    expect(parseDescription('algo nuevo para descubrir').discover).toBe(true);
    expect(parseDescription('algo nuevo para descubrir').onlyMine).toBe(false);
  });

  it('names the list after the first words and says where songs came from', () => {
    expect(requestTitle('rock en español de los 90 para manejar de noche')).toBe(
      'rock en español de los 90',
    );
    expect(requestTitle('algo de jazz para la noche')).toBe('algo de jazz para la noche');
    expect(requestTitle('jazz, de')).toBe('jazz');
    expect(originText({ publicLists: 6, ownLists: 0, searched: 0, artists: [], mine: 9 })).toBe(
      'De 6 listas públicas parecidas y 9 canciones tuyas',
    );
    expect(originText({ publicLists: 0, ownLists: 1, searched: 1, artists: ['X'], mine: 0 })).toBe(
      'De 1 lista tuya, discos de X y 1 canción que casa con lo que pediste',
    );
  });
});

describe('Dime qué quieres', () => {
  it('builds from a description: genre, decade and length respected, says where it came from', async () => {
    const { fake, last, send } = setup();
    await send({
      action: 'describe',
      text: 'rock en español de los 90 para manejar de noche',
      minutes: 30,
    });
    const st = last();
    expect(st.error).toBeUndefined();
    const p = st.preview!;
    expect(p.songs.length).toBeGreaterThan(3);
    expect(p.request).toBe('rock en español de los 90 para manejar de noche');
    expect(p.origin).toMatch(/^De /);
    expect(p.totalMs).toBeLessThanOrEqual(33 * 60_000);
    for (const s of p.songs) {
      expect(s.year! >= 1990 && s.year! <= 1999).toBe(true);
    }
    // Spotify (2026) doesn't let read other people's lists: tried once, then a note, never again.
    expect(fake.callsTo(/^\/playlists\/publica/)).toHaveLength(1);
    expect(st.note).toMatch(/no deja leer listas de otras personas/);
    // Calls stay capped (own pools are separate and cached).
    expect(
      fake.callsTo(/^\/(search|artists|albums|playlists\/publica)/).length,
    ).toBeLessThanOrEqual(PLAYLIST_SEARCH_MAX_CALLS);
    // Search pages respect the 10-per-page limit.
    for (const c of fake.callsTo(/^\/search$/))
      expect(Number(c.query.limit)).toBeLessThanOrEqual(10);

    const publicCalls = fake.callsTo(/^\/playlists\/publica/).length;
    await send({ action: 'describe', text: 'rock para manejar', minutes: 30 });
    expect(fake.callsTo(/^\/playlists\/publica/)).toHaveLength(publicCalls);
  });

  it('counts songs repeated across similar public lists when Spotify lets read them', async () => {
    const { fake, last, send } = setup({ publicReadable: true });
    await send({ action: 'describe', text: 'rock para manejar', minutes: 60 });
    const p = last().preview!;
    expect(fake.callsTo(/^\/playlists\/publica/).length).toBeGreaterThanOrEqual(2);
    expect(p.origin).toMatch(/listas? públicas? parecidas?/);
  });

  it('a song in two similar public lists scores for both', async () => {
    const fake = createFakeSpotify({ publicReadable: true });
    const spotify = createSpotifyApi({
      clientId: 'cliente-de-prueba',
      redirectUri: () => 'http://127.0.0.1:1/callback',
      refreshToken: 'refresco-de-prueba',
      onRefreshToken: () => undefined,
      fetcher: fake.fetcher,
      sleep: async () => undefined,
    });
    const api = createSpotifyPlaylists(spotify.request);
    const material = await gatherDescribed(
      {
        api,
        rng: seeded(),
        cached: (_key, load) => load(),
        peek: () => undefined,
        sources: async () => ({ playlists: [], artists: [] }),
        albumsOf: (id) => api.artistAlbums(id),
        albumSongs: (album) => api.albumSongs(album),
        publicLocked: () => false,
        lockPublic: () => undefined,
      },
      parseDescription('rock para manejar'),
    );
    const a = new Set(fake.publicLists[0].trackIds);
    const both = fake.publicLists[2].trackIds.filter((id) => a.has(id));
    expect(both.length).toBeGreaterThan(0);
    const score = (id: string) =>
      material.scored.find((x) => x.song.uri === `spotify:track:${id}`)?.score ?? 0;
    expect(score(both[0])).toBeGreaterThanOrEqual(2 * PLAYLIST_SCORE.publicList);
    const tags = material.tags.get(`spotify:track:${both[0]}`)!;
    expect(tags.has('pub:publica01') && tags.has('pub:publica03')).toBe(true);
  });

  it('takes albums of an artist named in the text', async () => {
    const { fake, last, send } = setup();
    await send({ action: 'describe', text: 'algo de cometa lenta', minutes: 30 });
    const p = last().preview!;
    expect(fake.callsTo(/^\/artists\/artista000004\/albums$/)).toHaveLength(1);
    expect(p.songs.filter((s) => s.artist === 'Cometa Lenta').length).toBeGreaterThan(
      p.songs.length / 2,
    );
    expect(p.origin).toMatch(/discos de Cometa Lenta/);
  });

  it('"solo lo mío" uses only the owner\'s songs and the decade', async () => {
    const { fake, last, send } = setup();
    await send({ action: 'describe', text: 'solo lo mío de los 80', minutes: 30 });
    const p = last().preview!;
    expect(p.songs.length).toBeGreaterThan(0);
    expect(fake.callsTo(/^\/search$/)).toHaveLength(0);
    const ownUris = new Set(
      fake.tracks
        .filter((_, i) => i % 2 === 0 || i % 3 === 0 || i % 4 === 1 || i % 5 === 2)
        .map((t) => t.uri),
    );
    for (const s of p.songs) {
      expect(ownUris.has(s.uri)).toBe(true);
      expect(yearOfAlbum(s.album)).toBeGreaterThanOrEqual(1980);
      expect(yearOfAlbum(s.album)).toBeLessThanOrEqual(1989);
      expect(s.discover).toBeFalsy();
    }
  });

  it('never brings back a song from the bin', async () => {
    const { last, send } = setup();
    await send({ action: 'describe', text: 'rock de los 90', minutes: 30 });
    const gone = last().preview!.songs[0];
    await send({ action: 'reject', uri: gone.uri });
    expect(last().preview!.songs.some((s) => s.uri === gone.uri)).toBe(false);
    for (let i = 0; i < 4; i++) {
      await send({ action: 'reroll' });
      expect(last().preview!.songs.some((s) => s.uri === gone.uri)).toBe(false);
    }
    await send({ action: 'describe', text: 'rock de los 90', minutes: 120 });
    expect(last().preview!.songs.some((s) => s.uri === gone.uri)).toBe(false);
  });

  it('says so when it finds nothing, and proposes taking words out', async () => {
    const { last, send } = setup();
    await send({ action: 'describe', text: 'zapateado xilofónico submarino', minutes: 60 });
    const st = last();
    expect(st.preview).toBeUndefined();
    expect(st.error).toBeUndefined();
    expect(st.note).toMatch(
      /^No encontré nada con «zapateado xilofónico submarino»\. Prueba quitando palabras/,
    );
  });

  it('keeps what it found when Spotify asks to wait mid-search', async () => {
    const { fake, last, send } = setup();
    fake.fault({ match: /^\/search$/, status: 429, retryAfter: 600, times: 20 });
    await send({ action: 'describe', text: 'rock de mis listas', minutes: 30 });
    const st = last();
    expect(st.error).toBeUndefined();
    expect(st.preview!.songs.length).toBeGreaterThan(0);
  });

  it('creates it with the text in the name and the description, and remembers what was asked', async () => {
    const { fake, last, createFrom } = setup();
    const id = await createFrom('rock en español de los 90 para manejar de noche', 30);
    const st = last();
    expect(st.lists[0].name).toMatch(/^Hoy suena · \d+ \w+ · rock en español de los 90$/);
    expect(st.lists[0].madeWith).toBe('«rock en español de los 90 para manejar de noche»');
    const created = fake.playlistById(id)!;
    expect(created.public).toBe(false);
    expect(created.description).toBe(
      'rock en español de los 90 para manejar de noche · Hecha por la oficina',
    );
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
    expect(saved.lists[0].request).toMatchObject({
      text: 'rock en español de los 90 para manejar de noche',
      minutes: 30,
    });
  });
});

describe('Mis listas', () => {
  it('modifies a list: rename, take one out, add one found by search; Spotify gets it', async () => {
    const { fake, last, send, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    await send({ action: 'openList', id });
    const editing = last().editing!;
    expect(editing.id).toBe(id);
    expect(editing.songs.length).toBe(last().lists[0].count);

    await send({ action: 'searchSongs', text: 'cometa lenta' });
    const found = last().found!;
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(10);

    const out = editing.songs[0].uri;
    const extra = found.find((s) => !editing.songs.some((e) => e.uri === s.uri))!;
    const uris = [...editing.songs.slice(1).map((s) => s.uri), extra.uri];
    await send({ action: 'saveList', id, name: 'Para el camino', uris });
    const st = last();
    expect(st.error).toBeUndefined();
    const list = fake.playlistById(id)!;
    expect(list.name).toBe('Para el camino');
    expect(list.trackIds).not.toContain(out.replace('spotify:track:', ''));
    expect(list.trackIds).toContain(extra.uri.replace('spotify:track:', ''));
    expect(st.lists[0]).toMatchObject({ name: 'Para el camino', count: uris.length });
    expect(st.editing!.songs.map((s) => s.uri)).toEqual(uris);
  });

  it('ignores songs that were neither in the list nor found', async () => {
    const { fake, send, last, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    await send({ action: 'openList', id });
    const before = [...fake.playlistById(id)!.trackIds];
    const uris = [...last().editing!.songs.map((s) => s.uri), 'spotify:track:inventada'];
    await send({ action: 'saveList', id, name: last().editing!.name, uris });
    expect(fake.playlistById(id)!.trackIds).toEqual(before);
    expect(fake.callsTo(/^\/playlists\/[^/]+\/items$/, 'POST')).toHaveLength(1); // only the create
  });

  it('marks a list Spotify no longer has and lets it be taken off without errors', async () => {
    const { fake, last, send, createFrom } = setup();
    const gone = await createFrom('rock de los 90', 30);
    const removedThere = await createFrom('pop de los 2000', 30);
    fake.destroy(gone);
    fake.library.delete(removedThere);

    await send({ action: 'checkLists' });
    let st = last();
    expect(st.error).toBeUndefined();
    expect(st.lists.find((l) => l.id === gone)!.missing).toBe(true);
    expect(st.lists.find((l) => l.id === removedThere)!.missing).toBe(true);

    await send({ action: 'forget', id: gone });
    st = last();
    expect(st.error).toBeUndefined();
    expect(st.lists.some((l) => l.id === gone)).toBe(false);
    expect(fake.state.removed).not.toContain(gone);
  });

  it('opening a list that no longer exists marks it instead of failing hard', async () => {
    const { fake, last, send, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    fake.destroy(id);
    await send({ action: 'openList', id });
    const st = last();
    expect(st.editing).toBeUndefined();
    expect(st.lists[0].missing).toBe(true);
  });

  it('improves: shows what it takes out and adds, and changes nothing until confirmed', async () => {
    const { fake, last, send, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    const before = [...fake.playlistById(id)!.trackIds];

    await send({ action: 'improve', id, mode: 'more' });
    let p = last().proposal!;
    expect(p.label).toBe('Más canciones (+30 min)');
    expect(p.remove).toHaveLength(0);
    expect(p.add.length).toBeGreaterThan(0);
    expect(p.add.every((s) => !before.includes(s.uri.replace('spotify:track:', '')))).toBe(true);
    expect(fake.playlistById(id)!.trackIds).toEqual(before);

    await send({ action: 'dropImprove' });
    expect(last().proposal).toBeUndefined();
    expect(fake.playlistById(id)!.trackIds).toEqual(before);

    // The bin: songs of the list sent to it are swapped.
    const binned = `spotify:track:${before[0]}`;
    // Same idea without "avoid recent": the material holds the list's songs, so one can go to the bin.
    await send({ action: 'describe', text: 'rock de los 90', minutes: 30, avoidRecent: false });
    await send({ action: 'reject', uri: binned });
    await send({ action: 'cancel' });
    expect(last().rejected.some((r) => r.uri === binned)).toBe(true);
    await send({ action: 'improve', id, mode: 'bin' });
    p = last().proposal!;
    expect(p.remove.map((s) => s.uri)).toEqual([binned]);
    await send({ action: 'applyImprove', id });
    const after = fake.playlistById(id)!.trackIds;
    expect(after).not.toContain(before[0]);
    expect(last().proposal).toBeUndefined();
  });

  it('applies "otra tirada" and a typed wish after confirming', async () => {
    const { fake, last, send, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    const before = [...fake.playlistById(id)!.trackIds];

    await send({ action: 'improve', id, mode: 'text', text: 'mejor de los 80' });
    const p = last().proposal!;
    expect(p.label).toBe('«mejor de los 80»');
    expect(p.remove.length + p.add.length).toBeGreaterThan(0);
    expect(fake.playlistById(id)!.trackIds).toEqual(before);

    await send({ action: 'applyImprove', id });
    const st = last();
    expect(st.error).toBeUndefined();
    const after = fake.playlistById(id)!.trackIds;
    for (const s of p.add) expect(after).toContain(s.uri.replace('spotify:track:', ''));
    for (const s of p.remove) expect(after).not.toContain(s.uri.replace('spotify:track:', ''));
    expect(st.lists[0].count).toBe(after.length);
    expect(st.lists[0].madeWith).toBe('«rock de los 90 mejor de los 80»');
    expect(fake.playlistById(id)!.description).toMatch(/^rock de los 90 mejor de los 80/);

    await send({ action: 'improve', id, mode: 'reroll' });
    expect(last().proposal!.label).toBe('Otra tirada con la misma idea');
    await send({ action: 'improve', id, mode: 'discover' });
    const d = last().proposal!;
    expect(d.label).toBe('Más para descubrir');
    expect(d.add.every((s) => s.discover)).toBe(true);
  });

  it('only touches lists the office created', async () => {
    const { fake, last, send } = setup();
    const before = fake.state.calls.length;
    for (const action of ['openList', 'improve', 'saveList', 'forget', 'play', 'applyImprove'])
      await send({ action, id: 'lista80s', mode: 'more', uris: [], name: 'x' });
    expect(fake.state.calls.length).toBe(before);
    expect(fake.playlistById('lista80s')!.ownerId).toBe(FAKE_OWNER_ID);
    expect(last()?.editing).toBeUndefined();
    expect(last()?.proposal).toBeUndefined();
  });

  it('plays a list it created', async () => {
    const { fake, send, createFrom } = setup();
    const id = await createFrom('rock de los 90', 30);
    await send({ action: 'play', id });
    expect(fake.state.played).toEqual([`spotify:playlist:${id}`]);
  });
});
