import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ColeccionCoverProgress, ColeccionCoverState } from '../../../../core/src/messages.js';
import type { CoverArt } from '../../core/cover.js';
import { emptyGame } from '../../core/game.js';
import { cropFor, medianCut, pixelate, type RgbaImage } from '../../core/pixelate.js';
import { PLATFORMS } from '../../core/platforms.js';
import type { Game } from '../../core/types.js';
import { SMALL_LABEL_MAX, smallLabelRects } from '../../webview/art.js';
import { ColeccionOpen } from '../../webview/ColeccionPanel.js';
import { type ColeccionState, coleccionStore } from '../../webview/coleccionStore.js';
import { CONNECTION_LOST_TEXT } from '../../webview/coleccionStore.js';
import { candidateUrl, coverUrl, uploadHeaders, uploadUrl } from '../../webview/coverPixels.js';
import { CoverSheet } from '../../webview/CoverSheet.js';
import {
  conditionNote,
  coverCaption,
  floatingRun,
  missingCovers,
  nextToChoose,
  NONE_TEXT,
  reasonShort,
  reasonText,
  runLine,
  searchLine,
  searchYourselfUrl,
  skippedLine,
  uploadErrorText,
  uploadProblem,
} from '../../webview/coverText.js';
import { GameCase } from '../../webview/GameCase.js';
import {
  batchIds,
  boxArt,
  boxScale,
  CART_ART,
  CART_SHAPES,
  COVER_STYLE_DEFAULT,
  looseMedia,
  parseCoverStyle,
  pieceOf,
  pieceSize,
  sealedOf,
} from '../../webview/pieces.js';
import { drawSize, PixelCache, retryWait } from '../../webview/pixelCache.js';

// ── Synthetic images (never a real cover in the repo) ───────────────────────────────────────

function image(w: number, h: number, at: (x: number, y: number) => number[]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = at(x, y);
      data.set([r, g, b, a], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

/** A busy picture: a gradient with noise, a band and a circle (many hundreds of colors). */
const busy = () => {
  let s = 7;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  return image(300, 420, (x, y) => {
    const inCircle = (x - 150) ** 2 + (y - 220) ** 2 < 80 ** 2;
    if (y < 40) return [20, 20, 30];
    if (inCircle) return [230, 60 + Math.floor(rnd() * 30), 40];
    return [Math.floor((x / 300) * 255), Math.floor((y / 420) * 200), 120 + Math.floor(rnd() * 60)];
  });
};

const colorsOf = (data: Uint8ClampedArray | Uint8Array) => {
  const set = new Set<number>();
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3]) set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return set;
};

describe('pixelate (pure, RGBA in and out)', () => {
  for (const [w, colors] of [
    [24, 8],
    [32, 16],
    [40, 32],
  ] as const) {
    it(`a busy cover becomes ${w} px wide with at most ${colors} colors`, () => {
      const h = Math.round(w / 0.71);
      const out = pixelate(busy(), { width: w, height: h, colors });
      expect(out.width).toBe(w);
      expect(out.height).toBe(h);
      expect(out.data.length).toBe(w * h * 4);
      const used = colorsOf(out.data);
      expect(used.size).toBeLessThanOrEqual(colors);
      expect(used.size).toBeGreaterThan(colors / 2);
      expect(out.palette.length).toBeLessThanOrEqual(colors);
    });
  }

  it('no smoothing: two flat colors stay exactly those two (nothing in between), with either sampling', () => {
    const red = [200, 20, 30];
    const blue = [20, 40, 210];
    // 8×8 blocks: the edges between them must not turn purple
    const src = image(64, 64, (x, y) => ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? red : blue));
    for (const mode of ['nearest', 'average'] as const) {
      const out = pixelate(src, { width: 8, height: 8, colors: 16, mode });
      const used = colorsOf(out.data);
      expect([...used].sort(), mode).toEqual(
        [
          (red[0] << 16) | (red[1] << 8) | red[2],
          (blue[0] << 16) | (blue[1] << 8) | blue[2],
        ].sort(),
      );
    }
  });

  it('nearest takes one source pixel per block: a 1-pixel grid of a third color never shows up blended', () => {
    // A white line every 10 px; nearest samples the middle of each 10-px block, so it never lands on a line
    const src = image(100, 100, (x, y) =>
      x % 10 === 0 || y % 10 === 0 ? [255, 255, 255] : [0, 0, 0],
    );
    const out = pixelate(src, { width: 10, height: 10, colors: 4, mode: 'nearest' });
    expect([...colorsOf(out.data)]).toEqual([0]);
  });

  it('alpha is all or nothing; a transparent corner stays transparent', () => {
    const src = image(40, 40, (x, y) => (x < 20 && y < 20 ? [0, 0, 0, 0] : [50, 150, 50, 255]));
    const out = pixelate(src, { width: 4, height: 4, colors: 4 });
    const alphas = new Set<number>();
    for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i]);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(out.data[3]).toBe(0);
    expect(out.data[out.data.length - 1]).toBe(255);
  });

  it('always the same result for the same picture', () => {
    const a = pixelate(busy(), { width: 32, height: 45, colors: 16 });
    const b = pixelate(busy(), { width: 32, height: 45, colors: 16 });
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('median cut never gives more colors than asked, nor more than there are', () => {
    const two = image(10, 10, (x) => (x < 5 ? [1, 2, 3] : [200, 100, 50]));
    expect(medianCut(two.data, 16)).toHaveLength(2);
    expect(medianCut(busy().data, 8)).toHaveLength(8);
    expect(medianCut(new Uint8ClampedArray(16), 8)).toEqual([]);
  });

  it('the crop keeps the box shape, centered, anchored where asked', () => {
    expect(cropFor(200, 100, 1)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    const c = cropFor(100, 300, 1, 0);
    expect(c).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(cropFor(100, 300, 1, 1).y).toBe(200);
    expect(cropFor(100, 300, 0.5).h).toBe(200);
  });
});

// ── Box or cartridge ──────────────────────────────────────────────────────────────────────

const COVER: CoverArt = {
  source: 'libretro',
  key: 'X (USA).png',
  at: '2026-11-16T10:00:00.000Z',
  type: 'png',
};
let n = 0;
const game = (title: string, platform: string, extra: Partial<Game> = {}): Game => ({
  ...emptyGame('2026-01-01', platform),
  id: `p${String(++n).padStart(5, '0')}`,
  title,
  ...extra,
});

describe('box or loose, per game', () => {
  it('suelto: the loose piece of its console, with its own shape', () => {
    const loose = (platform: string) => pieceOf({ platform, condition: 'suelto' }, false);
    expect(loose('nes')).toEqual({ kind: 'loose', media: 'nes' });
    expect(loose('snes')).toEqual({ kind: 'loose', media: 'snes' });
    expect(loose('n64')).toEqual({ kind: 'loose', media: 'n64' });
    expect(loose('gb')).toEqual({ kind: 'loose', media: 'gb' });
    expect(loose('ds')).toEqual({ kind: 'loose', media: 'ds' });
    expect(loose('3ds')).toEqual({ kind: 'loose', media: '3ds' });
    expect(loose('switch')).toEqual({ kind: 'loose', media: 'switch' });
    expect(loose('switch2')).toEqual({ kind: 'loose', media: 'switch' });
    expect(loose('genesis')).toEqual({ kind: 'loose', media: 'genesis' });
    expect(loose('neogeo')).toEqual({ kind: 'loose', media: 'cart' });
    expect(loose('ps2')).toEqual({ kind: 'loose', media: 'disc' });
    expect(loose('gc')).toEqual({ kind: 'loose', media: 'disc' });
    expect(loose('consola-rara')).toEqual({ kind: 'loose', media: 'disc' });
  });

  it('completo / sellado: its box, from the front with the cover when there is one', () => {
    expect(pieceOf({ platform: 'ps2', condition: 'completo' }, true)).toEqual({
      kind: 'box',
      art: 'cover',
    });
    expect(pieceOf({ platform: 'ps2', condition: 'sellado' }, false)).toEqual({ kind: 'spine' });
    expect(pieceOf({ platform: 'nes', condition: 'completo' }, false)).toEqual({
      kind: 'box',
      art: 'drawn',
    });
    expect(pieceOf({ platform: '3ds', condition: 'sellado' }, true)).toEqual({
      kind: 'box',
      art: 'cover',
    });
  });

  it('empty condition: the console default (old cartridges loose; DS, 3DS and discs boxed)', () => {
    expect(pieceOf({ platform: 'nes', condition: '' }, true)).toEqual({
      kind: 'loose',
      media: 'nes',
    });
    expect(pieceOf({ platform: 'gba', condition: '' }, false)).toEqual({
      kind: 'loose',
      media: 'gba',
    });
    expect(pieceOf({ platform: 'ds', condition: '' }, false)).toEqual({
      kind: 'box',
      art: 'drawn',
    });
    expect(pieceOf({ platform: '3ds', condition: '' }, true)).toEqual({
      kind: 'box',
      art: 'cover',
    });
    expect(pieceOf({ platform: 'wiiu', condition: '' }, false)).toEqual({ kind: 'spine' });
  });

  it('every console has a loose piece, and every cartridge shape its label inside it', () => {
    for (const p of PLATFORMS) expect(looseMedia(p.id), p.id).toBeTruthy();
    for (const s of CART_SHAPES) {
      const a = CART_ART[s];
      expect(a.label.x + a.label.w, s).toBeLessThanOrEqual(a.w);
      expect(a.label.y + a.label.h, s).toBeLessThanOrEqual(a.h);
      expect(a.label.w * a.label.h, s).toBeGreaterThan(20);
    }
  });

  it('a box from the front is wider than its spine, and one style gives one pixel size on every shelf', () => {
    for (const style of [
      { w: 24, colors: 8, mode: 'nearest' as const },
      COVER_STYLE_DEFAULT,
      { w: 40, colors: 32, mode: 'nearest' as const },
    ]) {
      const k = boxScale(style);
      const dvd = boxArt('ps2', style);
      expect(dvd.cover.w).toBe(dvd.w - 3);
      const front = pieceSize({ kind: 'box', art: 'cover' }, 'ps2', style, { w: 22, h: 132 });
      expect(front.w).toBe(dvd.w * k);
      expect(front.w).toBeGreaterThan(22 * 3);
      // Near the DVD spine's height, so a shelf does not jump
      expect(front.h).toBeGreaterThan(100);
      expect(front.h).toBeLessThan(150);
      // A DS box is smaller than a DVD case; an SNES box is wider than tall
      expect(boxArt('ds', style).h).toBeLessThan(dvd.h);
      expect(boxArt('snes', style).w).toBeGreaterThan(boxArt('snes', style).h);
    }
    expect(boxScale({ w: 24, colors: 8, mode: 'nearest' })).toBe(4);
    expect(boxScale(COVER_STYLE_DEFAULT)).toBe(2);
    expect(boxScale({ w: 40, colors: 8, mode: 'nearest' })).toBe(2);
  });

  it('«Todos con caja / sueltos» only touches what would look different, and never un-seals one', () => {
    const list = [
      { id: 'a', wanted: false, condition: '' as const, platform: '3ds' }, // boxed by default
      { id: 'b', wanted: false, condition: 'sellado' as const, platform: '3ds' },
      { id: 'c', wanted: false, condition: 'completo' as const, platform: '3ds' },
      { id: 'd', wanted: false, condition: 'suelto' as const, platform: '3ds' },
      { id: 'e', wanted: true, condition: '' as const, platform: '3ds' },
      { id: 'f', wanted: false, condition: '' as const, platform: 'nes' }, // loose by default
    ];
    expect(batchIds(list, 'completo')).toEqual(['d', 'f']);
    expect(batchIds(list, 'suelto')).toEqual(['a', 'c']);
    expect(sealedOf(list)).toBe(1);
    // A shelf already as asked, by its console's default: nothing to count, nothing to write
    const nes = [
      { id: 'x', wanted: false, condition: '' as const, platform: 'nes' },
      { id: 'y', wanted: false, condition: 'suelto' as const, platform: 'nes' },
    ];
    expect(batchIds(nes, 'suelto')).toEqual([]);
  });

  it('the comparison mode comes from the address: ?portadas=WxC (m = average)', () => {
    expect(parseCoverStyle('?portadas=24x8')).toEqual({ w: 24, colors: 8, mode: 'nearest' });
    expect(parseCoverStyle('?x=1&portadas=40x32')).toEqual({ w: 40, colors: 32, mode: 'nearest' });
    expect(parseCoverStyle('?portadas=32x16m')).toEqual({ w: 32, colors: 16, mode: 'average' });
    expect(parseCoverStyle('')).toEqual(COVER_STYLE_DEFAULT);
    expect(parseCoverStyle('?portadas=grande')).toEqual(COVER_STYLE_DEFAULT);
    expect(parseCoverStyle('?portadas=4x8')).toEqual(COVER_STYLE_DEFAULT);
    expect(parseCoverStyle('?portadas=32x1')).toEqual(COVER_STYLE_DEFAULT);
    expect(parseCoverStyle('?portadas=32x99')).toEqual(COVER_STYLE_DEFAULT);
  });
});

// ── Words ─────────────────────────────────────────────────────────────────────────────────

describe('cover texts', () => {
  it('says why it was not found, in words, with the console', () => {
    const sw = { title: 'Kirby', platform: 'switch' };
    expect(reasonText('sin-llave', sw)).toBe(
      'libretro no tiene Switch, y falta la llave de IGDB (o no funcionó).',
    );
    expect(reasonText('sin-cobertura', { title: 'X', platform: 'pc' })).toContain('PC');
    expect(reasonText('pocas', { title: 'X', platform: 'x360' }, true)).toContain(
      'Con la llave de IGDB',
    );
    expect(reasonText('sin-respuesta', sw)).toContain('no contestó');
    expect(reasonText('sin-coincidencia', sw)).toBe('No hubo coincidencia con «Kirby».');
    expect(reasonText('sin-respuesta', sw)).toContain('vuelve a intentar');
    expect(reasonText('cambio', sw)).toContain('Búscala de nuevo');
    for (const r of [
      'sin-cobertura',
      'pocas',
      'sin-llave',
      'sin-respuesta',
      'sin-coincidencia',
      'cambio',
    ])
      expect(reasonShort(r)).not.toBe('otro motivo');
  });

  it('the line of a search and the caption of a cover', () => {
    const g = game('Zelda', 'gc');
    const base = { id: g.id, stamp: 's1', at: COVER.at };
    expect(searchLine(undefined, g)).toBe('');
    expect(searchLine({ ...base, state: 'buscando' }, g)).toBe('Buscando portada…');
    expect(
      searchLine({ ...base, state: 'encontrada', source: 'libretro', label: 'Zelda (USA)' }, g),
    ).toBe('Encontrada en libretro-thumbnails: Zelda (USA).');
    expect(searchLine({ ...base, state: 'nada', reason: 'sin-respuesta' }, g)).toContain(
      'No encontrada.',
    );
    expect(coverCaption(COVER)).toBe('Portada: libretro-thumbnails · 16 nov 2026');
    expect(coverCaption({ ...COVER, source: 'igdb' })).toContain('IGDB');
    expect(coverCaption({ ...COVER, source: 'subida', key: '' })).toContain('subida a mano');
  });

  it('box or loose in the case says when it is only the console default', () => {
    expect(conditionNote({ platform: 'nes', condition: '' })).toBe(
      'Suelto, de fábrica para esta consola',
    );
    expect(conditionNote({ platform: '3ds', condition: '' })).toBe(
      'Con caja, de fábrica para esta consola',
    );
    expect(conditionNote({ platform: '3ds', condition: 'suelto' })).toBe('Suelto');
    expect(conditionNote({ platform: 'ps2', condition: 'sellado' })).toBe('Sellado, con caja');
  });

  it('search it yourself, uploads, the run line', () => {
    const url = searchYourselfUrl({ title: 'Mario & Luigi', platform: '3ds' });
    expect(url.startsWith('https://www.google.com/search?tbm=isch&q=')).toBe(true);
    expect(decodeURIComponent(url.split('q=')[1])).toBe('Mario & Luigi Nintendo 3DS box art');
    const types = ['image/png', 'image/jpeg', 'image/webp'];
    expect(uploadProblem({ type: 'image/gif', size: 10 }, types, 100)).toBe(
      'Solo PNG, JPG o WEBP.',
    );
    expect(uploadProblem({ type: 'image/png', size: 101 }, types, 100)).toContain('Pesa más');
    expect(uploadProblem({ type: 'image/webp', size: 50 }, types, 100)).toBeNull();
    expect(uploadErrorText(413)).toContain('4 MB');
    expect(uploadErrorText(415)).toContain('no es una imagen');
    const run: ColeccionCoverProgress = {
      running: true,
      stopped: false,
      total: 40,
      done: 12,
      found: 8,
      choose: 2,
      notFound: 2,
      failed: 0,
      skipped: 0,
      reasons: [],
    };
    expect(runLine(run)).toBe('12 de 40 · 8 encontradas · 2 por elegir · 2 no');
    expect(runLine({ ...run, failed: 3 })).toBe(
      '12 de 40 · 8 encontradas · 2 por elegir · 2 no · 3 sin respuesta',
    );
    expect(skippedLine(run)).toBe('');
    expect(skippedLine({ skipped: 4 })).toContain('Se saltaron 4');
    expect(
      missingCovers([
        game('A', 'gc'),
        game('B', 'gc', { coverArt: COVER }),
        game('C', 'gc', { wanted: true }),
      ]),
    ).toBe(1);
    // The same count as the run: what is settled is left out
    const a = game('A', 'gc');
    const b = game('B', 'gc', { coverNone: COVER.at });
    const c = game('C', 'gc');
    const d = game('D', 'gc');
    const e = game('E', 'switch');
    const last = (id: string, extra: Partial<ColeccionCoverState>): ColeccionCoverState => ({
      id,
      state: 'nada',
      stamp: 's',
      at: COVER.at,
      ...extra,
    });
    const covers = [
      last(c.id, { state: 'elige', candidates: [] }),
      last(d.id, { reason: 'sin-coincidencia' }),
      last(e.id, { reason: 'sin-llave', needsKey: true }),
    ];
    expect(missingCovers([a, b, c, d, e], covers, false)).toBe(1);
    expect(missingCovers([a, b, c, d, e], covers, true)).toBe(2);
  });

  it('the next one waiting for a choice, in shelf order, after the open one', () => {
    const st = (
      id: string,
      state: ColeccionCoverState['state'],
      stamp = 's',
    ): ColeccionCoverState => ({
      id,
      state,
      stamp,
      at: COVER.at,
    });
    const covers = [st('c', 'elige'), st('a', 'elige'), st('b', 'nada'), st('d', 'elige', 'x')];
    const order = ['a', 'b', 'c', 'd'];
    expect(nextToChoose(order, covers)).toBe('a');
    expect(nextToChoose(order, covers, 'a')).toBe('c');
    expect(nextToChoose(order, covers, 'd')).toBe('a');
    expect(nextToChoose(order, covers, 'c', { d: 'x' })).toBe('a');
    expect(nextToChoose(order, [st('b', 'nada')])).toBeUndefined();
    // The only one waiting is the one open: there is no next
    expect(nextToChoose(order, [st('c', 'elige')], 'c', {}, 'c')).toBeUndefined();
    expect(nextToChoose(order, covers, 'c', {}, 'c')).toBe('d');
    // Only selected (its case closed): it can still be offered
    expect(nextToChoose(order, [st('c', 'elige')], 'c')).toBe('c');
  });

  it('addresses carry the token and a version, never a file name', () => {
    expect(coverUrl('abcd1234', COVER.at, 'tok')).toBe(
      `/api/coleccion/portada/abcd1234?token=tok&v=${encodeURIComponent(COVER.at)}`,
    );
    expect(candidateUrl('abcd1234', 2, 'st1', null)).toBe(
      '/api/coleccion/candidata/abcd1234/2?v=st1',
    );
    // The upload carries the token in its header, never in the address
    expect(uploadUrl('abcd1234')).toBe('/api/coleccion/portada/abcd1234');
    expect(uploadHeaders('image/png', 'tok')).toEqual({
      'Content-Type': 'image/png',
      Authorization: 'Bearer tok',
    });
    expect(uploadHeaders('image/png', null)).toEqual({ 'Content-Type': 'image/png' });
  });
});

// ── The panel ─────────────────────────────────────────────────────────────────────────────

const state = (
  games: Game[],
  extra: Partial<ColeccionState> = {},
  status: Partial<NonNullable<ColeccionState['status']>> = {},
): ColeccionState => ({
  open: true,
  view: { kind: 'shelves' },
  bySeries: true,
  onlyWanted: false,
  savedInRow: 0,
  focusName: 0,
  status: { games, file: 'f', problems: [], igdbKey: false, covers: [], ...status },
  ...extra,
});
const transport = () => ({
  send: () => {},
  onMessage: () => () => {},
  ready: Promise.resolve(),
  state: 'connected' as const,
  onStateChange: () => () => {},
  dispose: () => {},
});
const html = (s: ColeccionState) =>
  renderToStaticMarkup(createElement(ColeccionOpen, { transport: transport(), state: s }));
const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;

describe('the panel with covers', () => {
  beforeEach(() => coleccionStore.reset());

  it('the shelf: boxes from the front with a cover, loose cartridges, spines without', () => {
    const games = [
      game('Con portada', 'ps2', { coverArt: COVER }),
      game('Sin portada', 'ps2'),
      game('Disco suelto', 'ps2', { condition: 'suelto' }),
      game('Cartucho', 'nes'),
      game('Con caja NES', 'nes', { condition: 'completo' }),
      game('Tarjeta', '3ds', { condition: 'suelto' }),
      game('Caja 3DS', '3ds'),
    ];
    const h = html(state(games));
    expect(count(h, /class="col-box pc front/g)).toBe(3);
    expect(count(h, /class="col-box pc loose/g)).toBe(2);
    expect(count(h, /class="col-box pc disc/g)).toBe(1);
    expect(count(h, /class="col-box  /g)).toBe(1);
    expect(h).toContain('title="Cartucho (suelto)"');
    // The batch buttons, on shelves with two or more
    expect(count(h, />Todos con caja</g)).toBe(3);
    expect(count(h, />Todos sueltos</g)).toBe(3);
    expect(h).toContain('>Portadas<');
  });

  it('the case: the full cover with where it came from, the switch and the actions', () => {
    const g = game('Zelda', 'gc', { coverArt: COVER });
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        state: state([g]),
        send: () => {},
      }),
    );
    expect(h).toContain(`src="/api/coleccion/portada/${g.id}?v=`);
    expect(h).toContain('Portada: libretro-thumbnails · 16 nov 2026');
    expect(h).toContain('>Cambiar<');
    expect(h).toContain('>Quitar<');
    expect(h).toContain('Búscala tú');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('Con caja, de fábrica para esta consola');
    expect(h).toMatch(/aria-pressed="true"[^>]*>Con caja</);
  });

  it('elige una: up to four with name and region, as text; «Ninguna»', () => {
    const g = game('Mario', 'wii');
    const search: ColeccionCoverState = {
      id: g.id,
      state: 'elige',
      stamp: 'st9',
      at: COVER.at,
      candidates: [
        { source: 'libretro', label: 'Mario (USA)', region: 'USA' },
        { source: 'libretro', label: '<img src=x onerror=alert(1)>', region: 'Europe' },
        { source: 'igdb', label: 'Mario Party', region: '' },
      ],
    };
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        search,
        state: state([g]),
        send: () => {},
      }),
    );
    expect(h).toContain('Elige una:');
    expect(count(h, /src="\/api\/coleccion\/candidata\//g)).toBe(3);
    expect(h).toContain('/candidata/' + g.id + '/1?v=st9');
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('>Ninguna<');
    expect(h).not.toContain('class="cur"');
    // Closed with «Ninguna»: the disc comes back
    const closed = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        search,
        state: state([g], { dismissedChoice: { [g.id]: 'st9' } }),
        send: () => {},
      }),
    );
    expect(closed).not.toContain('Elige una:');
    expect(closed).toContain('Buscar portada');
  });

  it('«Cambiar»: the current one marked among the candidates, and «Dejar la que tiene»', () => {
    const g = game('Mario', 'wii', { coverArt: COVER });
    const search: ColeccionCoverState = {
      id: g.id,
      state: 'elige',
      stamp: 'st1',
      at: COVER.at,
      candidates: [
        { source: 'libretro', label: 'X (USA)', region: 'USA', current: true },
        { source: 'libretro', label: 'X (Europe)', region: 'Europe' },
      ],
    };
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        search,
        state: state([g]),
        send: () => {},
      }),
    );
    expect(h).toContain('Cambiar por:');
    expect(count(h, /class="cur"/g)).toBe(1);
    expect(h).toContain('La que tiene ahora');
    expect(h).toContain('Dejar la que tiene');
    expect(h).not.toContain('>Ninguna<');
  });

  it('«Cambiar» on an uploaded cover: it is shown among them to keep it', () => {
    const up = { ...COVER, source: 'subida' as const, key: '' };
    const g = game('Mario', 'wii', { coverArt: up });
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        search: {
          id: g.id,
          state: 'elige',
          stamp: 'st2',
          at: COVER.at,
          candidates: [{ source: 'libretro', label: 'X (USA)', region: 'USA' }],
        },
        state: state([g]),
        send: () => {},
      }),
    );
    expect(count(h, /class="cur"/g)).toBe(1);
    expect(h).toContain('La que tiene ahora');
    expect(h).toContain(`/api/coleccion/portada/${g.id}?`);
    // The candidate keeps its own number for the office
    expect(h).toContain(`/candidata/${g.id}/0?v=st2`);
  });

  it('a «Ninguna» kept: the case says so, and «Buscar otra vez»', () => {
    const g = game('Mario', 'wii', { coverNone: COVER.at });
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        state: state([g]),
        send: () => {},
      }),
    );
    expect(h).toContain(NONE_TEXT);
    expect(h).toContain('Buscar otra vez');
    expect(h).not.toContain('Buscar portada');
  });

  it('not found: the reason in words', () => {
    const g = game('Kirby', 'switch');
    const h = renderToStaticMarkup(
      createElement(GameCase, {
        game: g,
        games: [g],
        siblings: [g.id],
        today: '2026-11-16',
        onDelete: () => {},
        onPlayed: () => {},
        search: { id: g.id, state: 'nada', stamp: 's', at: COVER.at, reason: 'sin-llave' },
        state: state([g]),
        send: () => {},
      }),
    );
    expect(h).toContain('No encontrada. libretro no tiene Switch, y falta la llave de IGDB');
  });

  it('«Portadas»: the run button, the IGDB steps and terms, password fields; once set only «Llave puesta»', () => {
    const games = [game('A', 'ps2'), game('B', 'ps2', { coverArt: COVER })];
    const h = renderToStaticMarkup(
      createElement(CoverSheet, { state: state(games), send: () => {}, order: [] }),
    );
    expect(h).toContain('Buscar las que faltan (1)');
    expect(h).toContain('href="https://www.twitch.tv/p/legal/developer-agreement/"');
    expect(h).toContain('dev.twitch.tv/console/apps/create');
    expect(count(h, /type="password"/g)).toBe(2);
    expect(h).toContain('>Guardar<');
    const on = renderToStaticMarkup(
      createElement(CoverSheet, {
        state: state(games, {}, { igdbKey: true }),
        send: () => {},
        order: [],
      }),
    );
    // The secret: never offered to the browser's password manager
    expect(h).toMatch(/autoComplete="new-password"|autocomplete="new-password"/);
    expect(on).toContain('Llave de IGDB puesta');
    expect(on).toContain('Quitar llave');
    expect(on).not.toContain('type="password"');
  });

  it('the run: progress with «Detener», then the summary by reason and the next one to choose', () => {
    const games = [game('A', 'ps2'), game('B', 'ps2')];
    const running: ColeccionCoverProgress = {
      running: true,
      stopped: false,
      total: 2,
      done: 1,
      found: 1,
      choose: 0,
      notFound: 0,
      failed: 0,
      skipped: 0,
      reasons: [],
    };
    const h = html(state(games, {}, { coverRun: running }));
    // The list leaves room under the box, so what it covers can be scrolled into view
    expect(h).toContain('class="col-shelves with-run"');
    expect(h).toContain('aria-label="Hacer chico el avance"');
    // Folded to one line while it runs
    const min = html(state(games, { runMinimized: true }, { coverRun: running }));
    expect(min).toContain('col-run-box floating min');
    expect(min).toContain('class="col-shelves with-run-min"');
    expect(min).not.toContain('>Detener<');
    expect(min).toContain('Buscando portadas… 1/2');
    expect(floatingRun(state(games, {}, {}))).toBeNull();
    expect(h).toContain('Buscando portadas…');
    expect(h).toContain('>Detener<');
    expect(h).toContain('aria-valuenow="1"');
    expect(h).toContain('Portadas 1/2');
    const finished: ColeccionCoverProgress = {
      ...running,
      running: false,
      done: 2,
      found: 0,
      choose: 1,
      notFound: 1,
      reasons: [{ reason: 'sin-coincidencia', count: 1 }],
      finishedAt: '2026-11-16T10:10:00.000Z',
    };
    const covers: ColeccionCoverState[] = [
      { id: games[1].id, state: 'elige', stamp: 's', at: COVER.at, candidates: [] },
    ];
    const done = html(state(games, {}, { coverRun: finished, covers }));
    expect(done).toContain('Búsqueda terminada');
    expect(done).toContain('<b>1</b> · no hubo coincidencia');
    expect(done).toContain('Ir a la siguiente por elegir');
    // Closed by the person: gone from the shelves
    const closed = html(
      state(games, { dismissedRun: finished.finishedAt }, { coverRun: finished, covers }),
    );
    expect(closed).not.toContain('Búsqueda terminada');
    expect(closed).toContain('class="col-shelves"');
  });

  it('cover actions wait for their own answer; an upload answers by itself', () => {
    const r1 = coleccionStore.startOp('condition');
    coleccionStore.setResult({ requestId: 'otro', ok: false, error: 'x' });
    expect(coleccionStore.get().op?.requestId).toBe(r1);
    coleccionStore.setResult({ requestId: r1, ok: false, error: 'No se pudo cambiar.' });
    expect(coleccionStore.get()).toMatchObject({ op: undefined, opError: 'No se pudo cambiar.' });
    const r2 = coleccionStore.startOp('upload', 'abcd1234');
    expect(coleccionStore.get().opError).toBeUndefined();
    coleccionStore.endUpload(r2);
    expect(coleccionStore.get().op).toBeUndefined();
    // The view does not move (a save would open its case)
    expect(coleccionStore.get().view).toEqual({ kind: 'shelves' });
    // An answer lost on the way never leaves the buttons stuck: closing the panel lets go
    coleccionStore.startOp('pick', 'abcd1234');
    coleccionStore.close();
    expect(coleccionStore.get().op).toBeUndefined();
  });

  it('a dropped connection frees the buttons (an upload finishes on its own)', () => {
    coleccionStore.startOp('pick', 'abcd1234');
    coleccionStore.startSave('edit');
    coleccionStore.connectionLost();
    expect(coleccionStore.get()).toMatchObject({
      op: undefined,
      opError: CONNECTION_LOST_TEXT,
      pending: undefined,
      formError: CONNECTION_LOST_TEXT,
    });
    const up = coleccionStore.startOp('upload', 'abcd1234');
    coleccionStore.connectionLost();
    expect(coleccionStore.get().op?.requestId).toBe(up);
  });

  it('the status keeps the covers, the run and whether the key is set', () => {
    coleccionStore.setStatus({
      games: [game('A', 'ps2')],
      file: 'f',
      problems: [],
      igdbKey: true,
      covers: [{ id: 'x', state: 'buscando', stamp: 's', at: COVER.at }],
    });
    expect(coleccionStore.get().status).toMatchObject({ igdbKey: true, covers: [{ id: 'x' }] });
    coleccionStore.setStatus({ games: [], file: 'f', problems: [] });
    expect(coleccionStore.get().status).toMatchObject({ igdbKey: false, covers: [] });
  });
});

// ── Pixel art a few at a time, kept small ──────────────────────────────────────────────────

describe('the shelf pixel art cache', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('runs at most N jobs at once, one per key, and keeps only the newest results', async () => {
    const cache = new PixelCache<string>({ max: 3, concurrency: 2 });
    const releases: (() => void)[] = [];
    let started = 0;
    const job = (v: string) => () =>
      new Promise<string>((resolve) => {
        started++;
        releases.push(() => resolve(v));
      });
    const all = ['a', 'b', 'c', 'd'].map((k) => cache.request(k, job(k)));
    // The same key while it is pending: the same promise, no second job
    expect(cache.request('a', job('a2'))).toBe(all[0]);
    await tick();
    expect(started).toBe(2);
    expect(cache.active).toBe(2);
    while (releases.length) {
      releases.shift()?.();
      await tick();
      await tick();
    }
    expect(await Promise.all(all)).toEqual(['a', 'b', 'c', 'd']);
    expect(started).toBe(4);
    // Capped: the oldest went
    expect(cache.size).toBe(3);
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('d')).toBe('d');
  });

  it('a failed job is not kept (tried again later); an unusable one is (never tried again)', async () => {
    const cache = new PixelCache<string>({ max: 10, concurrency: 1 });
    expect(await cache.request('x', async () => undefined)).toBeUndefined();
    expect(cache.peek('x')).toBeUndefined();
    expect(await cache.request('x', async () => 'ok')).toBe('ok');
    expect(await cache.request('y', async () => null)).toBeNull();
    expect(cache.peek('y')).toBeNull();
    expect(await cache.request('z', async () => Promise.reject(new Error('boom')))).toBeUndefined();
    cache.forget((k) => k === 'x');
    expect(cache.peek('x')).toBeUndefined();
  });

  it('retries a few times, further apart, then gives up', () => {
    const waits = [0, 1, 2, 3].map(retryWait);
    expect(waits.slice(0, 3).every((w) => typeof w === 'number' && w > 0)).toBe(true);
    expect(waits[1]! > waits[0]!).toBe(true);
    expect(waits[3]).toBeNull();
  });

  it('a huge image is drawn already reduced; a small one as it is', () => {
    expect(drawSize(16000, 16000, 1200)).toEqual({ width: 1200, height: 1200 });
    expect(drawSize(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(drawSize(500, 700, 1200)).toEqual({ width: 500, height: 700 });
  });
});

describe('the label of a loose piece without its cover', () => {
  it('a box cover is never drawn with the small label design (default style, every console)', () => {
    for (const p of PLATFORMS) {
      const { cover } = boxArt(p.id, COVER_STYLE_DEFAULT);
      expect(cover.w >= SMALL_LABEL_MAX && cover.h >= SMALL_LABEL_MAX, p.id).toBe(true);
    }
  });

  it('is light and inside the label at every cartridge size: no empty or negative rectangle', () => {
    const sizes = new Set(Object.values(CART_ART).map((a) => `${a.label.w}x${a.label.h}`));
    for (const t of ['Tetris', 'A', 'Un juego con un nombre larguísimo de verdad']) {
      for (const size of sizes) {
        const [W, H] = size.split('x').map(Number);
        expect(W < SMALL_LABEL_MAX || H < SMALL_LABEL_MAX).toBe(true);
        const rects = smallLabelRects(t, W, H);
        expect(rects.length, size).toBeGreaterThanOrEqual(3);
        for (const r of rects) {
          expect(r.w, `${size} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(1);
          expect(r.h).toBeGreaterThanOrEqual(1);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(W);
          expect(r.y + r.h).toBeLessThanOrEqual(H);
        }
        // The first one fills it, light (never the dark background of the big scene)
        expect(rects[0]).toMatchObject({ x: 0, y: 0, w: W, h: H });
        const light = Number(/(\d+)%\)$/.exec(rects[0].color)?.[1]);
        expect(light).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
