import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  type CardRecord,
  createCardIndex,
  deckCover,
  deckFileContent,
  deckWarnings,
  DEFAULT_BOX_COLOR,
  detectFormat,
  EMPTY_LOOKUP,
  groupDeck,
  importDeck,
  newDeckId,
  normalizeDeck,
  parseTextList,
  parseYdk,
  parseYdke,
  toYdk,
  toYdke,
  trimYgoCard,
} from '../../core/index.js';
import { SAMPLE_CARDS } from './fixtures.js';

const records = SAMPLE_CARDS.map(trimYgoCard).filter((c): c is CardRecord => c !== null);
const index = createCardIndex(records);
const TODAY = '2026-11-13';

describe('decks core: formats', () => {
  it('reads the ydke:// example of the specification', () => {
    expect(parseYdke('ydke://o6lXBQ==!!!')).toEqual({ main: [89631139], extra: [], side: [] });
  });

  it('writes and reads back ydke:// with every zone and codes over 8 digits', () => {
    const lists = { main: [89631139, 89631139, 46986414], extra: [23995346], side: [501000007] };
    const link = toYdke(lists);
    expect(link.startsWith('ydke://o6lXBa')).toBe(true);
    expect(parseYdke(link)).toEqual(lists);
    expect(toYdke({ main: [89631139], extra: [], side: [] })).toBe('ydke://o6lXBQ==!!!');
  });

  it('refuses a broken ydke:// link', () => {
    expect(parseYdke('ydke://o6lX!!!')).toBeNull();
    expect(parseYdke('ydke://###!!!')).toBeNull();
    expect(parseYdke('ydke://o6lXBQ==')).toBeNull();
  });

  it('base64 matches the standard one for every length', () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 0xff);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect([...(base64ToBytes(b64) ?? [])]).toEqual([...bytes]);
    }
  });

  it('reads a .ydk with comments, junk and CRLF, and writes one back', () => {
    const text =
      '#created by someone\r\n#main\r\n89631139\r\n89631139\r\nhola\r\n#extra\r\n23995346\r\n!side\r\n44095762\r\n';
    const parsed = parseYdk(text);
    expect(parsed.main).toEqual([89631139, 89631139]);
    expect(parsed.extra).toEqual([23995346]);
    expect(parsed.side).toEqual([44095762]);
    expect(parsed.problems).toHaveLength(1);
    const again = parseYdk(toYdk(parsed));
    expect({ main: again.main, extra: again.extra, side: again.side }).toEqual({
      main: parsed.main,
      extra: parsed.extra,
      side: parsed.side,
    });
    expect(detectFormat(text)).toBe('ydk');
    expect(detectFormat('  ydke://o6lXBQ==!!!')).toBe('ydke');
    expect(detectFormat('3 Dark Magician')).toBe('text');
  });
});

describe('decks core: deck file', () => {
  it('fills missing fields, drops bad codes and keeps unknown fields', () => {
    const result = normalizeDeck(
      {
        id: 'abcd1',
        main: [89631139, '46986414', 'nope', -3, 1.5],
        future: { x: 1 },
        box: { color: 'red' },
      },
      TODAY,
    );
    expect(result).not.toBeNull();
    const { deck, unknown, problems } = result!;
    expect(deck.id).toBe('abcd1');
    expect(deck.main).toEqual([89631139, 46986414]);
    expect(deck.extra).toEqual([]);
    expect(deck.name).toBe('Deck sin nombre');
    expect(deck.createdAt).toBe(TODAY);
    expect(deck.box.color).toBe(DEFAULT_BOX_COLOR);
    expect(unknown).toEqual({ future: { x: 1 } });
    expect(problems.length).toBe(2);
    expect(deckFileContent(deck, unknown, 1)).toMatchObject({
      future: { x: 1 },
      version: 1,
      id: 'abcd1',
    });
    expect(normalizeDeck([1, 2], TODAY)).toBeNull();
    expect(normalizeDeck({ id: 'NO!' }, TODAY)?.deck.id).toBe('');
  });

  it('makes ids of the right shape and picks a cover', () => {
    expect(newDeckId()).toMatch(/^[a-z0-9]{8}$/);
    expect(newDeckId(() => 0.999999)).toBe('99999999');
    expect(deckCover({ cover: 0, main: [], extra: [23995346], side: [] })).toBe(23995346);
    expect(deckCover({ cover: 46986414, main: [1], extra: [], side: [] })).toBe(46986414);
  });
});

describe('decks core: cards and search', () => {
  it('trims YGOPRODeck cards, drops skills and tokens, says Banned for Forbidden', () => {
    expect(records.map((c) => c.id)).not.toContain(300101001);
    expect(records.map((c) => c.id)).not.toContain(1000001);
    const pot = records.find((c) => c.id === 55144522)!;
    expect(pot).toMatchObject({
      kind: 'spell',
      banTcg: 'Banned',
      banOcg: 'Banned',
      extraDeck: false,
    });
    expect(pot).not.toHaveProperty('card_sets');
    const link = records.find((c) => c.id === 1861629)!;
    expect(link).toMatchObject({ kind: 'monster', extraDeck: true, atk: 2300 });
    expect(link).not.toHaveProperty('level');
    expect(link).not.toHaveProperty('def');
    expect(records.find((c) => c.id === 46986414)?.images).toEqual([46986414, 36996508]);
  });

  it('finds by any artwork code, by name (exact, prefix, word, contains) and by code prefix', () => {
    expect(index.get(36996508)?.name).toBe('Dark Magician');
    expect(index.search('blue eyes').map((c) => c.name)).toEqual([
      'Blue-Eyes White Dragon',
      'Blue-Eyes Ultimate Dragon',
    ]);
    expect(index.search('dragon').map((c) => c.name)).toEqual([
      'Blue-Eyes White Dragon',
      'Blue-Eyes Ultimate Dragon',
    ]);
    expect(index.search('magician')[0].name).toBe('Dark Magician');
    expect(index.search('8963')[0].id).toBe(89631139);
    expect(index.search('36996508')[0].name).toBe('Dark Magician');
    expect(index.search('Pot', 1)).toHaveLength(1);
    expect(index.findByName('dark magician')).toMatchObject({ exact: true });
    expect(index.findByName('Dark Magican')).toMatchObject({
      exact: false,
      card: { id: 46986414 },
    });
    expect(index.findByName('zzzz')).toBeUndefined();
  });
});

describe('decks core: text lists and import', () => {
  it('reads copies, codes, headers, names with digits and typos', () => {
    const text = [
      '# deck de prueba',
      'Monstruos (6):',
      '3 Dark Magician',
      '2x 89631139',
      '7 Colored Fish',
      'Blue Eyes Ultimate Dragon',
      '// comentario',
      'Magias',
      'Pot of Greed x2',
      'Trampas:',
      '- Mirror Forse',
      'Extra',
      '1 Decode Talker',
      'Side Deck',
      '44095762',
      'Carta Que No Existe',
    ].join('\n');
    const out = parseTextList(text, index);
    expect(out.main).toEqual([
      46986414, 46986414, 46986414, 89631139, 89631139, 23771716, 55144522, 55144522, 44095762,
    ]);
    // The fusion written under Monstruos goes to the Extra
    expect(out.extra).toEqual([23995346, 1861629]);
    expect(out.side).toEqual([44095762]);
    expect(out.problems.some((p) => p.includes('Mirror Forse') && p.includes('Mirror Force'))).toBe(
      true,
    );
    expect(out.problems.some((p) => p.includes('Carta Que No Existe'))).toBe(true);
  });

  it('without a database keeps codes and reports names it could not look up', () => {
    const out = parseTextList('3 89631139\nDark Magician', EMPTY_LOOKUP);
    expect(out.main).toEqual([89631139, 89631139, 89631139]);
    expect(out.problems[0]).toContain('todavía no hay base');
  });

  it('imports any format as an unsaved draft', () => {
    const ydke = importDeck('ydke://o6lXBQ==!!!', index, TODAY);
    expect(ydke).toMatchObject({ ok: true, format: 'ydke', deck: { id: '', main: [89631139] } });
    const text = importDeck('2 Dark Magician', index, TODAY);
    // Only the deck fields: nothing of the parser leaks into the draft
    expect(Object.keys(text.deck ?? {}).sort()).toEqual([
      'box',
      'cover',
      'createdAt',
      'extra',
      'id',
      'main',
      'name',
      'notes',
      'owner',
      'side',
      'updatedAt',
    ]);
    const unknown = importDeck('#main\n12345678\n', index, TODAY);
    expect(unknown.ok).toBe(true);
    expect(unknown.problems[0]).toContain('12345678');
    expect(importDeck('hola mundo', index, TODAY).ok).toBe(false);
    expect(importDeck('ydke://###!!!', index, TODAY).ok).toBe(false);
  });
});

describe('decks core: groups and warnings', () => {
  const deck = {
    main: [
      46986414, 46986414, 36996508, 36996508, 55144522, 44095762, 44095762, 23995346, 99999999,
    ],
    extra: [89631139],
    side: [],
  };

  it('groups by kind with copies and keeps unknown codes', () => {
    const grouped = groupDeck(deck, index);
    expect(grouped.groups.map((g) => [g.key, g.count])).toEqual([
      ['monsters', 5],
      ['spells', 1],
      ['traps', 2],
      ['unknown', 1],
      ['extra', 1],
    ]);
    expect(grouped.counts).toMatchObject({ main: 9, extra: 1, side: 0, monsters: 5 });
  });

  it('warns about sizes, copies across artworks, the ban list and wrong zones', () => {
    const codes = deckWarnings(deck, index).map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'main-size',
        'copies',
        'banned',
        'limited',
        'extra-in-main',
        'main-in-extra',
      ]),
    );
    const copies = deckWarnings(deck, index).find((w) => w.code === 'copies')!;
    expect(copies.text).toBe('Dark Magician: 4 copias; el máximo es 3.');
    const clean = {
      main: Array.from({ length: 40 }, () => 89631139).map((id, i) => id + (i % 14)),
      extra: [],
      side: [],
    };
    expect(deckWarnings(clean, EMPTY_LOOKUP)).toEqual([]);
  });
});
