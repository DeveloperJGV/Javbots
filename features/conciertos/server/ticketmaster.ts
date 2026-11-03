import {
  FETCH_TIMEOUT_MS,
  TICKETMASTER_COUNTRY,
  TICKETMASTER_EVENTS_URL,
  TICKETMASTER_GAP_MS,
} from './constants.js';
import type { Fetcher } from './googleCalendar.js';

/** A concert on sale in Mexico (Ticketmaster México sells OCESA's). */
export interface FoundConcert {
  id: string;
  artist: string;
  name: string;
  /** YYYY-MM-DD, plus THH:MM:SS when the time is known (local to the venue). */
  start: string;
  allDay: boolean;
  venue?: string;
  city?: string;
  url?: string;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Letters only, no accents or case: "Daft Punk" matches "DaftPunk". */
export const normalizeName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Discovery API events → this artist's concerts. A keyword search also returns tributes and festivals that only
 * mention the name, so an event counts when one of its attractions IS the artist (or, without attractions, when
 * its name contains it).
 */
export function parseTicketmasterEvents(raw: unknown, artist: string): FoundConcert[] {
  const want = normalizeName(artist);
  if (!want) return [];
  const out: FoundConcert[] = [];
  for (const item of arr(obj(obj(raw)._embedded).events)) {
    const e = obj(item);
    const embedded = obj(e._embedded);
    const attractions = arr(embedded.attractions).map((a) => normalizeName(str(obj(a).name)));
    const matches = attractions.length
      ? attractions.includes(want)
      : normalizeName(str(e.name)).includes(want);
    const date = obj(obj(e.dates).start);
    const day = str(date.localDate);
    if (!matches || !day) continue;
    const time = str(date.localTime);
    const venue = obj(arr(embedded.venues)[0]);
    const concert: FoundConcert = {
      id: str(e.id),
      artist,
      name: str(e.name),
      start: time ? `${day}T${time}` : day,
      allDay: !time,
    };
    if (str(venue.name)) concert.venue = str(venue.name);
    if (str(obj(venue.city).name)) concert.city = str(obj(venue.city).name);
    if (str(e.url)) concert.url = str(e.url);
    out.push(concert);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Each artist's upcoming concerts in Mexico, one artist at a time (the free tier is rate limited). */
export async function searchConcerts(
  apiKey: string,
  artists: string[],
  opts: { fetcher?: Fetcher; gapMs?: number } = {},
): Promise<FoundConcert[]> {
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const seen = new Set<string>();
  const out: FoundConcert[] = [];
  for (const [i, artist] of artists.entries()) {
    if (i > 0) await sleep(opts.gapMs ?? TICKETMASTER_GAP_MS);
    const q = new URLSearchParams({
      apikey: apiKey,
      keyword: artist,
      countryCode: TICKETMASTER_COUNTRY,
      classificationName: 'music',
      sort: 'date,asc',
      size: '20',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetcher(`${TICKETMASTER_EVENTS_URL}?${q.toString()}`, {
        headers: {},
        signal: controller.signal,
      });
      if (res.status === 401) throw new Error('ticketmaster: llave inválida');
      if (!res.ok) continue;
      for (const c of parseTicketmasterEvents(await res.json(), artist)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
