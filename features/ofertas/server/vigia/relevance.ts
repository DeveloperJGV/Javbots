/**
 * Does a store title answer the search? Every meaningful word of the query must be in the title, the models
 * ("wh-1000xm5", "s24") must match exactly, and accessories ("funda para…", "almohadillas compatibles con…") are
 * dropped unless the query asks for them.
 */
import {
  BUNDLE_PHRASES,
  DEFAULT_EXCLUDE,
  FOR_MARKERS,
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
    .replace(/[̀-ͯ]/g, '')
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

/** A phrase (one or more words) inside a normalized text, whole words only, plural tolerant on one word. */
function hasPhrase(normTitle: string, titleTokens: string[], phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) {
    return false;
  }
  if (!p.includes(' ')) {
    return findWord(titleTokens, p) >= 0;
  }
  return ` ${normTitle} `.includes(` ${p} `);
}

/** The query split into models and plain meaningful words. */
export function queryParts(query: string): { models: string[]; words: string[] } {
  const models = modelTokens(query);
  const modelSet = new Set(models);
  const words: string[] = [];
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
    words.push(t);
  }
  return { models, words };
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
  const { models, words } = queryParts(rule.query);
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
  for (const w of words) {
    const at = findWord(toks, w);
    if (at < 0) {
      return 0;
    }
    wordPositions.push(at);
  }
  for (const must of rule.mustHave ?? []) {
    if (normalize(must) && !hasPhrase(norm, toks, must)) {
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
  }

  const meaningful = toks.filter((t) => !isStop(t)).length;
  const asked = models.length + words.length;
  return Math.min(1, asked / Math.max(asked, meaningful));
}
