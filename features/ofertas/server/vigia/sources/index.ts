/**
 * Every place the price watch searches. Automatic sources first (stable JSON before fragile pages), then the stores
 * that are only linked: they block automated visits or need their page to run, so a person opens their search.
 */
import { TEXT } from '../constants.js';
import type { Source, SourceOptions, StoreLink } from '../types.js';
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
 * "Disallow: /search", Cyberpuerta "Disallow: /index.php?cl=search"). They stay as code, so the day a store allows it
 * only this list changes, but the watch never asks them: the panel gives their search as a link.
 */
export const ROBOTS_LINK_ONLY: readonly string[] = ['walmart', 'promodescuentos', 'cyberpuerta'];

const linkOnly = (s: Source): Source =>
  ROBOTS_LINK_ONLY.includes(s.id) ? { ...s, linkOnly: TEXT.robotsLinkOnly } : s;

export function createSources(opts: SourceOptions = {}): Source[] {
  return allSources(opts).map(linkOnly);
}

function allSources(opts: SourceOptions): Source[] {
  return [
    vtexSource({ id: 'elektra', name: 'Elektra', host: 'www.elektra.mx' }, opts),
    costcoSource(opts),
    ldJsonSource(
      {
        id: 'cyberpuerta',
        name: 'Cyberpuerta',
        url: (query) => `https://www.cyberpuerta.mx/index.php?cl=search&searchparam=${q(query)}`,
      },
      opts,
    ),
    ldJsonSource(
      {
        id: 'palacio',
        name: 'El Palacio de Hierro',
        url: (query) => `https://www.elpalaciodehierro.com/buscar?q=${q(query)}`,
      },
      opts,
    ),
    ldJsonSource(
      {
        id: 'officedepot',
        name: 'Office Depot',
        url: (query) => `https://www.officedepot.com.mx/officedepot/en/search/?text=${q(query)}`,
      },
      opts,
    ),
    walmartSource(opts),
    amazonSource(opts),
    promodescuentosSource(opts),
    mercadolibreSource(opts),
  ];
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
