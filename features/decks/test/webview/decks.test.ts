import { beforeEach, describe, expect, it } from 'vitest';

import type { Deck, DeckCard } from '../../core/types.js';
import { DECKS_SHELF_TYPE, RULER_MAX_TICKS } from '../../webview/constants.js';
import {
  decksStore,
  type DecksStatusView,
  isDecksFurniture,
  sortDecks,
} from '../../webview/decksStore.js';
import {
  addCard,
  averageColor,
  banText,
  cardImageUrl,
  cardSubline,
  countsLine,
  dbStateText,
  isCodeQuery,
  moveCard,
  ownerText,
  printedCode,
  removeCard,
  statsLine,
  vividTint,
  warningsTitle,
  ydkFileName,
  zoneFor,
} from '../../webview/decksText.js';
import {
  boxPlacement,
  clampIndex,
  pickHopDelay,
  pickHops,
  pickPath,
  rulerFraction,
  rulerIndexAt,
  rulerTicks,
  visibleRange,
  wheelSteps,
} from '../../webview/rowMath.js';

const deck = (id: string, name: string, extra: Partial<Deck> = {}): Deck => ({
  id,
  name,
  owner: '',
  createdAt: '2026-11-13',
  updatedAt: '2026-11-13T10:00:00.000Z',
  cover: 0,
  box: { color: '#7a1f2b' },
  notes: '',
  main: [],
  extra: [],
  side: [],
  ...extra,
});

const card = (id: number, extra: Partial<DeckCard> = {}): DeckCard => ({
  id,
  name: `Card ${id}`,
  kind: 'monster',
  extraDeck: false,
  type: 'Effect Monster',
  frameType: 'effect',
  desc: '',
  ...extra,
});

const status = (
  decks: Deck[],
  db: DecksStatusView['db'] = { state: 'ready', count: 10 },
): DecksStatusView => ({
  decks,
  folder: '/tmp/decks',
  db,
  problems: [],
});

describe('decksStore', () => {
  beforeEach(() => decksStore.reset());

  it('opens on the row and closes', () => {
    decksStore.show({ kind: 'import' });
    decksStore.open();
    expect(decksStore.get().open).toBe(true);
    expect(decksStore.get().view).toEqual({ kind: 'row' });
    decksStore.close();
    expect(decksStore.get().open).toBe(false);
  });

  it('sorts the row by name and keeps the chosen deck by id when the list changes', () => {
    decksStore.setStatus(
      status([deck('bbbb', 'Zorro'), deck('aaaa', 'águila'), deck('cccc', 'Mago')]),
    );
    expect(decksStore.get().status?.decks.map((d) => d.name)).toEqual(['águila', 'Mago', 'Zorro']);
    expect(decksStore.get().selectedId).toBe('aaaa');
    decksStore.select('cccc');
    decksStore.setStatus(status([deck('dddd', 'Abeja'), deck('cccc', 'Mago')]));
    expect(decksStore.get().selectedId).toBe('cccc');
    decksStore.setStatus(status([deck('dddd', 'Abeja')]));
    expect(decksStore.get().selectedId).toBe('dddd');
  });

  it('drops an open box whose deck is gone', () => {
    decksStore.setStatus(status([deck('aaaa', 'A')]));
    decksStore.show({ kind: 'box', id: 'aaaa' });
    decksStore.setStatus(status([]));
    expect(decksStore.get().view).toEqual({ kind: 'row' });
    expect(decksStore.get().selectedId).toBeUndefined();
  });

  it('after saving a new deck, shows it when it comes back (not before)', () => {
    decksStore.setStatus(status([deck('aaaa', 'A')]));
    decksStore.edit();
    decksStore.markSaving({ id: '', updatedAt: '' });
    expect(decksStore.get().savePending).toBe(true);
    // A status from something else (the folder, the database) comes first: still waiting, still editing
    decksStore.setStatus(status([deck('aaaa', 'A', { updatedAt: '2026-11-13T12:00:00.000Z' })]));
    expect(decksStore.get().savePending).toBe(true);
    expect(decksStore.get().view.kind).toBe('edit');
    decksStore.setStatus(status([deck('aaaa', 'A'), deck('zzzz', 'Zeta')]));
    expect(decksStore.get().selectedId).toBe('zzzz');
    expect(decksStore.get().view).toEqual({ kind: 'box', id: 'zzzz' });
    expect(decksStore.get().savePending).toBe(false);
  });

  it('after saving an existing deck, waits for its new version', () => {
    const d = deck('bbbb', 'B');
    decksStore.setStatus(status([deck('aaaa', 'A'), d]));
    decksStore.edit(d);
    decksStore.markSaving(d);
    decksStore.setStatus(status([deck('aaaa', 'A'), d]));
    expect(decksStore.get().view.kind).toBe('edit');
    decksStore.setStatus(
      status([deck('aaaa', 'A'), { ...d, updatedAt: '2026-11-13T13:00:00.000Z' }]),
    );
    expect(decksStore.get().view).toEqual({ kind: 'box', id: 'bbbb' });
    expect(decksStore.get().selectedId).toBe('bbbb');
  });

  it('leaving the editor forgets the save in course', () => {
    decksStore.setStatus(status([deck('aaaa', 'A')]));
    decksStore.edit();
    decksStore.markSaving({ id: '', updatedAt: '' });
    decksStore.show({ kind: 'row' });
    decksStore.setStatus(status([deck('aaaa', 'A'), deck('zzzz', 'Zeta')]));
    expect(decksStore.get().view).toEqual({ kind: 'row' });
    expect(decksStore.get().selectedId).toBe('aaaa');
  });

  it('edits a copy, never the deck in the status', () => {
    const d = deck('aaaa', 'A', { main: [1, 2] });
    decksStore.setStatus(status([d]));
    decksStore.edit(decksStore.get().status!.decks[0]);
    const view = decksStore.get().view;
    if (view.kind !== 'edit') throw new Error('not editing');
    view.draft.main.push(3);
    expect(decksStore.get().status!.decks[0].main).toEqual([1, 2]);
    expect(decksStore.get().view.kind === 'edit' && decksStore.get().view).toBeTruthy();
  });

  it('a new deck starts empty with no id', () => {
    decksStore.edit();
    const view = decksStore.get().view;
    expect(view.kind === 'edit' && view.draft.id).toBe('');
    expect(view.kind === 'edit' && view.draft.main).toEqual([]);
  });

  it('asks for each card once, and again after the database arrives', () => {
    decksStore.setStatus(status([], { state: 'loading' }));
    expect(decksStore.needCards([1, 2, 2, 3])).toEqual([1, 2, 3]);
    expect(decksStore.needCards([1, 2, 4])).toEqual([4]);
    decksStore.addCards([card(1)], [2]);
    expect(decksStore.get().cards.get(1)?.name).toBe('Card 1');
    expect(decksStore.get().missing.has(2)).toBe(true);
    decksStore.setStatus(status([], { state: 'ready', count: 5 }));
    expect(decksStore.get().missing.size).toBe(0);
    expect(decksStore.needCards([1, 2, 3])).toEqual([2, 3]);
  });

  it('takes only the answer of the last search', () => {
    const first = decksStore.startSearch('dark');
    const second = decksStore.startSearch('dark mag');
    decksStore.setSearchResults(first, [card(1)]);
    expect(decksStore.get().search.pending).toBe(true);
    decksStore.setSearchResults(second, [card(2)]);
    expect(decksStore.get().search).toMatchObject({ query: 'dark mag', pending: false });
    expect(decksStore.get().search.cards.map((c) => c.id)).toEqual([2]);
    expect(decksStore.get().cards.has(2)).toBe(true);
  });

  it('takes only the answer of the last import', () => {
    decksStore.setImportText('#main\n1');
    const a = decksStore.startImport();
    const b = decksStore.startImport();
    decksStore.setImportResult(a, { ok: false, problems: ['x'] });
    expect(decksStore.get().importing.result).toBeUndefined();
    decksStore.setImportResult(b, {
      ok: true,
      deck: deck('', 'Deck importado', { main: [1] }),
      problems: [],
    });
    expect(decksStore.get().importing).toMatchObject({ text: '#main\n1', pending: false });
    expect(decksStore.get().importing.result?.ok).toBe(true);
  });

  it('knows its furniture', () => {
    expect(isDecksFurniture(DECKS_SHELF_TYPE)).toBe(true);
    expect(isDecksFurniture(`${DECKS_SHELF_TYPE}:left`)).toBe(true);
    expect(isDecksFurniture('OFERTAS_KIOSK')).toBe(false);
    expect(isDecksFurniture(undefined)).toBe(false);
  });

  it('sortDecks does not touch its input', () => {
    const list = [deck('bbbb', 'B'), deck('aaaa', 'A')];
    sortDecks(list);
    expect(list[0].id).toBe('bbbb');
  });
});

describe('decksText', () => {
  it('counts line and owner', () => {
    expect(countsLine({ main: 40, extra: 12, side: 0 })).toBe('40 cartas · 12 extra');
    expect(countsLine({ main: 1, extra: 0, side: 15 })).toBe('1 carta · 0 extra · 15 side');
    expect(ownerText('  Ana ')).toBe('de Ana');
    expect(ownerText(' ')).toBe('');
    expect(warningsTitle(1)).toBe('1 aviso de reglas');
    expect(warningsTitle(3)).toBe('3 avisos de reglas');
  });

  it('card image urls carry the size and the token', () => {
    expect(cardImageUrl(89631139, 'small', null)).toBe('/api/decks/img/89631139?size=small');
    expect(cardImageUrl(5, 'crop', 'a b')).toBe('/api/decks/img/5?size=crop&token=a+b');
  });

  it('card lines', () => {
    expect(statsLine(card(1, { atk: 3000, def: 2500, level: 8 }))).toBe(
      'ATK 3000 / DEF 2500 · Nivel 8',
    );
    expect(statsLine(card(1, { atk: 2500, level: 4, frameType: 'xyz' }))).toBe(
      'ATK 2500 · Rango 4',
    );
    expect(statsLine(card(1, { kind: 'spell', type: 'Spell Card', frameType: 'spell' }))).toBe('');
    expect(cardSubline(undefined, 12)).toBe('Código 12 · sin datos');
    expect(cardSubline(card(1, { type: '', kind: 'trap' }), 1)).toBe('Trampa');
    expect(banText(card(1, { banTcg: 'Semi-Limited' }))).toBe('Semilimitada (TCG)');
    expect(banText(card(1))).toBe('');
    expect(printedCode(5405695)).toBe('05405695');
  });

  it('a safe .ydk file name', () => {
    expect(ydkFileName('Dragones de Ña/ña: 2!')).toBe('Dragones-de-Na-na-2.ydk');
    expect(ydkFileName('***')).toBe('deck.ydk');
  });

  it('database state lines', () => {
    expect(dbStateText(undefined)).toBe('');
    expect(dbStateText({ state: 'loading' })).toMatch(/Bajando/);
    expect(dbStateText({ state: 'error', detail: 'sin red' })).toMatch(/sin red/);
    expect(dbStateText({ state: 'ready', count: 13000 })).toMatch(/13,000|13000/);
  });

  it('code queries', () => {
    expect(isCodeQuery(' 89631139 ')).toBe(true);
    expect(isCodeQuery('Dark 1')).toBe(false);
  });

  it('tint from a cover color: its hue, never too gray or too bright', () => {
    expect(vividTint(255, 0, 0)).toBe('hsl(0 80% 34%)');
    expect(vividTint(128, 128, 128)).toBe('hsl(0 20% 34%)');
    expect(vividTint(40, 60, 70)).toMatch(/^hsl\(200 45% 34%\)$/);
    const avg = averageColor([255, 0, 0, 255, 0, 0, 0, 255]);
    expect(avg.r).toBeGreaterThan(avg.b);
    expect(averageColor([])).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('adds, removes and moves cards without touching the original', () => {
    const d = deck('aaaa', 'A', { main: [1, 2, 1] });
    const added = addCard(d, 'side', 1);
    expect(added.side).toEqual([1]);
    expect(d.side).toEqual([]);
    expect(removeCard(d, 'main', 1).main).toEqual([1, 2]);
    expect(removeCard(d, 'main', 9)).toBe(d);
    const moved = moveCard(d, 'main', 'extra', 1);
    expect(moved.main).toEqual([2]);
    expect(moved.extra).toEqual([1, 1]);
    expect(moveCard(d, 'main', 'main', 1)).toBe(d);
    expect(zoneFor(card(1, { extraDeck: true }))).toBe('extra');
    expect(zoneFor(undefined)).toBe('main');
  });
});

describe('row math', () => {
  it('clamps the chosen index', () => {
    expect(clampIndex(-3, 10)).toBe(0);
    expect(clampIndex(12, 10)).toBe(9);
    expect(clampIndex(4.4, 10)).toBe(4);
    expect(clampIndex(3, 0)).toBe(0);
  });

  it('only a window of boxes is in the page, however long the row', () => {
    expect(visibleRange(0, 0)).toEqual({ from: 0, to: -1 });
    expect(visibleRange(0, 5)).toEqual({ from: 0, to: 4 });
    const big = visibleRange(250, 500);
    expect(big.to - big.from + 1).toBeLessThanOrEqual(18);
    expect(big.from).toBeLessThanOrEqual(250);
    expect(big.to).toBeGreaterThanOrEqual(250);
  });

  it('places the chosen box out in front, the others along the diagonal', () => {
    expect(boxPlacement(0).transform).toMatch(/rotateY\(-16deg\)/);
    expect(boxPlacement(2).transform).toMatch(/rotateY\(62deg\)/);
    expect(boxPlacement(5).brightness).toBeLessThan(boxPlacement(1).brightness);
    expect(boxPlacement(-1).hidden).toBe(false);
    expect(boxPlacement(-9).hidden).toBe(true);
  });

  it('the ruler maps both ways', () => {
    expect(rulerIndexAt(0, 10)).toBe(0);
    expect(rulerIndexAt(1, 10)).toBe(9);
    expect(rulerIndexAt(0.5, 11)).toBe(5);
    expect(rulerIndexAt(-2, 10)).toBe(0);
    expect(rulerFraction(5, 11)).toBe(0.5);
    expect(rulerFraction(0, 1)).toBe(0.5);
    const ticks = rulerTicks(3, 10);
    expect(ticks).toHaveLength(10);
    expect(ticks.filter((t) => t.on)).toHaveLength(1);
    expect(ticks[3].on).toBe(true);
    expect(ticks[3].height).toBeGreaterThan(ticks[9].height);
    expect(rulerTicks(0, 500)).toHaveLength(RULER_MAX_TICKS);
  });

  it('"Escoge uno" runs forward and lands on the target', () => {
    for (const [from, target, count] of [
      [0, 7, 18],
      [5, 5, 18],
      [16, 2, 18],
      [0, 1, 2],
      [10, 400, 500],
    ]) {
      const path = pickPath(from, target, count, 12);
      expect(path[path.length - 1]).toBe(target);
      expect(path.every((i) => i >= 0 && i < count)).toBe(true);
      expect(path.length).toBeGreaterThan(1);
      for (let i = 1; i < path.length; i++) expect(path[i]).not.toBe(path[i - 1]);
    }
    expect(pickPath(0, 0, 1, 12)).toEqual([0]);
    expect(pickHops(0)).toBeGreaterThanOrEqual(10);
    expect(pickHops(0.999)).toBeLessThan(16);
    expect(pickHopDelay(10)).toBeGreaterThan(pickHopDelay(1));
  });

  it('wheel deltas become whole steps', () => {
    expect(wheelSteps(0, 100, 60)).toEqual({ steps: 1, rest: 40 });
    expect(wheelSteps(40, 30, 60)).toEqual({ steps: 1, rest: 10 });
    expect(wheelSteps(0, -130, 60)).toEqual({ steps: -2, rest: -10 });
    expect(wheelSteps(0, 20, 60)).toEqual({ steps: 0, rest: 20 });
  });
});
