import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { emptyGame } from '../../core/game.js';
import { createColeccionFeature } from '../../server/coleccionFeature.js';
import { FILE_MAX_BYTES } from '../../server/constants.js';

const homes: string[] = [];

/** A repeatable random source (a plain LCG), so ids are the same on every run. */
function seeded(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

function setup(random: () => number = seeded()) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-home-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  let t = Date.parse('2026-11-13T20:15:00.000Z');
  const feature = createColeccionFeature({
    home,
    now: () => (t += 1000),
    random,
  });
  const client = (privileged = true) => {
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged, send: (m) => sent.push(m) };
    feature.connect?.(c);
    return { c, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
  };
  const file = path.join(pixel, 'coleccion.json');
  const onDisk = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const msg = (m: Record<string, unknown>, c: FeatureClient) => feature.handleClientMessage?.(m, c);
  return { home, pixel, file, onDisk, feature, client, msg };
}

afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

const newGame = (title: string, platform: string, extra: Record<string, unknown> = {}) => ({
  ...emptyGame('', platform),
  title,
  ...extra,
});

describe('coleccion feature: messages', () => {
  it('starts empty, without creating the file', () => {
    const { client, msg, file } = setup();
    const a = client();
    expect(msg({ type: 'webviewReady' }, a.c)).toBe(false);
    expect(a.last('coleccionStatus')).toMatchObject({ games: [], problems: [] });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('only privileged clients get the status or can change anything', () => {
    const { client, msg, file } = setup();
    const anon = client(false);
    expect(msg({ type: 'webviewReady' }, anon.c)).toBe(false);
    expect(msg({ type: 'coleccionSave', requestId: 'r1', game: newGame('X', 'nes') }, anon.c)).toBe(
      true,
    );
    expect(msg({ type: 'coleccionOpen' }, anon.c)).toBe(true);
    expect(anon.sent).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('saves, edits and deletes; every client hears the change', () => {
    const { client, msg, onDisk, file } = setup();
    const a = client();
    const b = client();
    expect(
      msg(
        {
          type: 'coleccionSave',
          requestId: 'r1',
          game: newGame('Neón Rally', 'gc', { region: 'pal' }),
        },
        a.c,
      ),
    ).toBe(true);
    const res = a.last('coleccionResult') as { ok: boolean; id: string; requestId: string };
    expect(res).toMatchObject({ ok: true, requestId: 'r1' });
    expect((b.last('coleccionStatus') as { games: unknown[] }).games).toHaveLength(1);
    const disk = onDisk();
    expect(disk.version).toBe(1);
    expect(disk.games[0]).toMatchObject({
      id: res.id,
      title: 'Neón Rally',
      platform: 'gc',
      region: 'pal',
      addedAt: '2026-11-13',
    });

    // Edit: same id, the file keeps fields it doesn't know
    disk.games[0].futuro = 'sí';
    disk.extra = 1;
    fs.writeFileSync(file, JSON.stringify(disk));
    msg(
      { type: 'coleccionSave', requestId: 'r2', game: { ...disk.games[0], progress: 'a-medias' } },
      a.c,
    );
    expect(a.last('coleccionResult')).toMatchObject({ ok: true, id: res.id, requestId: 'r2' });
    const after = onDisk();
    expect(after.games).toHaveLength(1);
    expect(after.games[0]).toMatchObject({ progress: 'a-medias', futuro: 'sí' });
    expect(after.extra).toBe(1);

    // Delete: gone from the list, kept in the trash
    msg({ type: 'coleccionDelete', requestId: 'r3', id: res.id }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: true, requestId: 'r3' });
    expect(onDisk().games).toHaveLength(0);
    expect(onDisk().trash[0]).toMatchObject({ id: res.id, title: 'Neón Rally' });
    msg({ type: 'coleccionDelete', requestId: 'r4', id: res.id }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: false, requestId: 'r4' });
  });

  it('a "se busca" gap becomes a game when it is bought', () => {
    const { client, msg, onDisk, file } = setup();
    const a = client();
    // Written down months ago
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        games: [
          {
            id: 'hueco01',
            title: 'Capitán Cohete 3',
            platform: 'n64',
            wanted: true,
            price: '$620 MXN',
            seenAt: 'un tianguis',
            addedAt: '2026-05-01',
          },
        ],
      }),
    );
    msg({ type: 'coleccionOpen' }, a.c);
    const gap = (a.last('coleccionStatus') as { games: Record<string, unknown>[] }).games[0];
    expect(gap).toMatchObject({ wanted: true, price: '$620 MXN' });
    msg(
      {
        type: 'coleccionSave',
        requestId: 'r1',
        game: { ...gap, wanted: false, condition: 'suelto' },
      },
      a.c,
    );
    expect(onDisk().games[0]).toMatchObject({
      id: 'hueco01',
      wanted: false,
      condition: 'suelto',
      addedAt: '2026-11-13',
    });
  });

  it('refuses a request without id and a save that is not a game', () => {
    const { client, msg } = setup();
    const a = client();
    msg({ type: 'coleccionSave', game: newGame('X', 'nes') }, a.c);
    expect(a.last('coleccionResult')).toBeUndefined();
    msg({ type: 'coleccionSave', requestId: 'r1', game: 'nada' }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: false });
  });
});

describe('coleccion feature: the file', () => {
  it('a damaged file is reported, kept aside on the first save, and replaced', () => {
    const { client, msg, file, pixel, onDisk } = setup();
    fs.writeFileSync(file, '{ "games": [ roto');
    const a = client();
    msg({ type: 'coleccionOpen' }, a.c);
    const st = a.last('coleccionStatus') as { games: unknown[]; problems: string[] };
    expect(st.games).toEqual([]);
    expect(st.problems[0]).toContain('no se pudo leer');
    msg({ type: 'coleccionSave', requestId: 'r1', game: newGame('Nuevo', 'wii') }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: true });
    const aside = fs.readdirSync(pixel).filter((f) => f.startsWith('coleccion.danado-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(pixel, aside[0]), 'utf8')).toBe('{ "games": [ roto');
    expect(onDisk().games).toHaveLength(1);
    expect((a.last('coleccionStatus') as { problems: string[] }).problems).toEqual([]);
  });

  it('a file over the cap is not read and never written over', () => {
    const { client, msg, file } = setup();
    fs.writeFileSync(file, Buffer.alloc(FILE_MAX_BYTES + 10, 32));
    const a = client();
    msg({ type: 'coleccionOpen' }, a.c);
    expect((a.last('coleccionStatus') as { problems: string[] }).problems[0]).toContain('MB');
    msg({ type: 'coleccionSave', requestId: 'r1', game: newGame('X', 'nes') }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: false });
    expect(fs.statSync(file).size).toBe(FILE_MAX_BYTES + 10);
  });

  it('picks up changes made from outside before writing', () => {
    const { client, msg, file, onDisk } = setup();
    const a = client();
    msg({ type: 'coleccionSave', requestId: 'r1', game: newGame('Uno', 'nes') }, a.c);
    const disk = onDisk();
    disk.games.push({ id: 'amano01', title: 'A mano', platform: 'snes' });
    fs.writeFileSync(file, JSON.stringify(disk));
    // A different size: the store notices even within the same millisecond
    msg({ type: 'coleccionSave', requestId: 'r2', game: newGame('Dos', 'nes') }, a.c);
    expect(
      onDisk()
        .games.map((g: { title: string }) => g.title)
        .sort(),
    ).toEqual(['A mano', 'Dos', 'Uno']);
  });

  it('a random source that only repeats ids fails the save instead of hanging', () => {
    const { client, msg, onDisk } = setup(() => 0);
    const a = client();
    msg({ type: 'coleccionSave', requestId: 'r1', game: newGame('Uno', 'nes') }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: true });
    msg({ type: 'coleccionSave', requestId: 'r2', game: newGame('Dos', 'nes') }, a.c);
    expect(a.last('coleccionResult')).toMatchObject({ ok: false, requestId: 'r2' });
    expect(onDisk().games).toHaveLength(1);
  });

  it('writes atomically: no temp file left behind', () => {
    const { client, msg, pixel } = setup();
    const a = client();
    for (let i = 0; i < 40; i++)
      msg(
        {
          type: 'coleccionSave',
          requestId: `r${i}`,
          game: newGame(`Juego ${i}`, i % 2 ? 'gc' : 'x360'),
        },
        a.c,
      );
    expect(fs.readdirSync(pixel).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect((a.last('coleccionStatus') as { games: unknown[] }).games).toHaveLength(40);
  });
});
