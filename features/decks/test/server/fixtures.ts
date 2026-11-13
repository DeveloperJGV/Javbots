// A tiny stand-in for YGOPRODeck: the shape of the real cardinfo.php answer with a handful of cards. Texts are
// placeholders on purpose (no card texts in the repo); prices, sets and URLs are dropped like the real trim does.

const img = (id: number) => ({
  id,
  image_url: `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
  image_url_small: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
  image_url_cropped: `https://images.ygoprodeck.com/images/cards_cropped/${id}.jpg`,
});

const DESC = 'Placeholder text for tests.';

export const SAMPLE_CARDS = [
  {
    id: 89631139,
    name: 'Blue-Eyes White Dragon',
    type: 'Normal Monster',
    frameType: 'normal',
    desc: DESC,
    race: 'Dragon',
    atk: 3000,
    def: 2500,
    level: 8,
    attribute: 'LIGHT',
    archetype: 'Blue-Eyes',
    card_sets: [{ set_name: 'x', set_price: '1' }],
    card_prices: [{ tcgplayer_price: '1' }],
    card_images: [img(89631139)],
  },
  {
    id: 46986414,
    name: 'Dark Magician',
    type: 'Normal Monster',
    frameType: 'normal',
    desc: DESC,
    race: 'Spellcaster',
    atk: 2500,
    def: 2100,
    level: 7,
    attribute: 'DARK',
    card_images: [img(46986414), img(36996508)],
  },
  {
    id: 23771716,
    name: '7 Colored Fish',
    type: 'Normal Monster',
    frameType: 'normal',
    desc: DESC,
    race: 'Fish',
    atk: 1800,
    def: 800,
    level: 4,
    attribute: 'WATER',
    card_images: [img(23771716)],
  },
  {
    id: 55144522,
    name: 'Pot of Greed',
    type: 'Spell Card',
    frameType: 'spell',
    desc: DESC,
    race: 'Normal',
    banlist_info: { ban_tcg: 'Forbidden', ban_ocg: 'Forbidden' },
    card_images: [img(55144522)],
  },
  {
    id: 44095762,
    name: 'Mirror Force',
    type: 'Trap Card',
    frameType: 'trap',
    desc: DESC,
    race: 'Normal',
    banlist_info: { ban_tcg: 'Limited' },
    card_images: [img(44095762)],
  },
  {
    id: 23995346,
    name: 'Blue-Eyes Ultimate Dragon',
    type: 'Fusion Monster',
    frameType: 'fusion',
    desc: DESC,
    race: 'Dragon',
    atk: 4500,
    def: 3800,
    level: 12,
    attribute: 'LIGHT',
    archetype: 'Blue-Eyes',
    card_images: [img(23995346)],
  },
  {
    id: 1861629,
    name: 'Decode Talker',
    type: 'Link Monster',
    frameType: 'link',
    desc: DESC,
    race: 'Cyberse',
    atk: 2300,
    def: null,
    level: null,
    attribute: 'DARK',
    linkval: 3,
    card_images: [img(1861629)],
  },
  {
    id: 300101001,
    name: 'Some Skill',
    type: 'Skill Card',
    frameType: 'skill',
    desc: DESC,
    race: 'Someone',
    card_images: [img(300101001)],
  },
  {
    id: 1000001,
    name: 'Some Token',
    type: 'Token',
    frameType: 'token',
    desc: DESC,
    race: 'Fiend',
    card_images: [img(1000001)],
  },
];

export const SAMPLE_DB_VERSION = [{ database_version: '1.00', last_update: '2026-11-01 00:00:00' }];

/** A fetch double: answers YGOPRODeck URLs from the sample and records every request. */
export function fakeYgo(opts: { version?: string; failCardinfo?: boolean } = {}) {
  const requests: string[] = [];
  let version = opts.version ?? '1.00';
  let failCardinfo = opts.failCardinfo ?? false;
  const fetcher = (async (input: unknown) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('checkDBVer.php'))
      return new Response(
        JSON.stringify([{ ...SAMPLE_DB_VERSION[0], database_version: version }]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    if (url.includes('cardinfo.php')) {
      if (failCardinfo) return new Response('down', { status: 503 });
      return new Response(JSON.stringify({ data: SAMPLE_CARDS }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('https://images.ygoprodeck.com/'))
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return {
    fetcher,
    requests,
    setVersion: (v: string) => (version = v),
    setFailCardinfo: (v: boolean) => (failCardinfo = v),
  };
}
