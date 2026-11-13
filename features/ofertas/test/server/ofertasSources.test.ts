/**
 * The price watch sources against trimmed real answers (features/ofertas/test/muestras). No network: every source
 * gets a fetch double. The Mercado Libre sample is hand-written from the public API docs, not captured (the API
 * answers 403 without a token).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { parsePrice } from '../../server/vigia/sources/http.js';
import { createSources, storeLinks } from '../../server/vigia/sources/index.js';
import type { OfertasKeys, Source, SourceOptions } from '../../server/vigia/types.js';
import { SourceBlocked } from '../../server/vigia/types.js';

const SAMPLES = path.join(__dirname, '..', 'muestras');
const QUERY = 'audifonos bluetooth';

function sample(name: string): string {
  return fs.readFileSync(path.join(SAMPLES, name), 'utf8');
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fetch double: answers by URL (first matching prefix), records every call. */
function fakeFetch(routes: Array<[string, () => Response]>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) throw new Error(`unexpected request ${url}`);
    return route[1]();
  };
  return { fetch: fn as typeof fetch, calls };
}

const ok =
  (body: string, status = 200): (() => Response) =>
  () =>
    new Response(body, { status });

function source(id: string, opts: SourceOptions): Source {
  const found = createSources(opts).find((s) => s.id === id);
  if (!found) throw new Error(`no source ${id}`);
  return found;
}

async function searchWith(id: string, body: string, status = 200) {
  const { fetch, calls } = fakeFetch([['https://', ok(body, status)]]);
  const answer = await source(id, { fetch }).search(QUERY);
  return { answer, calls };
}

describe('createSources', () => {
  it('lists the automatic sources in order, with unique ids', () => {
    const ids = createSources().map((s) => s.id);
    expect(ids).toEqual([
      'elektra',
      'costco',
      'cyberpuerta',
      'palacio',
      'officedepot',
      'walmart',
      'amazon',
      'promodescuentos',
      'mercadolibre',
    ]);
  });

  it('marks the page readers as fragile and spaces Walmart and Amazon out', () => {
    const byId = new Map(createSources().map((s) => [s.id, s]));
    expect(byId.get('elektra')?.fragile).toBe(false);
    expect(byId.get('costco')?.fragile).toBe(false);
    expect(byId.get('mercadolibre')?.fragile).toBe(false);
    for (const id of [
      'cyberpuerta',
      'palacio',
      'officedepot',
      'walmart',
      'amazon',
      'promodescuentos',
    ]) {
      expect(byId.get(id)?.fragile).toBe(true);
    }
    expect(byId.get('walmart')?.minIntervalMs).toBe(3 * 60 * 60 * 1000);
    expect(byId.get('amazon')?.minIntervalMs).toBe(6 * 60 * 60 * 1000);
    expect(byId.get('amazon')?.access).toMatch(/no permite lectura automática/);
  });

  it('gives every source a human search link with the query encoded', () => {
    for (const s of createSources()) {
      const url = s.searchUrl('audífonos & más');
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toContain(' ');
      expect(url).not.toContain('&más');
    }
  });
});

describe('Elektra (VTEX)', () => {
  it('reads products, the default seller and its offer', async () => {
    const { answer, calls } = await searchWith('elektra', sample('elektra.json'));
    expect(calls[0].url).toBe(
      'https://www.elektra.mx/api/catalog_system/pub/products/search?ft=audifonos%20bluetooth&_from=0&_to=19',
    );
    expect(answer.offers).toHaveLength(4);
    const first = answer.offers[0];
    expect(first).toMatchObject({
      sourceId: 'elektra',
      store: 'Elektra',
      id: '1300371479',
      title: 'Audífonos Bluetooth EDIFIER',
      price: 1979,
      listPrice: 2479,
      brand: 'EDIFIER',
      seller: 'WSI',
      official: false,
      url: 'https://www.elektra.mx/audifonos-bluetooth-edifier-1300371479/p',
    });
    expect(first.image).toMatch(/^https:\/\//);
  });

  it('drops products without stock or price and marks the store seller as official', async () => {
    const products = JSON.parse(sample('elektra.json')) as Array<Record<string, any>>;
    products[0].items[0].sellers[0].commertialOffer.AvailableQuantity = 0;
    products[1].items[0].sellers[0].commertialOffer.Price = 0;
    products[2].items[0].sellers = [
      {
        sellerId: '1',
        sellerName: 'Elektra',
        sellerDefault: true,
        commertialOffer: { Price: 500, AvailableQuantity: 3 },
      },
    ];
    const { answer } = await searchWith('elektra', JSON.stringify(products));
    expect(answer.offers.map((o) => o.price)).toEqual([500, 1829]);
    expect(answer.offers[0].official).toBe(true);
  });
});

describe('Costco', () => {
  it('reads products with absolute links and images', async () => {
    const { answer, calls } = await searchWith('costco', sample('costco.json'));
    expect(calls[0].url).toContain('/rest/v2/mexico/products/search?query=audifonos%20bluetooth');
    expect(answer.offers).toHaveLength(4);
    expect(answer.offers[0]).toMatchObject({
      id: '692827',
      title: 'Xbox Audífonos Bluetooth',
      price: 2499,
      official: true,
      url: 'https://www.costco.com.mx/Electronicos/Videojuegos/Accesorios-para-Videojuegos/Xbox-Audifonos-Bluetooth/p/692827',
    });
    expect(answer.offers[0].listPrice).toBeUndefined();
    expect(answer.offers[0].image).toMatch(/^https:\/\/www\.costco\.com\.mx\/medias\//);
  });
});

describe('schema.org pages (Cyberpuerta, El Palacio de Hierro, Office Depot)', () => {
  it('Cyberpuerta: @graph → ItemList → item', async () => {
    const { answer } = await searchWith('cyberpuerta', sample('cyberpuerta.html'));
    expect(answer.offers).toHaveLength(4);
    expect(answer.offers[0]).toMatchObject({
      store: 'Cyberpuerta',
      price: 1609,
      official: true,
      seller: 'Cyberpuerta',
    });
    expect(answer.offers[0].title).toMatch(/^Alienware Audífonos Gamer/);
    expect(answer.offers[0].url).toMatch(/^https:\/\/www\.cyberpuerta\.mx\/.+\.html$/);
  });

  it('El Palacio de Hierro: AggregateOffer lowPrice', async () => {
    const { answer } = await searchWith('palacio', sample('palacio.html'));
    expect(answer.offers.length).toBeGreaterThanOrEqual(3);
    expect(answer.offers[0]).toMatchObject({
      title: 'Audifonos Inalambricos Bluetooth Sony ULT Wear Negro',
      price: 2399.46,
      brand: 'Sony',
      url: 'https://www.elpalaciodehierro.com/sony-audifonos-inalambricos-bluetooth-sony-ult-wear-negro-43882624.html',
    });
  });

  it('Office Depot: CollectionPage.mainEntity with Products, without the :443', async () => {
    const { answer } = await searchWith('officedepot', sample('officedepot.html'));
    expect(answer.offers.length).toBeGreaterThanOrEqual(3);
    expect(answer.offers[0]).toMatchObject({
      id: '100287441',
      title: 'Apple AirPods Pro 3ra Generación Blanco',
      price: 5799,
      brand: 'APPLE',
    });
    expect(answer.offers[0].url).toMatch(/^https:\/\/www\.officedepot\.com\.mx\/Categor/);
    expect(answer.offers[0].url).not.toContain(':443');
  });

  it('a page without the product list is an error, a captcha page is a block', async () => {
    await expect(searchWith('cyberpuerta', '<html><body>Hola</body></html>')).rejects.toThrow(
      /cambió/,
    );
    await expect(
      searchWith('palacio', '<html><body><div id="px-captcha"></div></body></html>'),
    ).rejects.toBeInstanceOf(SourceBlocked);
  });
});

describe('Walmart', () => {
  it('reads __NEXT_DATA__, skips sponsored items and keeps the "before" price', async () => {
    const { answer, calls } = await searchWith('walmart', sample('walmart.html'));
    expect(calls[0].url).toBe('https://www.walmart.com.mx/search?q=audifonos%20bluetooth');
    // 6 items in the sample, the first 2 sponsored.
    expect(answer.offers).toHaveLength(4);
    expect(answer.offers[0]).toMatchObject({ price: 179, seller: 'Walmart', official: true });
    expect(answer.offers[0].url).toMatch(/^https:\/\/www\.walmart\.com\.mx\/ip\//);
    expect(answer.offers[1]).toMatchObject({ price: 269, listPrice: 299 });
    const reseller = answer.offers.find((o) => o.seller === 'Compuprice Mx');
    expect(reseller?.official).toBe(false);
  });

  it('a captcha page or a page without results is a block', async () => {
    await expect(
      searchWith(
        'walmart',
        '<html><body><h1>Robot or human?</h1><div id="px-captcha"></div></body></html>',
      ),
    ).rejects.toBeInstanceOf(SourceBlocked);
    await expect(searchWith('walmart', '<html><body></body></html>')).rejects.toBeInstanceOf(
      SourceBlocked,
    );
  });
});

describe('Amazon', () => {
  it('reads organic results: title, price, struck "before" price, /dp link', async () => {
    const { answer } = await searchWith('amazon', sample('amazon.html'));
    expect(answer.offers).toHaveLength(4);
    expect(answer.offers[0]).toMatchObject({
      id: 'B0DBHRWRKC',
      title: 'XIAOMI Redmi Buds 6 Play, Negro',
      price: 199,
      official: false,
      url: 'https://www.amazon.com.mx/dp/B0DBHRWRKC',
    });
    // The installments amount ($49.75 x 4) is not a "before" price.
    expect(answer.offers[0].listPrice).toBeUndefined();
    expect(answer.offers[1]).toMatchObject({ id: 'B0DN45YMP6', price: 639, listPrice: 1299 });
    expect(answer.offers[0].image).toMatch(/^https:\/\/m\.media-amazon\.com\//);
  });

  it('skips a card marked as sponsored', async () => {
    const html = sample('amazon.html').replace(
      'data-asin="B0DBHRWRKC" data-index="3" data-component-type="s-search-result" class="s-result-item s-asin">',
      'data-asin="B0DBHRWRKC" data-index="3" data-component-type="s-search-result" class="s-result-item s-asin AdHolder">',
    );
    const { answer } = await searchWith('amazon', html);
    expect(answer.offers.map((o) => o.id)).not.toContain('B0DBHRWRKC');
  });

  it('503 and the captcha page are blocks', async () => {
    await expect(searchWith('amazon', 'Service Unavailable', 503)).rejects.toBeInstanceOf(
      SourceBlocked,
    );
    const captcha =
      '<html><body><h4>Enter the characters you see below</h4>' +
      '<p>api-services-support@amazon.com</p></body></html>';
    await expect(searchWith('amazon', captcha)).rejects.toBeInstanceOf(SourceBlocked);
  });
});

describe('Promodescuentos', () => {
  it('reads community deals from data-vue3, not offers', async () => {
    const { answer } = await searchWith('promodescuentos', sample('promodescuentos.html'));
    expect(answer.offers).toEqual([]);
    expect(answer.deals).toHaveLength(4);
    expect(answer.deals[0]).toEqual({
      id: '1206828',
      title: 'AliExpress: X15 TWS Audífonos Inalámbricos Bluetooth',
      price: 117,
      merchant: 'AliExpress',
      temperature: -64.36,
      url: 'https://www.promodescuentos.com/ofertas/x15-tws-audifonos-inalambricos-bluetooth-1206828',
      publishedAt: new Date(1794368174 * 1000).toISOString(),
      expired: false,
    });
  });
});

describe('Mercado Libre', () => {
  const ML_SEARCH = 'https://api.mercadolibre.com/sites/MLM/search';
  const ML_TOKEN = 'https://api.mercadolibre.com/oauth/token';

  it('is not ready without a key', () => {
    expect(source('mercadolibre', {}).ready()).toBe(false);
    expect(
      source('mercadolibre', { keys: () => ({ mercadolibre: { clientId: 'abc' } }) }).ready(),
    ).toBe(false);
    expect(
      source('mercadolibre', { keys: () => ({ mercadolibre: { accessToken: 'tok' } }) }).ready(),
    ).toBe(true);
  });

  it('with client id + secret asks for a token once, then searches with it', async () => {
    const { fetch, calls } = fakeFetch([
      [
        ML_TOKEN,
        ok(
          JSON.stringify({
            access_token: 'APP_USR-token',
            token_type: 'Bearer',
            expires_in: 21600,
          }),
        ),
      ],
      [ML_SEARCH, ok(sample('mercadolibre.json'))],
    ]);
    const keys = (): OfertasKeys => ({
      mercadolibre: { clientId: 'id-1', clientSecret: 'secret-1' },
    });
    const ml = source('mercadolibre', { fetch, keys });
    expect(ml.ready()).toBe(true);
    const answer = await ml.search(QUERY);
    await ml.search(QUERY);

    const tokenCalls = calls.filter((c) => c.url === ML_TOKEN);
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].init?.method).toBe('POST');
    expect(String(tokenCalls[0].init?.body)).toBe(
      'grant_type=client_credentials&client_id=id-1&client_secret=secret-1',
    );
    const searchCall = calls.find((c) => c.url.startsWith(ML_SEARCH));
    expect(searchCall?.url).toBe(`${ML_SEARCH}?q=audifonos%20bluetooth&limit=20`);
    expect((searchCall?.init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer APP_USR-token',
    );

    expect(answer.offers).toHaveLength(2);
    expect(answer.offers[0]).toMatchObject({
      id: 'MLM1000000001',
      price: 349.5,
      listPrice: 499,
      official: true,
      seller: 'Marca Ejemplo',
      freeShipping: true,
    });
    expect(answer.offers[0].image).toMatch(/^https:/);
    expect(answer.offers[1]).toMatchObject({ official: false, seller: 'VENDEDOR.EJEMPLO' });
    expect(answer.offers[1].listPrice).toBeUndefined();
  });

  it('a refused key is a plain error with a clear message', async () => {
    const { fetch } = fakeFetch([[ML_SEARCH, ok('{"message":"forbidden"}', 403)]]);
    const ml = source('mercadolibre', {
      fetch,
      keys: () => ({ mercadolibre: { accessToken: 'bad' } }),
    });
    const err = await ml.search(QUERY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SourceBlocked);
    expect((err as Error).message).toBe('Mercado Libre rechazó la llave');
  });
});

describe('common rules', () => {
  it('429 is a block on any source; 500 is a plain error', async () => {
    await expect(searchWith('costco', 'Too many', 429)).rejects.toBeInstanceOf(SourceBlocked);
    const err = await searchWith('elektra', 'boom', 500).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SourceBlocked);
  });

  it('sends a generic browser User-Agent and Spanish, nothing else about the person', async () => {
    const { calls } = await searchWith('costco', sample('costco.json'));
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0 /);
    expect(headers['Accept-Language']).toBe('es-MX,es;q=0.9');
    expect(Object.keys(headers).sort()).toEqual(['Accept', 'Accept-Language', 'User-Agent']);
  });

  it('caps each source at 20 offers', async () => {
    const products = JSON.parse(sample('costco.json')) as { products: unknown[] };
    const many = {
      products: Array.from({ length: 30 }, (_, i) => ({
        ...(products.products[0] as object),
        code: `c${i}`,
      })),
    };
    const { answer } = await searchWith('costco', JSON.stringify(many));
    expect(answer.offers).toHaveLength(20);
  });

  it('parses Mexican price strings', () => {
    expect(parsePrice('$1,234.50')).toBe(1234.5);
    expect(parsePrice('1299.0')).toBe(1299);
    expect(parsePrice(749)).toBe(749);
    expect(parsePrice('')).toBeUndefined();
    expect(parsePrice(0)).toBeUndefined();
  });
});

describe('storeLinks', () => {
  it('links the stores that are not read, with the query encoded', () => {
    const links = storeLinks('audífonos bluetooth');
    expect(links.map((l) => l.name)).toEqual([
      'Liverpool',
      'Coppel',
      "Sam's Club",
      'Sears',
      'DDTech',
      'RadioShack',
      'Mercado Libre',
    ]);
    const byName = new Map(links.map((l) => [l.name, l.url]));
    expect(byName.get('Liverpool')).toBe(
      'https://www.liverpool.com.mx/tienda?s=aud%C3%ADfonos%20bluetooth',
    );
    expect(byName.get('DDTech')).toBe('https://ddtech.mx/buscar/aud%C3%ADfonos%20bluetooth');
    expect(byName.get('Mercado Libre')).toBe(
      'https://listado.mercadolibre.com.mx/aud%C3%ADfonos-bluetooth',
    );
    expect(storeLinks('a&b=c').every((l) => !l.url.includes('a&b=c'))).toBe(true);
  });
});
