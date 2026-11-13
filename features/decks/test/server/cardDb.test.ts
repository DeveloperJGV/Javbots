import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCardDb, createLimiter } from '../../server/cardDb.js';
import { fakeYgo } from './fixtures.js';

const DAY = 24 * 60 * 60 * 1000;
const dirs: string[] = [];

function setup(opts: { version?: string; failCardinfo?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-cache-'));
  dirs.push(dir);
  let clock = Date.parse('2026-11-13T12:00:00Z');
  const ygo = fakeYgo(opts);
  const make = () =>
    createCardDb({
      dir,
      fetch: ygo.fetcher,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
  return { dir, ygo, make, tick: (ms: number) => (clock += ms), now: () => clock };
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('decks card database', () => {
  it('downloads the whole base once, trims it and keeps it in cards.json', async () => {
    const { dir, ygo, make } = setup();
    const db = make();
    expect(db.state().state).toBe('missing');
    const changes: string[] = [];
    db.onChange(() => changes.push(db.state().state));
    const pending = db.ensure();
    await Promise.resolve();
    await Promise.resolve();
    expect(changes[0]).toBe('loading');
    await Promise.all([pending, db.ensure()]);
    expect(changes.at(-1)).toBe('ready');
    expect(db.state()).toMatchObject({ state: 'ready', count: 7 });
    expect(ygo.requests.filter((u) => u.includes('cardinfo.php'))).toHaveLength(1);
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'));
    expect(file).toMatchObject({ version: 1, dbVersion: '1.00' });
    expect(JSON.stringify(file)).not.toContain('card_prices');
    expect(JSON.stringify(file)).not.toContain('image_url');

    const heard = changes.length;
    await db.ensure();
    expect(ygo.requests).toHaveLength(2);
    expect(changes).toHaveLength(heard); // nothing changed: nobody is told
    // Another start reads the file with no network at all
    const again = make();
    expect(again.loadLocal()).toBe(true);
    await again.ensure();
    expect(ygo.requests).toHaveLength(2);
    expect(again.index().search('dark')[0].name).toBe('Dark Magician');
  });

  it('after 7 days asks checkDBVer and downloads again only when the version changed', async () => {
    const { ygo, make, tick } = setup();
    const db = make();
    await db.ensure();
    tick(6 * DAY);
    await db.ensure();
    expect(ygo.requests).toHaveLength(2); // inside the 7 days: no request at all
    tick(2 * DAY);
    await db.ensure();
    expect(ygo.requests.filter((u) => u.includes('cardinfo.php'))).toHaveLength(1); // same version
    ygo.setVersion('2.00');
    tick(8 * DAY);
    await db.ensure();
    expect(ygo.requests.filter((u) => u.includes('checkDBVer.php'))).toHaveLength(3);
    expect(ygo.requests.filter((u) => u.includes('cardinfo.php'))).toHaveLength(2);
    expect(db.state().state).toBe('ready');
  });

  it('reports a failed download and does not retry it right away', async () => {
    const { ygo, make, tick } = setup({ failCardinfo: true });
    const db = make();
    await db.ensure();
    expect(db.state()).toMatchObject({ state: 'error' });
    expect(db.state().detail).toContain('503');
    await db.ensure();
    expect(ygo.requests).toHaveLength(2);
    ygo.setFailCardinfo(false);
    tick(11 * 60 * 1000);
    await db.ensure();
    expect(db.state().state).toBe('ready');
  });

  it('downloads each image once, only for cards of the base', async () => {
    const { dir, ygo, make } = setup();
    const db = make();
    expect(await db.image(89631139, 'small')).toBeNull(); // no base yet: nothing asked
    expect(ygo.requests).toHaveLength(0);
    await db.ensure();
    const [a, b] = await Promise.all([db.image(89631139, 'small'), db.image(89631139, 'small')]);
    expect(a).toBe(path.join(dir, 'img', '89631139_small.jpg'));
    expect(b).toBe(a);
    expect(await db.image(89631139, 'small')).toBe(a);
    expect(await db.image(36996508, 'full')).toBe(path.join(dir, 'img', '36996508.jpg'));
    expect(await db.image(12345678, 'full')).toBeNull();
    const images = ygo.requests.filter((u) => u.includes('images.ygoprodeck.com'));
    expect(images).toEqual([
      'https://images.ygoprodeck.com/images/cards_small/89631139.jpg',
      'https://images.ygoprodeck.com/images/cards/36996508.jpg',
    ]);
  });
});

describe('decks request limiter', () => {
  it('runs at most 2 at once and at most 10 starts per second', async () => {
    let clock = 0;
    const run = createLimiter({
      max: 2,
      perSecond: 10,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      starts.push(clock);
      await new Promise((r) => setTimeout(r, 1));
      active--;
    };
    await Promise.all(Array.from({ length: 25 }, () => run(task)));
    expect(peak).toBe(2);
    expect(starts).toHaveLength(25);
    for (let i = 10; i < starts.length; i++)
      expect(starts[i] - starts[i - 10]).toBeGreaterThanOrEqual(1000);
  });
});
