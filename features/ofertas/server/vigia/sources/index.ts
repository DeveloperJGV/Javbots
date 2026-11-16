/**
 * Every place the price watch searches. Automatic sources first (stable JSON before fragile pages), then the stores
 * that are only linked: they block automated visits or need their page to run, so a person opens their search.
 */
import { NAVEGADOR_HOSTS, TEXT } from '../constants.js';
import type { BrowserReader, Source, SourceOptions, StoreLink } from '../types.js';
import { SourceReadError } from '../types.js';
import { amazonSource } from './amazon.js';
import { costcoSource } from './costco.js';
import { ldJsonSource } from './ldJson.js';
import { mercadolibreSource, slugQuery } from './mercadolibre.js';
import { promodescuentosSource } from './promodescuentos.js';
import { vtexSource } from './vtex.js';
import { walmartSource } from './walmart.js';

const q = encodeURIComponent;

/**
 * Sources whose robots.txt disallows the search page they read (checked 2026-11-16: Walmart and Promodescuentos
 * "Disallow: /search", Cyberpuerta "Disallow: /index.php?cl=search"). By default the watch never asks them: the
 * panel gives their search as a link. The person may turn one on, store by store, and then it is read only with the
 * browser (never with a plain request); the panel keeps saying that its robots.txt does not allow it.
 */
export const ROBOTS_LINK_ONLY: readonly string[] = ['walmart', 'promodescuentos', 'cyberpuerta'];

/** Every reader, in order, built with the options given (one factory per store). */
const FACTORIES: ReadonlyArray<(opts: SourceOptions) => Source> = [
  (o) => vtexSource({ id: 'elektra', name: 'Elektra', host: 'www.elektra.mx' }, o),
  (o) => costcoSource(o),
  (o) =>
    ldJsonSource(
      {
        id: 'cyberpuerta',
        name: 'Cyberpuerta',
        url: (query) => `https://www.cyberpuerta.mx/index.php?cl=search&searchparam=${q(query)}`,
      },
      o,
    ),
  (o) =>
    ldJsonSource(
      {
        id: 'palacio',
        name: 'El Palacio de Hierro',
        url: (query) => `https://www.elpalaciodehierro.com/buscar?q=${q(query)}`,
      },
      o,
    ),
  (o) =>
    ldJsonSource(
      {
        id: 'officedepot',
        name: 'Office Depot',
        url: (query) => `https://www.officedepot.com.mx/officedepot/en/search/?text=${q(query)}`,
      },
      o,
    ),
  (o) => walmartSource(o),
  (o) => amazonSource(o),
  (o) => promodescuentosSource(o),
  (o) => mercadolibreSource(o),
];

/** The bare readers, without the robots rule nor the browser (the tests of each reader use these). */
export function readers(opts: SourceOptions = {}): Source[] {
  return FACTORIES.map((make) => make(opts));
}

/**
 * One store as the watch sees it. Each call reads the way the watch says (how.browser), which it decides from the
 * settings on every call: the browser's own reader (a fetch that only opens this store's hosts) or the plain one. A
 * robots store without the browser refuses: it is never read with a plain request.
 */
function asWatched(
  make: (opts: SourceOptions) => Source,
  opts: SourceOptions,
  lector: BrowserReader | undefined,
): Source {
  const plain = make(opts);
  const robots = ROBOTS_LINK_ONLY.includes(plain.id);
  const hosts = NAVEGADOR_HOSTS[plain.id];
  const viaBrowser = lector && hosts ? make({ ...opts, fetch: lector.fetchFor(hosts) }) : undefined;
  const source: Source = {
    id: plain.id,
    name: plain.name,
    fragile: plain.fragile,
    access: plain.access,
    ready: () => plain.ready(),
    searchUrl: (query) => plain.searchUrl(query),
    search(query, signal, how) {
      if (how?.browser && viaBrowser) return viaBrowser.search(query, signal);
      if (robots) return Promise.reject(new SourceReadError(TEXT.robotsLinkOnly));
      return plain.search(query, signal);
    },
  };
  return {
    ...source,
    ...(plain.minIntervalMs !== undefined ? { minIntervalMs: plain.minIntervalMs } : {}),
    ...(robots ? { linkOnly: TEXT.robotsLinkOnly } : {}),
    ...(viaBrowser && lector ? { browser: lector } : {}),
  };
}

export function createSources(opts: SourceOptions = {}): Source[] {
  return FACTORIES.map((make) => asWatched(make, opts, opts.navegador));
}

export function storeLinks(query: string): StoreLink[] {
  return [
    { name: 'Liverpool', url: `https://www.liverpool.com.mx/tienda?s=${q(query)}` },
    { name: 'Coppel', url: `https://www.coppel.com/SearchDisplay?searchTerm=${q(query)}` },
    { name: "Sam's Club", url: `https://www.sams.com.mx/search?q=${q(query)}` },
    { name: 'Sears', url: `https://www.sears.com.mx/resultados/q=${q(query)}` },
    { name: 'DDTech', url: `https://ddtech.mx/buscar/${q(query)}` },
    {
      name: 'RadioShack',
      url: `https://www.radioshack.com.mx/store/radioshack/en/search/?text=${q(query)}`,
    },
    { name: 'Mercado Libre', url: `https://listado.mercadolibre.com.mx/${slugQuery(query)}` },
  ];
}
