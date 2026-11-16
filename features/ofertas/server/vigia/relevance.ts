/**
 * Does a store title answer the search? Every meaningful word of the query must be in the title, the models
 * ("wh-1000xm5", "s24") must match exactly, and accessories ("funda para…", "almohadillas compatibles con…") are
 * dropped unless the query asks for them.
 */
import {
  BUNDLE_PHRASES,
  DEFAULT_EXCLUDE,
  FOR_MARKERS,
  JOIN_MAX_TOKENS,
  MODEL_PREFIX_MAX,
  MODEL_UNITS,
  NOT_MODEL_UNIT,
  STOP_WORDS,
} from './constants.js';

/** What relevance needs from a watch (a live search passes only the query). */
export interface RelevanceRule {
  query: string;
  mustHave?: readonly string[];
  exclude?: readonly string[];
}

/** Lowercase, no accents, no signs: "Audífonos WH-1000XM5!" → "audifonos wh 1000xm5". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

const hasDigit = (t: string) => /\d/.test(t);
const isLetters = (t: string) => /^[a-zñ]+$/.test(t);
const isStop = (t: string) => STOP_WORDS.includes(t);

/** Singular and plural are the same word ("bocina" / "bocinas", "control" / "controles"). */
export function sameWord(a: string, b: string): boolean {
  return a === b || a + 's' === b || b + 's' === a || a + 'es' === b || b + 'es' === a;
}

/**
 * Model tokens of a text: hyphens glued ("WH-1000XM5" → "wh1000xm5"), a short letter prefix glued to the number
 * after it ("wh 1000xm5", "ps 5"), storage glued to its number ("128 gb"). Plain numbers and units ("40h") are not
 * models.
 */
export function modelTokens(text: string): string[] {
  const glued = text.replace(/([A-Za-z0-9])[-/.]([A-Za-z0-9])/g, '$1$2');
  const ts = tokens(glued);
  const out: string[] = [];
  for (let i = 0; i < ts.length; i++) {
    let t = ts[i]!;
    const next = ts[i + 1];
    if (
      next !== undefined &&
      isLetters(t) &&
      !isStop(t) &&
      t.length <= MODEL_PREFIX_MAX &&
      hasDigit(next) &&
      !hasDigit(t)
    ) {
      t += next;
      i++;
    } else if (next !== undefined && /^\d+$/.test(t) && MODEL_UNITS.includes(next)) {
      t += next;
      i++;
    }
    // Bare numbers stay ("iphone 15"), units do not ("40h", "5w").
    if (hasDigit(t) && (/^\d+$/.test(t) || !NOT_MODEL_UNIT.test(t))) {
      out.push(t);
    }
  }
  return out;
}

/** Index where a run of title tokens spells the model (with or without hyphens/spaces), or -1. */
function findModel(titleTokens: string[], model: string): number {
  for (let i = 0; i < titleTokens.length; i++) {
    let joined = '';
    for (let j = i; j < titleTokens.length && joined.length < model.length; j++) {
      joined += titleTokens[j]!;
      if (joined === model) {
        return i;
      }
    }
  }
  return -1;
}

function findWord(titleTokens: string[], word: string): number {
  return titleTokens.findIndex((t) => sameWord(t, word));
}

/**
 * Like findWord, but the word may also be split across a few title tokens: "tplink" is in "TP-Link" ("tp" "link")
 * and "audiotechnica" in "Audio Technica". Only for words that must be there, never for exclusions (else "ca" +
 * "se" would discard a title for "case").
 */
function findJoined(titleTokens: string[], word: string): number {
  for (let i = 0; i < titleTokens.length; i++) {
    let joined = '';
    for (let j = i; j < titleTokens.length && j - i < JOIN_MAX_TOKENS; j++) {
      joined += titleTokens[j]!;
      if (sameWord(joined, word)) return i;
      if (joined.length > word.length + 2) break;
    }
  }
  return -1;
}

/**
 * Where the query word at `k` (and maybe the ones glued after it) sits in the title, and how many query words it
 * took. "tp link" finds "TPLink" by gluing "tp" + "link"; words that were not next to each other in the query never
 * glue.
 */
function findQueryWord(
  titleTokens: string[],
  words: readonly string[],
  adjacent: readonly boolean[],
  k: number,
): { at: number; used: number } | undefined {
  let glued = '';
  for (let n = 0; n < JOIN_MAX_TOKENS && k + n < words.length; n++) {
    if (n > 0 && !adjacent[k + n]) break;
    glued += words[k + n]!;
    const at = findJoined(titleTokens, glued);
    if (at >= 0) return { at, used: n + 1 };
  }
  return undefined;
}

/**
 * A phrase (one or more words) inside a normalized text, whole words only, plural tolerant on one word. `joined`
 * (for words that must be there) also accepts it written together or split ("tp-link", "tp link", "tplink").
 */
function hasPhrase(
  normTitle: string,
  titleTokens: string[],
  phrase: string,
  joined = false,
): boolean {
  const p = normalize(phrase);
  if (!p) {
    return false;
  }
  if (joined && findJoined(titleTokens, p.replace(/ /g, '')) >= 0) {
    return true;
  }
  if (!p.includes(' ')) {
    return findWord(titleTokens, p) >= 0;
  }
  return ` ${normTitle} `.includes(` ${p} `);
}

/**
 * The query split into models and plain meaningful words. `adjacent[k]` = word k came right after word k - 1 in the
 * query (only those may be glued together to find a brand written as one word).
 */
export function queryParts(query: string): {
  models: string[];
  words: string[];
  adjacent: boolean[];
} {
  const models = modelTokens(query);
  const modelSet = new Set(models);
  const words: string[] = [];
  const adjacent: boolean[] = [];
  let lastAt = -2;
  const glued = query.replace(/([A-Za-z0-9])[-/.]([A-Za-z0-9])/g, '$1$2');
  const ts = tokens(glued);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const next = ts[i + 1];
    if (modelSet.has(t) || isStop(t)) {
      continue;
    }
    // A prefix glued into a model ("wh" of "wh 1000xm5") is part of the model, not a word.
    if (next !== undefined && modelSet.has(t + next)) {
      i++;
      continue;
    }
    if (hasDigit(t)) {
      continue; // a unit ("40h") is not required
    }
    adjacent.push(lastAt === i - 1);
    lastAt = i;
    words.push(t);
  }
  return { models, words, adjacent };
}

function cleanTitle(title: string): { norm: string; toks: string[] } {
  let norm = normalize(title.replace(/([A-Za-z0-9])[-/.]([A-Za-z0-9])/g, '$1 $2'));
  for (const phrase of BUNDLE_PHRASES) {
    norm = ` ${norm} `
      .split(` ${normalize(phrase)} `)
      .join(' ')
      .trim();
  }
  return { norm, toks: norm ? norm.split(' ') : [] };
}

/**
 * After the marker at `m`, does the title name the searched product again? With models: one that was already named
 * before the marker shows up again ("control para PS5" for "control ps5" names PS5 only once, so it stays). Without
 * models: every searched word shows up again.
 */
function namesAgain(
  toks: string[],
  m: number,
  models: readonly string[],
  modelPositions: readonly number[],
  words: readonly string[],
  adjacent: readonly boolean[],
): boolean {
  const after = toks.slice(m + 1);
  if (models.length > 0) {
    return models.some((model, i) => modelPositions[i]! < m && findModel(after, model) >= 0);
  }
  if (words.length === 0) {
    return false;
  }
  for (let k = 0; k < words.length;) {
    const found = findQueryWord(after, words, adjacent, k);
    if (!found) {
      return false;
    }
    k += found.used;
  }
  return true;
}

export function isRelevant(title: string, rule: RelevanceRule): boolean {
  return relevanceScore(title, rule) > 0;
}

/**
 * 0 = not relevant. Otherwise (0..1]: higher when the title has fewer words besides the searched ones (the bare
 * product before a bundle or a long marketplace title).
 */
export function relevanceScore(title: string, rule: RelevanceRule): number {
  const { norm, toks } = cleanTitle(title);
  if (toks.length === 0) {
    return 0;
  }
  const { models, words, adjacent } = queryParts(rule.query);
  if (models.length === 0 && words.length === 0) {
    return 0;
  }
  const queryNorm = normalize(rule.query);
  const queryToks = tokens(rule.query);

  const positions: number[] = [];
  for (const m of models) {
    const at = findModel(toks, m);
    if (at < 0) {
      return 0;
    }
    positions.push(at);
  }
  const wordPositions: number[] = [];
  for (let k = 0; k < words.length;) {
    const found = findQueryWord(toks, words, adjacent, k);
    if (!found) {
      return 0;
    }
    wordPositions.push(found.at);
    k += found.used;
  }
  for (const must of rule.mustHave ?? []) {
    if (normalize(must) && !hasPhrase(norm, toks, must, true)) {
      return 0;
    }
  }

  // Exclusions: built-in and the watch's own, except the ones the query asks for.
  const inQuery = (phrase: string) => {
    const p = normalize(phrase);
    return p.includes(' ')
      ? ` ${queryNorm} `.includes(` ${p} `)
      : queryToks.some((t) => sameWord(t, p));
  };
  for (const ex of [...DEFAULT_EXCLUDE, ...(rule.exclude ?? [])]) {
    if (!inQuery(ex) && hasPhrase(norm, toks, ex)) {
      return 0;
    }
  }

  // "… para <the searched product>": the item is for the product, not the product.
  const markerAt = toks.findIndex((t) => FOR_MARKERS.includes(t));
  if (markerAt >= 0 && !FOR_MARKERS.some((m) => queryToks.includes(m))) {
    // "Control para PS5" answers "control ps5" (the control comes first) but not "ps5".
    if (![...positions, ...wordPositions].some((p) => p < markerAt)) {
      return 0;
    }
    // "Cargador iPhone 15 compatible con iPhone 15 Pro": after a marker the title names the searched product AGAIN,
    // so what came first is an accessory for it. "Subwoofer SW10 … compatible con Dolby Atmos" names something else.
    for (let m = markerAt; m < toks.length; m++) {
      if (
        FOR_MARKERS.includes(toks[m]!) &&
        namesAgain(toks, m, models, positions, words, adjacent)
      ) {
        return 0;
      }
    }
  }

  const meaningful = toks.filter((t) => !isStop(t)).length;
  const asked = models.length + words.length;
  return Math.min(1, asked / Math.max(asked, meaningful));
}
