import { describe, expect, it } from 'vitest';

import {
  defaultCondition,
  gameFileContent,
  imageTypeOf,
  matchCover,
  normalizeCoverArt,
  normalizeGame,
  parseCoverName,
  PLATFORMS,
  runSearches,
  sameCoverTitle,
  shownCondition,
  titleTokens,
} from '../../core/index.js';

// Names written the way libretro-thumbnails names its files (text only; no image is involved). Every title here
// is a well-known classic or made up.
const found = (title: string, names: string[], region: '' | 'ntsc-u' | 'pal' | 'ntsc-j' = '') => {
  const m = matchCover(title, region, names);
  return m.kind === 'found' ? m.hits[0].name : null;
};

describe('coleccion covers: normalizing titles', () => {
  it('folds accents, "&", articles, punctuation and roman numerals', () => {
    expect(titleTokens('Pokémon Snap')).toEqual(['pokemon', 'snap']);
    expect(titleTokens('Pokemon - Snap')).toEqual(['pokemon', 'snap']);
    expect(titleTokens('Salt & Pepper Quest')).toEqual(titleTokens('Salt _ Pepper Quest'));
    expect(titleTokens('Legend of Zelda, The - A Link to the Past')).toEqual(
      titleTokens('The Legend of Zelda: A Link to the Past'),
    );
    expect(titleTokens('Dragon Quest X')).toEqual(['dragon', 'quest', '10']);
    expect(titleTokens('Dragon Quest X', false)).toEqual(['dragon', 'quest', 'x']);
    // Up to XX at least; a lone letter stays a letter when only two-letter numerals count
    expect(titleTokens('Dragon Quest XVII')).toEqual(['dragon', 'quest', '17']);
    expect(titleTokens('Space Saga XX')).toEqual(['space', 'saga', '20']);
    expect(titleTokens('Dragon Quest X', 'multi')).toEqual(['dragon', 'quest', 'x']);
    expect(titleTokens('Dragon Quest XI', 'multi')).toEqual(['dragon', 'quest', '11']);
    expect(titleTokens("Tony Hawk's Pro Skater 2")).toEqual([
      'tony',
      'hawks',
      'pro',
      'skater',
      '2',
    ]);
    expect(titleTokens('Dr. Mario')).toEqual(['dr', 'mario']);
  });

  it('the same title for a cover: case, punctuation, two-letter numerals, words run together', () => {
    expect(sameCoverTitle('Tetris', 'TETRIS')).toBe(true);
    expect(sameCoverTitle('Dragon Quest 11', 'Dragon Quest XI')).toBe(true);
    expect(sameCoverTitle('Spiderman', 'Spider-Man')).toBe(true);
    expect(sameCoverTitle('Tetris', 'Tetris Attack')).toBe(false);
    expect(sameCoverTitle('Space Saga X', 'Space Saga 10')).toBe(false);
  });

  it('takes a libretro name apart', () => {
    const p = parseCoverName('Pokemon - Snap (USA, Europe) (Virtual Console).png');
    expect(p).toMatchObject({
      base: 'Pokemon - Snap',
      regions: ['USA', 'Europe'],
      extras: 1,
      rev: 0,
      disc: 0,
      junk: false,
    });
    expect(parseCoverName('Final Odyssey (USA) (Disc 2)').disc).toBe(2);
    expect(parseCoverName('Halo 2 (USA) (Rev 1)').rev).toBe(1);
    expect(
      parseCoverName('Legend of Zelda, The - A Link to the Past (USA, Asia) (En,Fr,Es)'),
    ).toMatchObject({ extras: 0, regions: ['USA', 'Asia'] });
    for (const junk of [
      'Some Game (USA) [h Translation]',
      'Some Game (USA) (Unl)',
      'Some Game (USA) (Beta)',
      'Some Game (USA) (Demo)',
      'Some Game (Japan) (Proto)',
      'Some Game (USA) (Kiosk)',
      'Some Game (USA) (Sample)',
      'Some Game (USA) (Not For Resale)',
      'Some Game (USA) - Not For Resale',
      'Action Replay Max (Europe)',
      // Copies that are not the shop's, wherever the word is
      'Some Game (USA) (Store Demo)',
      'Some Game (Europe) (Trade Demo)',
      'Some Game (USA) (Promo)',
      'Some Game (USA) (Preview)',
      'Some Game (USA) (Trial)',
      'Some Game (Japan) (Taikenban)',
      'Some Game (Japan) (Club Nintendo Sample)',
      'Some Game (USA) (Beta 2)',
    ])
      expect(parseCoverName(junk).junk, junk).toBe(true);
    for (const fine of [
      'Some Game (USA) (Bonus Disc)',
      'Some Game (USA) (Collector Edition)',
      'Demolition Derby (USA)',
    ])
      expect(parseCoverName(fine).junk, fine).toBe(false);
  });
});

describe('coleccion covers: matching', () => {
  it('"Tetris" is never "Tetris 2"', () => {
    const names = ['Tetris 2 (USA).png', 'Tetris (USA).png', 'Tetris 3 (Japan).png'];
    expect(found('Tetris', names)).toBe('Tetris (USA).png');
    expect(found('Tetris 2', names)).toBe('Tetris 2 (USA).png');
    // Without the first one, the sequels are only candidates
    const m = matchCover('Tetris', '', ['Tetris 2 (USA).png']);
    expect(m.kind).toBe('choose');
  });

  it('"Sonic the Hedgehog" is not "Sonic the Hedgehog 2"', () => {
    const names = [
      'Sonic The Hedgehog 2 (World) (Rev A).png',
      'Sonic The Hedgehog (USA, Europe).png',
    ];
    expect(found('Sonic the Hedgehog', names)).toBe('Sonic The Hedgehog (USA, Europe).png');
    expect(found('Sonic the Hedgehog 2', names)).toBe('Sonic The Hedgehog 2 (World) (Rev A).png');
    expect(matchCover('Sonic the Hedgehog', '', [names[0]]).kind).toBe('choose');
  });

  it('"Halo: Combat Evolved" is exact; "Halo" alone is only a candidate', () => {
    const names = ['Halo - Combat Evolved (USA).png', 'Halo - Combat Evolved (Europe).png'];
    expect(found('Halo: Combat Evolved', names)).toBe('Halo - Combat Evolved (USA).png');
    expect(found('Halo: Combat Evolved', names, 'pal')).toBe('Halo - Combat Evolved (Europe).png');
    const m = matchCover('Halo', '', names);
    expect(m.kind).toBe('choose');
    expect(m.kind === 'choose' && m.hits).toHaveLength(1);
    // With the plain one there too, it is found
    expect(found('Halo', [...names, 'Halo (USA).png'])).toBe('Halo (USA).png');
  });

  it('a two-game disc ("Moon Patrol 2002 / Star Harbor Future") is never found as one of them', () => {
    const m = matchCover('Moon Patrol 2002 / Star Harbor Future', 'ntsc-u', [
      'Moon Patrol 2002 (USA).png',
      'Star Harbor Future (USA).png',
      'Moon Patrol 2002 (Europe).png',
    ]);
    expect(m.kind).toBe('choose');
    if (m.kind === 'choose') {
      expect(m.hits[0].name).toBe('Moon Patrol 2002 (USA).png');
      expect(m.hits.length).toBeLessThanOrEqual(4);
    }
  });

  it('the article at the end, regions, languages: A Link to the Past', () => {
    expect(
      found('The Legend of Zelda: A Link to the Past', [
        'Legend of Zelda, The - A Link to the Past (Europe) (En,Fr,De).png',
        'Legend of Zelda, The - A Link to the Past (USA, Asia) (En,Fr,Es).png',
        "Legend of Zelda, The - Link's Awakening (USA).png",
        'Legend of Zelda, The - A Link to the Past (Japan).png',
      ]),
    ).toBe('Legend of Zelda, The - A Link to the Past (USA, Asia) (En,Fr,Es).png');
  });

  it('a colon written as " - " or "_": Metroid Prime', () => {
    expect(
      found('Metroid Prime: Hunters', [
        'Metroid Prime - Pinball (USA).png',
        'Metroid Prime - Hunters (Europe).png',
        'Metroid Prime - Hunters (USA).png',
      ]),
    ).toBe('Metroid Prime - Hunters (USA).png');
    expect(found('Metroid Prime: Hunters', ['Metroid Prime_ Hunters (USA).png'])).toBe(
      'Metroid Prime_ Hunters (USA).png',
    );
  });

  it('disc 1 of a multi-disc game, and no revision before a revision', () => {
    expect(
      found('Final Odyssey', [
        'Final Odyssey (USA) (Disc 2).png',
        'Final Odyssey (USA) (Disc 1).png',
        'Final Odyssey (Europe) (Disc 1).png',
      ]),
    ).toBe('Final Odyssey (USA) (Disc 1).png');
    expect(found('Halo 2', ['Halo 2 (USA) (Rev 1).png', 'Halo 2 (USA).png'])).toBe(
      'Halo 2 (USA).png',
    );
    expect(found('Halo 2', ['Halo 2 (USA) (Rev 1).png', 'Halo 2 (USA) (Rev 2).png'])).toBe(
      'Halo 2 (USA) (Rev 2).png',
    );
  });

  it("region preference: the game's own, then USA, Europe, Japan", () => {
    const names = [
      'Super Mario 64 (Japan).png',
      'Super Mario 64 (Europe).png',
      'Super Mario 64 (USA).png',
    ];
    expect(found('Super Mario 64', names)).toBe('Super Mario 64 (USA).png');
    expect(found('Super Mario 64', names, 'ntsc-j')).toBe('Super Mario 64 (Japan).png');
    expect(found('Super Mario 64', names, 'pal')).toBe('Super Mario 64 (Europe).png');
    expect(
      found('Super Mario 64', ['Super Mario 64 (Japan).png', 'Super Mario 64 (Europe).png']),
    ).toBe('Super Mario 64 (Europe).png');
    expect(
      found('Super Mario 64', ['Super Mario 64 (Korea).png', 'Super Mario 64 (World).png']),
    ).toBe('Super Mario 64 (World).png');
  });

  it('junk never matches, and fewer extra tags win', () => {
    expect(
      matchCover('Neon Rally', '', [
        'Neon Rally (USA) (Beta).png',
        'Neon Rally (USA) [h Fix].png',
        'Neon Rally (USA) (Store Demo).png',
        'Neon Rally (Japan) (Taikenban).png',
      ]).kind,
    ).toBe('none');
    expect(found('Neon Rally', ['Neon Rally (USA) (Bonus Disc).png', 'Neon Rally (USA).png'])).toBe(
      'Neon Rally (USA).png',
    );
  });

  it('roman numerals up to XX, both ways, when it is one game; otherwise only candidates', () => {
    expect(found('Dragon Quest 11', ['Dragon Quest XI (USA).png'])).toBe(
      'Dragon Quest XI (USA).png',
    );
    expect(found('Space Saga XIII', ['Space Saga 13 (USA).png'])).toBe('Space Saga 13 (USA).png');
    expect(found('Space Saga 19', ['Space Saga XIX (Europe).png'])).toBe(
      'Space Saga XIX (Europe).png',
    );
    expect(
      found('Dragon Quest VII', ['Dragon Quest VII (USA).png', 'Dragon Quest 7 (USA).png']),
    ).toBe('Dragon Quest VII (USA).png');
    // Two different names that only agree once folded: not sure which one, so the person chooses
    expect(
      matchCover('Neon Saga II 4', '', ['Neon Saga 2 IV (USA).png', 'Neon Saga II IV (USA).png'])
        .kind,
    ).toBe('choose');
  });

  it('a lone "X", "V" or "I" is never enough against a number: at most a candidate', () => {
    // "Rocket Man X" (a letter in its name) and "Rocket Man 10" (the tenth) are different games
    const m = matchCover('Rocket Man X', '', ['Rocket Man 10 (USA).png']);
    expect(m.kind).toBe('choose');
    expect(matchCover('Rocket Man 10', '', ['Rocket Man X (USA).png']).kind).toBe('choose');
    expect(matchCover('Turbo Rally 5', '', ['Turbo Rally V (USA).png']).kind).toBe('choose');
    expect(matchCover('Space Saga I', '', ['Space Saga 1 (USA).png']).kind).toBe('choose');
    // Written the same way, it is found as always
    expect(found('Rocket Man X', ['Rocket Man 10 (USA).png', 'Rocket Man X (USA).png'])).toBe(
      'Rocket Man X (USA).png',
    );
  });

  it('a hyphen or a space inside a word: "Spiderman" is "Spider-Man", numbers never glue', () => {
    expect(found('Spiderman', ['Spider-Man (USA).png'])).toBe('Spider-Man (USA).png');
    expect(found('Spider Man 2', ['Spider-Man 2 (USA).png'])).toBe('Spider-Man 2 (USA).png');
    expect(found('Megaman Legends', ['Mega Man Legends (USA).png'])).toBe(
      'Mega Man Legends (USA).png',
    );
    expect(matchCover('Halo 2 3', '', ['Halo 23 (USA).png']).kind).not.toBe('found');
  });

  it('candidates: at most 4, best first; unrelated names are not candidates', () => {
    const names = [
      'Neon Rally - Turbo (USA).png',
      'Neon Rally - Night (USA).png',
      'Neon Rally - Snow (USA).png',
      'Neon Rally - Desert (USA).png',
      'Neon Rally - Moon (USA).png',
      'Cosmic Kitchen (USA).png',
    ];
    const m = matchCover('Neon Rally', '', names);
    expect(m.kind).toBe('choose');
    if (m.kind === 'choose') {
      expect(m.hits).toHaveLength(4);
      expect(m.hits.map((h) => h.name)).not.toContain('Cosmic Kitchen (USA).png');
    }
    expect(matchCover('Cosmic Kitchen 2', '', ['Garden Party (USA).png']).kind).toBe('none');
    expect(matchCover('', '', names).kind).toBe('none');
  });
});

describe('coleccion covers: what «Buscar las que faltan» looks for', () => {
  const g = (extra: Record<string, unknown> = {}) => ({ wanted: false, ...extra });
  it('skips settled games and tries again what failed or needed the key', () => {
    expect(runSearches(g(), undefined, false)).toBe(true);
    expect(runSearches(g({ wanted: true }), undefined, false)).toBe(false);
    expect(
      runSearches(
        g({ coverArt: { source: 'subida', key: '', at: '2026-11-16T00:00:00.000Z', type: 'png' } }),
        undefined,
        false,
      ),
    ).toBe(false);
    expect(runSearches(g({ coverNone: '2026-11-16T00:00:00.000Z' }), undefined, true)).toBe(false);
    expect(runSearches(g(), { state: 'elige' }, false)).toBe(false);
    expect(runSearches(g(), { state: 'nada', reason: 'sin-coincidencia' }, true)).toBe(false);
    expect(runSearches(g(), { state: 'nada', reason: 'sin-cobertura' }, true)).toBe(false);
    expect(
      runSearches(g(), { state: 'nada', reason: 'sin-respuesta', needsKey: true }, false),
    ).toBe(true);
    expect(runSearches(g(), { state: 'nada', reason: 'cambio' }, false)).toBe(true);
    expect(runSearches(g(), { state: 'nada', reason: 'sin-llave', needsKey: true }, false)).toBe(
      false,
    );
    expect(runSearches(g(), { state: 'nada', reason: 'sin-llave', needsKey: true }, true)).toBe(
      true,
    );
    expect(
      runSearches(g(), { state: 'nada', reason: 'sin-coincidencia', needsKey: true }, true),
    ).toBe(true);
  });
});

describe('coleccion covers: image bytes and cover data', () => {
  it('knows PNG, JPEG and WEBP by their first bytes, nothing else', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const webp = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ');
    expect(imageTypeOf(png)).toBe('png');
    expect(imageTypeOf(jpg)).toBe('jpg');
    expect(imageTypeOf(webp)).toBe('webp');
    expect(imageTypeOf(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(imageTypeOf(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBeNull();
    expect(imageTypeOf(new Uint8Array(0))).toBeNull();
    expect(imageTypeOf(png.slice(0, 7))).toBeNull();
  });

  it('cover data: strict, never a path; old games without it read the same', () => {
    const good = {
      source: 'libretro',
      key: 'Halo 2 (USA).png',
      at: '2026-11-16T05:00:00.000Z',
      type: 'png',
    };
    expect(normalizeCoverArt(good)).toEqual(good);
    expect(normalizeCoverArt({ ...good, key: '../../etc/passwd' })).toBeNull();
    expect(normalizeCoverArt({ ...good, key: 'C:\\x.png' })).toBeNull();
    expect(normalizeCoverArt({ ...good, source: 'web' })).toBeNull();
    expect(normalizeCoverArt({ ...good, type: 'gif' })).toBeNull();
    expect(normalizeCoverArt({ ...good, at: 'ayer' })).toBeNull();
    expect(normalizeCoverArt('Halo 2.png')).toBeNull();

    const old = normalizeGame({ id: 'abcd1234', title: 'Viejo', platform: 'gc' }, '2026-11-16');
    expect(old?.game.coverArt).toBeUndefined();
    expect(old?.problems).toEqual([]);
    expect(gameFileContent(old!.game)).not.toHaveProperty('coverArt');

    // The old free-text "cover" field stays a string and is not a cover
    const legacy = normalizeGame(
      { id: 'abcd1234', title: 'Viejo', platform: 'gc', cover: 'algo' },
      '2026-11-16',
    );
    expect(legacy?.game).toMatchObject({ cover: 'algo' });
    expect(legacy?.game.coverArt).toBeUndefined();

    const withArt = normalizeGame(
      { id: 'abcd1234', title: 'X', platform: 'gc', coverArt: good },
      '2026-11-16',
    );
    expect(gameFileContent(withArt!.game).coverArt).toEqual(good);
    const broken = normalizeGame(
      { id: 'abcd1234', title: 'X', platform: 'gc', coverArt: { source: 1 } },
      '2026-11-16',
    );
    expect(broken?.game.coverArt).toBeUndefined();
    expect(broken?.problems[0]).toContain('portada');

    // «Ninguna»: an ISO time or nothing
    const none = normalizeGame(
      { id: 'abcd1234', title: 'X', platform: 'gc', coverNone: '2026-11-16T05:00:00.000Z' },
      '2026-11-16',
    );
    expect(gameFileContent(none!.game).coverNone).toBe('2026-11-16T05:00:00.000Z');
    const odd = normalizeGame(
      { id: 'abcd1234', title: 'X', platform: 'gc', coverNone: 'sí' },
      '2026-11-16',
    );
    expect(odd?.game.coverNone).toBeUndefined();
    expect(gameFileContent(odd!.game)).not.toHaveProperty('coverNone');
  });
});

describe('coleccion: box or loose, per console', () => {
  it('old cartridges loose; modern handhelds and disc consoles boxed', () => {
    for (const id of [
      'a2600',
      'nes',
      'snes',
      'gb',
      'gbc',
      'gba',
      'n64',
      'genesis',
      'vboy',
      'ngpc',
      'jaguar',
      '32x',
    ])
      expect(defaultCondition(id), id).toBe('suelto');
    for (const id of [
      'ds',
      '3ds',
      'psvita',
      'switch',
      'switch2',
      'ps1',
      'gc',
      'wii',
      'segacd',
      'pc',
      'xsx',
    ])
      expect(defaultCondition(id), id).toBe('completo');
    expect(defaultCondition('nada')).toBe('completo');
    // Every console has one
    for (const p of PLATFORMS) expect(['suelto', 'completo']).toContain(defaultCondition(p.id));
  });

  it("a game says its own condition; empty means its console's", () => {
    expect(shownCondition({ condition: '', platform: 'nes' })).toBe('suelto');
    expect(shownCondition({ condition: '', platform: '3ds' })).toBe('completo');
    expect(shownCondition({ condition: 'suelto', platform: '3ds' })).toBe('suelto');
    expect(shownCondition({ condition: 'sellado', platform: 'nes' })).toBe('sellado');
  });
});
