/** Watches shown by group ("Bocinas", "Receptor"…): order, the best of each group and the suggested group. */
import type { OfertasOffer, OfertasWatch } from '../../../core/src/messages.js';
import {
  GROUP_NAME_MAX,
  GROUP_SUGGESTIONS,
  NO_SUGGESTION_HEADS,
  SUGGESTION_HEAD_WORDS,
  SUGGESTION_STOP_WORDS,
} from './constants.js';

/** Lower case, no accents, only letters and digits between single spaces. */
export function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** "Bocinas" typed by hand: one line, no doubled spaces, capped. Empty = no group. */
export function cleanGroupName(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, GROUP_NAME_MAX).trim();
}

/** Two group names are the same group whatever their accents or capitals ("Audífonos" = "audifonos"). */
export const sameGroup = (a?: string, b?: string): boolean => !!a && !!b && plain(a) === plain(b);

/** The name a group already has, if one is the same as `name` but for accents or capitals; else `name`. */
export const existingGroup = (groups: readonly string[], name: string): string =>
  groups.find((g) => sameGroup(g, name)) ?? name;

const startsWith = (toks: readonly string[], at: number, phrase: string) =>
  plain(phrase)
    .split(' ')
    .every((w, k) => toks[at + k] === w);

/** One text: a group, null (it says what it is, and that has no group) or undefined (it does not say). */
function suggestOne(text: string): string | null | undefined {
  const toks = plain(text).split(' ').filter(Boolean);
  if (toks.length === 0) return undefined;
  // What the title starts with says what it is
  for (let at = 0; at < Math.min(SUGGESTION_HEAD_WORDS, toks.length); at++) {
    if (NO_SUGGESTION_HEADS.includes(toks[at]!)) return null;
    for (const rule of GROUP_SUGGESTIONS) {
      if ([...(rule.head ?? []), ...rule.words].some((w) => startsWith(toks, at, w))) {
        return rule.group;
      }
    }
  }
  // Else a word that only names one kind of product, before "para" / "compatible con"
  const stop = toks.findIndex((t) => SUGGESTION_STOP_WORDS.includes(t));
  const before = stop < 0 ? toks : toks.slice(0, stop);
  for (const rule of GROUP_SUGGESTIONS) {
    for (let at = 0; at < before.length; at++) {
      if (rule.words.some((w) => startsWith(before, at, w))) return rule.group;
    }
  }
  return undefined;
}

/**
 * A group for a product from what it is, or undefined: from the first text that says (the store title before the
 * search words). In doubt, nothing: a wrong suggestion is worse than none.
 */
export function suggestGroup(...texts: (string | undefined)[]): string | undefined {
  for (const t of texts) {
    if (!t) continue;
    const got = suggestOne(t);
    if (got === null) return undefined;
    if (got) return got;
  }
  return undefined;
}

/** What to suggest for a watch: from the title the stores give (better than the search words), then the search. */
export function suggestForWatch(w: OfertasWatch): string | undefined {
  return suggestGroup(w.pick?.offer.title, w.best?.title, w.query);
}

/** The offer a watch would be bought at: "la mejor", else the cheapest. */
export const watchOffer = (w: OfertasWatch): OfertasOffer | undefined => w.pick?.offer ?? w.best;

export interface WatchGroup {
  /** undefined = "Sin grupo". */
  name?: string;
  watches: OfertasWatch[];
  /** The cheapest watch of the group whose verdict is "Buen precio", if any. */
  best?: { watch: OfertasWatch; offer: OfertasOffer };
}

/** The best of a group: the cheapest with a good verdict. */
export function bestOfGroup(watches: readonly OfertasWatch[]): WatchGroup['best'] {
  let best: WatchGroup['best'];
  for (const w of watches) {
    const offer = watchOffer(w);
    if (!offer || w.verdict?.kind !== 'good') continue;
    if (!best || offer.price < best.offer.price) best = { watch: w, offer };
  }
  return best;
}

/** Every group name in use, in the person's order first, then alphabetically (Spanish). */
export function groupNames(
  watches: readonly OfertasWatch[],
  order: readonly string[] = [],
): string[] {
  const used: string[] = [];
  for (const w of watches) {
    if (w.group && !used.some((g) => sameGroup(g, w.group!))) used.push(w.group);
  }
  const ordered = order.filter((o) => used.some((g) => sameGroup(g, o)));
  const rest = used
    .filter((g) => !ordered.some((o) => sameGroup(o, g)))
    .sort((a, b) => a.localeCompare(b, 'es'));
  // The name as the watches write it
  return [...ordered.map((o) => used.find((g) => sameGroup(g, o))!), ...rest];
}

/** The watches by group, in the person's order, "Sin grupo" last. Inside a group they keep their own order. */
export function watchGroups(
  watches: readonly OfertasWatch[],
  order: readonly string[] = [],
): WatchGroup[] {
  const groups: WatchGroup[] = groupNames(watches, order).map((name) => {
    const ws = watches.filter((w) => w.group && sameGroup(w.group, name));
    return { name, watches: ws, best: bestOfGroup(ws) };
  });
  const loose = watches.filter((w) => !w.group);
  if (loose.length > 0) groups.push({ watches: loose, best: bestOfGroup(loose) });
  return groups;
}

/**
 * The order to save after moving one group up (-1) or down (+1) among the visible ones (`names`). The saved order
 * (`saved`) also holds groups that have no watches today: they keep their place, so a group that empties and comes
 * back is where it was.
 */
export function moveGroup(
  names: readonly string[],
  name: string,
  step: -1 | 1,
  saved: readonly string[] = [],
): string[] {
  const shown = [...names];
  const i = shown.findIndex((n) => sameGroup(n, name));
  const j = i + step;
  if (i >= 0 && j >= 0 && j < shown.length) [shown[i], shown[j]] = [shown[j]!, shown[i]!];
  // The visible groups take, in their new order, the places visible groups had; the others stay put
  const isShown = (g: string) => shown.some((n) => sameGroup(n, g));
  const next = [...shown];
  const out = saved.map((g) => (isShown(g) ? next.shift() : g)).filter((g): g is string => !!g);
  return [...out, ...next];
}
