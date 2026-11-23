import { cleanText } from '../../coleccion/core/game.js';
import { fold } from '../../coleccion/core/shelves.js';
import {
  PEOPLE_COUNT_MAX,
  PEOPLE_MAX,
  TITLE_MAX,
  VOLUME_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from './constants.js';

/**
 * One series as AniList has it (outside text: shown as text only, and put in the form only when the person says
 * so). AniList covers manga, manhwa and manhua; Western comics are not there.
 */
export interface AniDoc {
  id: string;
  title: string;
  /** The other title (romaji when the main one is English, or the other way). */
  altTitle: string;
  writers: string[];
  /** Empty when the same people wrote and drew it. */
  artists: string[];
  /** 0 when AniList does not say (a series still coming out often does not). */
  volumes: number;
  finished: boolean;
  year: number;
  genres: string[];
  /** Its cover image, only when it is on AniList's own image host. */
  coverUrl: string;
}

/** The GraphQL query sent to https://graphql.anilist.co (a POST with this and the title as `s`). */
export const ANILIST_QUERY =
  'query($s:String){Page(perPage:6){media(search:$s,type:MANGA){id title{romaji english} format status volumes startDate{year} genres staff(perPage:8){edges{role node{name{full}}}} coverImage{extraLarge large}}}}';

/** Only AniList's image host, over https. */
export const ANILIST_IMAGE_PATTERN =
  /^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/manga\/cover\/[a-z]+\/[A-Za-z0-9_.-]+$/;

const line = (v: unknown, max: number) =>
  cleanText(typeof v === 'string' ? v.replace(/\s+/g, ' ') : '', max);

/** AniList's search answer, cleaned: the manga found, in its order. */
export function parseAniList(raw: unknown): AniDoc[] {
  const media = (raw as { data?: { Page?: { media?: unknown } } } | null)?.data?.Page?.media;
  if (!Array.isArray(media)) return [];
  const out: AniDoc[] = [];
  for (const m of media.slice(0, 10)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const t = (r.title ?? {}) as Record<string, unknown>;
    const english = line(t.english, TITLE_MAX);
    const romaji = line(t.romaji, TITLE_MAX);
    const title = english || romaji;
    const id = typeof r.id === 'number' && Number.isInteger(r.id) && r.id > 0 ? String(r.id) : '';
    if (!title || !id) continue;
    const writers: string[] = [];
    const artists: string[] = [];
    const edges = ((r.staff as { edges?: unknown } | undefined)?.edges ?? []) as unknown[];
    for (const e of Array.isArray(edges) ? edges : []) {
      const role = line((e as { role?: unknown })?.role, 80).toLowerCase();
      const name = line(
        (e as { node?: { name?: { full?: unknown } } })?.node?.name?.full,
        PEOPLE_MAX,
      );
      if (!name || role.includes('translat') || role.includes('letter') || role.includes('assist'))
        continue;
      const story = /story|original|writer|script/.test(role);
      const art = /\bart\b|illustrat/.test(role);
      if (story && !writers.includes(name)) writers.push(name);
      if (art && !story && !artists.includes(name)) artists.push(name);
    }
    const volumes = typeof r.volumes === 'number' ? Math.round(r.volumes) : 0;
    const year = Number((r.startDate as { year?: unknown } | undefined)?.year) || 0;
    const cover = (r.coverImage ?? {}) as Record<string, unknown>;
    const url = [cover.extraLarge, cover.large].find(
      (u): u is string => typeof u === 'string' && ANILIST_IMAGE_PATTERN.test(u),
    );
    out.push({
      id,
      title,
      altTitle: english && romaji && fold(english) !== fold(romaji) ? romaji : '',
      writers: writers.slice(0, PEOPLE_COUNT_MAX),
      artists: artists.slice(0, PEOPLE_COUNT_MAX),
      volumes: volumes > 0 && volumes <= VOLUME_MAX ? volumes : 0,
      finished: r.status === 'FINISHED',
      year: year >= YEAR_MIN && year <= YEAR_MAX ? year : 0,
      genres: (Array.isArray(r.genres) ? r.genres : [])
        .map((g) => line(g, 40))
        .filter(Boolean)
        .slice(0, 6),
      coverUrl: url ?? '',
    });
  }
  return out;
}

/** How much an AniList result looks like the series: same title (either one) 1, one inside the other 0.75. */
export function aniScore(title: string, doc: Pick<AniDoc, 'title' | 'altTitle'>): number {
  const a = fold(title);
  if (!a) return 0;
  const names = [doc.title, doc.altTitle].map(fold).filter(Boolean);
  if (names.includes(a)) return 1;
  if (names.some((n) => n.includes(a) || a.includes(n))) return 0.75;
  return 0;
}
