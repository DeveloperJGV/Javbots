import type { Region } from './types.js';

/**
 * Finding a game's cover among a source's names (libretro file names such as
 * "Legend of Zelda, The - A Link to the Past (USA, Europe) (En,Fr,De).png", or plain game names). Pure: no Node, no DOM.
 *
 * A match is "found" only when the whole title is equal to a name's base once both are normalized; anything looser
 * (a subtitle left out, one title inside the other, most words in common) only proposes candidates for the person
 * to choose from. Never a doubtful cover put in silence.
 */

/** Roman numerals I to XX, as digits. */
const ROMAN: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'i',
    'ii',
    'iii',
    'iv',
    'v',
    'vi',
    'vii',
    'viii',
    'ix',
    'x',
    'xi',
    'xii',
    'xiii',
    'xiv',
    'xv',
    'xvi',
    'xvii',
    'xviii',
    'xix',
    'xx',
  ].map((r, i) => [r, String(i + 1)]),
);
/**
 * One-letter numerals ("X", "V", "I") are as often a name or a letter as a number ("Rocket Man X" is not "Rocket Man
 * 10"): they turn into digits only to propose candidates, never to call a cover found.
 */
const LONE_ROMAN = new Set(['i', 'v', 'x']);

/** How roman numerals are read: not at all, only those of two letters or more, or all of them. */
export type RomanMode = 'none' | 'multi' | 'all';
const romanMode = (r: boolean | RomanMode): RomanMode =>
  r === true ? 'all' : r === false ? 'none' : r;

/** Words that make up a region tag ("(USA, Europe)"). */
const REGION_WORDS = new Set([
  'USA',
  'Europe',
  'Japan',
  'World',
  'Asia',
  'Australia',
  'Brazil',
  'Canada',
  'China',
  'France',
  'Germany',
  'Hong Kong',
  'Italy',
  'Korea',
  'Latin America',
  'Mexico',
  'Netherlands',
  'Russia',
  'Scandinavia',
  'Spain',
  'Sweden',
  'Taiwan',
  'UK',
]);
/** Regions sold as PAL: they come right after Europe when Europe is wanted. */
const PAL_WORDS = new Set([
  'Australia',
  'France',
  'Germany',
  'Italy',
  'Netherlands',
  'Scandinavia',
  'Spain',
  'Sweden',
  'UK',
]);
/**
 * A tag that marks something that is not the retail game, wherever the word is in it ("(Store Demo)", "(Trade
 * Demo)", "(Promo)", "(Preview)", "(Trial)", "(Taikenban)", "(Club Sample)"…).
 */
const JUNK_TAG =
  /^program$|\b(unl|unlicensed|pirate|hack|aftermarket|debug|beta|demo|proto|prototype|kiosk|sample|promo|preview|trial|taikenban|not for resale)\b/i;
/** A languages tag: "(En,Fr,Es)". */
const LANGUAGES_TAG = /^[A-Z][a-z](-[A-Z][a-z])?(,[A-Z][a-z](-[A-Z][a-z])?)*$/;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A title's parts: what ":", " - ", " / ", "_" or " + " separate (libretro writes ":" as " - " or "_"). */
const segmentsOf = (folded: string): string[] =>
  folded
    .split(/\s+[-–—]\s+|:|\s*\/\s*|_|\s+\+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

function segmentTokens(segment: string, roman: RomanMode): string[] {
  let s = segment;
  // "Legend of Zelda, The" is "The Legend of Zelda"
  const article = /^(.*),\s*(the|a|an)$/.exec(s);
  if (article) s = `${article[2]} ${article[1]}`;
  const words = s
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    // "&" and "and" are the same, and libretro writes "&" as "_": the word is left out on both sides
    .filter((w) => w && w !== 'and');
  if (roman === 'none') return words;
  return words.map((w) => (roman === 'multi' && LONE_ROMAN.has(w) ? w : (ROMAN[w] ?? w)));
}

/**
 * A title as words: lower case, no accents, "&" = "and", the article at the end of a part moved to its front, no
 * punctuation, and roman numerals I to XX as digits (`true` / 'all'; 'multi': only those of two letters or more;
 * `false` / 'none': none). A leading "the" is left out.
 */
export function titleTokens(text: string, roman: boolean | RomanMode = true): string[] {
  const mode = romanMode(roman);
  const words = segmentsOf(fold(text)).flatMap((seg) => segmentTokens(seg, mode));
  if (words[0] === 'the' && words.length > 1) words.shift();
  return words;
}

/** The words of the title's first part ("Chrono" in "Chrono: The Trigger"). */
function firstPartTokens(text: string): string[] {
  const first = segmentsOf(fold(text))[0] ?? '';
  const words = segmentTokens(first, 'all');
  if (words[0] === 'the' && words.length > 1) words.shift();
  return words;
}

/** A source name taken apart. */
export interface CoverName {
  /** As the source has it (a libretro name without ".png"). */
  name: string;
  /** Before the first "(": the game's name. */
  base: string;
  /** The "(…)" tags, in order. */
  tags: string[];
  /** The region tag's words ("USA", "Europe"…), or none. */
  regions: string[];
  /** 0 = no "(Rev …)". */
  rev: number;
  /** 0 = no "(Disc …)". */
  disc: number;
  /** Tags that are not region, languages, revision or disc ("(NDSi Enhanced)", "(Bonus Disc)"). */
  extras: number;
  /** A hack, a demo, a prototype, an unlicensed copy…: never offered. */
  junk: boolean;
}

export function parseCoverName(raw: string): CoverName {
  const name = raw.replace(/\.(png|jpe?g|webp)$/i, '');
  const cut = name.indexOf('(');
  const base = (cut >= 0 ? name.slice(0, cut) : name).replace(/\[[^\]]*\]/g, '').trim();
  const tags = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  let regions: string[] = [];
  let rev = 0;
  let disc = 0;
  let extras = 0;
  // "Some Game (USA) - Not For Resale": the mark can come after the tags, outside any "(…)"
  let junk = name.includes('[') || /^action replay/i.test(base) || /not for resale/i.test(name);
  for (const tag of tags) {
    const parts = tag.split(',').map((p) => p.trim());
    if (regions.length === 0 && parts.length > 0 && parts.every((p) => REGION_WORDS.has(p))) {
      regions = parts;
      continue;
    }
    if (JUNK_TAG.test(tag)) {
      junk = true;
      continue;
    }
    const r = /^Rev (\d+|[A-Z])$/i.exec(tag);
    if (r) {
      rev = /^\d+$/.test(r[1]) ? Number(r[1]) : r[1].toUpperCase().charCodeAt(0) - 64;
      continue;
    }
    const d = /^Disc (\d+)$/i.exec(tag);
    if (d) {
      disc = Number(d[1]);
      continue;
    }
    if (LANGUAGES_TAG.test(tag)) continue;
    extras++;
  }
  return { name, base, tags, regions, rev, disc, extras, junk };
}

const PREFERRED: Record<string, string> = { 'ntsc-u': 'USA', pal: 'Europe', 'ntsc-j': 'Japan' };

/** The regions to prefer for a game: its own, then USA, Europe and Japan. */
export function regionPreference(region: Region | ''): string[] {
  const order = ['USA', 'Europe', 'Japan'];
  const first = PREFERRED[region];
  return first ? [first, ...order.filter((r) => r !== first)] : order;
}

function regionRank(regions: string[], pref: string[]): number {
  if (regions.length === 0) return pref.length * 2 + 2;
  let best = pref.length * 2 + 1;
  for (const r of regions) {
    const i = pref.indexOf(r);
    if (i >= 0) best = Math.min(best, i * 2);
    else if (r === 'World') best = Math.min(best, 1);
    else if (PAL_WORDS.has(r) && pref.includes('Europe'))
      best = Math.min(best, pref.indexOf('Europe') * 2 + 1);
  }
  return best;
}

/**
 * Which copy of the same game to take: the preferred region, then fewer extra tags, then no revision (a revised
 * printing has the same box; among revisions, the newest), then disc 1, then the name (so it is always the same).
 */
function variantOrder(pref: string[]) {
  return (a: CoverName, b: CoverName): number =>
    regionRank(a.regions, pref) - regionRank(b.regions, pref) ||
    a.extras - b.extras ||
    (a.rev === 0 ? 0 : 1000 - a.rev) - (b.rev === 0 ? 0 : 1000 - b.rev) ||
    (a.disc <= 1 ? 0 : a.disc) - (b.disc <= 1 ? 0 : b.disc) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** A name with its position in the list it came from. */
export interface CoverHit {
  index: number;
  name: string;
  /** 1 for an exact match; below for a candidate. */
  score: number;
  regions: string[];
}

export type CoverMatch =
  { kind: 'found'; hits: CoverHit[] } | { kind: 'choose'; hits: CoverHit[] } | { kind: 'none' };

/** Most candidates offered when the match is not exact. */
export const COVER_CANDIDATES_MAX = 4;
/** Below this, a name is not even a candidate. */
const CANDIDATE_MIN_SCORE = 0.3;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);

/**
 * The words run together ("Spider-Man", "Spider Man" and "Spiderman" are the same), with every number kept apart
 * ("Halo 2 3" is never "Halo 23").
 */
const compactKey = (words: readonly string[]): string =>
  words.map((w) => (/^\d+$/.test(w) ? `#${w}#` : w)).join('');

/** Same title for a cover: equal once normalized (two-letter romans as digits, words run together). */
export function sameCoverTitle(a: string, b: string): boolean {
  const x = titleTokens(a, 'multi');
  const y = titleTokens(b, 'multi');
  return x.join(' ') === y.join(' ') || compactKey(x) === compactKey(y);
}

/** True when `inner` appears in `outer` as whole consecutive words. */
function containsRun(outer: string[], inner: string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false;
  for (let i = 0; i + inner.length <= outer.length; i++)
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  return false;
}

const numbersOf = (words: string[]) => new Set(words.filter((w) => /^\d+$/.test(w)));

/** How much a name looks like the title when it is not equal (0 = not at all). */
function looseScore(title: string[], titleFirst: string[], base: string[], baseFirst: string[]) {
  let score = 0;
  if (same(base, title)) score = 0.9;
  else if (same(baseFirst, title) || same(base, titleFirst)) score = 0.8;
  else if (containsRun(base, title) || containsRun(title, base))
    score = 0.6 + (0.2 * Math.min(base.length, title.length)) / Math.max(base.length, title.length);
  else {
    const a = new Set(title);
    const b = new Set(base);
    const common = [...a].filter((w) => b.has(w)).length;
    const jaccard = common / (a.size + b.size - common || 1);
    if (jaccard >= 0.5) score = 0.6 * jaccard;
  }
  // A different number is usually a different game ("Tetris" / "Tetris 2")
  const na = numbersOf(title);
  const nb = numbersOf(base);
  if ([...na].some((n) => !nb.has(n)) || [...nb].some((n) => !na.has(n))) score *= 0.6;
  return score;
}

/**
 * The game `title` among `names` (a source's list). Found = the normalized title equal to one or more names' base
 * (best copy first, by `region`); choose = up to 4 names that only look like it; none = nothing close.
 */
export function matchCover(
  title: string,
  region: Region | '',
  names: readonly string[],
  max = COVER_CANDIDATES_MAX,
): CoverMatch {
  const pref = regionPreference(region);
  const order = variantOrder(pref);
  const plain = titleTokens(title, 'none').join(' ');
  const multi = titleTokens(title, 'multi');
  const multiKey = multi.join(' ');
  const compact = compactKey(multi);
  const folded = titleTokens(title, 'all');
  if (!multiKey) return { kind: 'none' };
  const titleFirst = firstPartTokens(title);

  const files = names
    .map((n, index) => ({ index, parsed: parseCoverName(n) }))
    .filter((f) => !f.parsed.junk && f.parsed.base)
    .map((f) => {
      const m = titleTokens(f.parsed.base, 'multi');
      return {
        ...f,
        plain: titleTokens(f.parsed.base, 'none').join(' '),
        multi: m.join(' '),
        compact: compactKey(m),
        folded: titleTokens(f.parsed.base, 'all'),
      };
    });
  const hit = (f: (typeof files)[number], score: number): CoverHit => ({
    index: f.index,
    name: names[f.index],
    score,
    regions: f.parsed.regions,
  });
  const byVariant = (a: (typeof files)[number], b: (typeof files)[number]) =>
    order(a.parsed, b.parsed);

  // Equal as written; or equal once roman numerals of two letters or more are digits, or once the words run
  // together ("Spider-Man" / "Spiderman"), but only when that is one single game. A lone "X", "V" or "I" read as a
  // number never makes a match: "Rocket Man X" is at most a candidate for "Rocket Man 10".
  let exact = files.filter((f) => f.plain === plain);
  for (const loose of [
    (f: (typeof files)[number]) => f.multi === multiKey,
    (f: (typeof files)[number]) => f.compact === compact,
  ]) {
    if (exact.length > 0) break;
    const only = files.filter(loose);
    if (only.length > 0 && new Set(only.map((f) => f.plain)).size === 1) exact = only;
  }
  if (exact.length > 0) return { kind: 'found', hits: exact.sort(byVariant).map((f) => hit(f, 1)) };

  // Candidates: the best copy of each game that looks like it
  const best = new Map<string, { file: (typeof files)[number]; score: number }>();
  for (const f of files) {
    const score = looseScore(folded, titleFirst, f.folded, firstPartTokens(f.parsed.base));
    if (score < CANDIDATE_MIN_SCORE) continue;
    const key = f.folded.join(' ');
    const prev = best.get(key);
    if (!prev || byVariant(f, prev.file) < 0) best.set(key, { file: f, score });
  }
  const hits = [...best.values()]
    .sort((a, b) => b.score - a.score || byVariant(a.file, b.file))
    .slice(0, max)
    .map((c) => hit(c.file, Math.round(c.score * 100) / 100));
  return hits.length > 0 ? { kind: 'choose', hits } : { kind: 'none' };
}

/** A readable label for a source name: the name without its extension. */
export const coverLabel = (name: string): string => name.replace(/\.(png|jpe?g|webp)$/i, '');
