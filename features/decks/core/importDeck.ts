import { IMPORTED_DECK_NAME, TEXT_LINE_MAX_COPIES, TEXT_MAX_LINES } from './constants.js';
import { emptyDeck, toCardId } from './deck.js';
import { type DeckLists, isYdk, isYdke, parseYdk, parseYdke } from './formats.js';
import type { CardLookup, Deck, DeckZone } from './types.js';

export type ImportFormat = 'ydke' | 'ydk' | 'text';

export interface ImportResult {
  ok: boolean;
  format: ImportFormat;
  /** A draft, never saved: id "". */
  deck?: Deck;
  /** What could not be read or was guessed, in Spanish, so the draft can be fixed. */
  problems: string[];
}

export function detectFormat(text: string): ImportFormat {
  if (isYdke(text)) return 'ydke';
  if (isYdk(text)) return 'ydk';
  return 'text';
}

// ── Text list ──────────────────────────────────────────────────────────────────────────────

/** Section headers of a text list ("Monstruos (12):", "Extra Deck", "Side"...). */
const HEADER =
  /^(main(?: deck)?|monstruos?|monsters?|magias?|hechizos?|spells?|trampas?|traps?|extra(?: deck)?|side(?: deck)?)\s*(?:\(\s*\d+\s*\)|\d+)?\s*:?\s*(?:\(\s*\d+\s*\)|\d+)?$/i;

function headerZone(word: string): DeckZone {
  const w = word.toLowerCase();
  if (w.startsWith('extra')) return 'extra';
  if (w.startsWith('side')) return 'side';
  return 'main';
}

interface Wanted {
  count: number;
  what: string;
}

/** "3 Dark Magician", "3x 89631139", "Dark Magician x2", "Dark Magician" → copies + name or code. */
function splitCount(line: string): Wanted | null {
  let m = /^(\d{1,3})\s*[x×*]?\s+(.+)$/i.exec(line) ?? /^(\d{1,3})\s*[x×*]\s*(.+)$/i.exec(line);
  if (m) return { count: Number(m[1]), what: m[2].trim() };
  m = /^(.+?)\s*[x×*]\s*(\d{1,3})$/i.exec(line) ?? /^(.+?)\s+\(?(\d{1,3})\)?$/.exec(line);
  if (m && !/^\d+$/.test(m[1])) return { count: Number(m[2]), what: m[1].trim() };
  return null;
}

/**
 * A list written by hand (from photos of the cards, a chat...): one card per line, with or without copies, by name
 * or by code; optional section headers. Names are looked up in the database; what is not found goes to the problems.
 * With no Extra header, Extra Deck monsters found in the Main part go to the Extra.
 */
export function parseTextList(
  text: string,
  lookup: CardLookup,
): DeckLists & { problems: string[]; found: number } {
  const out = {
    main: [] as number[],
    extra: [] as number[],
    side: [] as number[],
    problems: [] as string[],
    found: 0,
  };
  let zone: DeckZone = 'main';
  const lines = text.split(/\r?\n/);
  if (lines.length > TEXT_MAX_LINES)
    out.problems.push(
      `La lista tiene ${lines.length} líneas; solo leí las primeras ${TEXT_MAX_LINES}.`,
    );
  lines.slice(0, TEXT_MAX_LINES).forEach((raw, i) => {
    const line = raw.replace(/^[\s\-•*·]+/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    const header = HEADER.exec(line);
    if (header) {
      zone = headerZone(header[1]);
      return;
    }
    const where = `línea ${i + 1}`;
    // A whole line that is a card name wins ("7 Colored Fish" is one card, not seven "Colored Fish")
    const whole = lookup.findByName(line);
    let wanted: Wanted = { count: 1, what: line };
    if (!whole?.exact) wanted = splitCount(line) ?? wanted;
    if (wanted.count < 1) {
      out.problems.push(`${where}: "${line}" pide 0 copias; la salté.`);
      return;
    }
    if (wanted.count > TEXT_LINE_MAX_COPIES) {
      out.problems.push(
        `${where}: "${line}" pide ${wanted.count} copias; dejé ${TEXT_LINE_MAX_COPIES}.`,
      );
      wanted.count = TEXT_LINE_MAX_COPIES;
    }
    let id: number | null = null;
    let extraDeck = false;
    if (/^\d{1,10}$/.test(wanted.what)) {
      id = toCardId(wanted.what);
      const card = id === null ? undefined : lookup.get(id);
      if (id !== null && !card && lookup.ready)
        out.problems.push(`${where}: el código ${id} no está en la base; lo dejé tal cual.`);
      extraDeck = !!card?.extraDeck;
    } else {
      const hit = whole?.exact ? whole : lookup.findByName(wanted.what);
      if (!hit) {
        out.problems.push(
          lookup.ready
            ? `${where}: no encontré "${wanted.what}".`
            : `${where}: "${wanted.what}" no se pudo buscar (todavía no hay base de cartas).`,
        );
        return;
      }
      if (!hit.exact)
        out.problems.push(`${where}: "${wanted.what}" → tomé "${hit.card.name}"; revísala.`);
      id = hit.card.id;
      extraDeck = hit.card.extraDeck;
    }
    if (id === null) {
      out.problems.push(`${where}: "${line}" no es un código de carta.`);
      return;
    }
    const target: DeckZone = zone === 'main' && extraDeck ? 'extra' : zone;
    for (let n = 0; n < wanted.count; n++) out[target].push(id);
    out.found++;
  });
  return out;
}

// ── Any text ───────────────────────────────────────────────────────────────────────────────

/** Unknown codes of a ydk / ydke import, as problems (only with a database to check them against). */
function unknownCodes(lists: DeckLists, lookup: CardLookup): string[] {
  if (!lookup.ready) return [];
  const unknown = new Set<number>();
  for (const id of [...lists.main, ...lists.extra, ...lists.side])
    if (!lookup.get(id)) unknown.add(id);
  return [...unknown].map((id) => `El código ${id} no está en la base; lo dejé tal cual.`);
}

/**
 * A deck draft from pasted text, whatever the format: `ydke://…`, a `.ydk` file or a text list. `ok` is false when
 * nothing at all could be read.
 */
export function importDeck(text: string, lookup: CardLookup, today: string): ImportResult {
  const format = detectFormat(text);
  let lists: DeckLists;
  let problems: string[];
  if (format === 'ydke') {
    const parsed = parseYdke(text);
    if (!parsed) return { ok: false, format, problems: ['El enlace ydke:// está dañado.'] };
    lists = parsed;
    problems = unknownCodes(lists, lookup);
  } else if (format === 'ydk') {
    const parsed = parseYdk(text);
    lists = parsed;
    problems = [...parsed.problems, ...unknownCodes(lists, lookup)];
  } else {
    const parsed = parseTextList(text, lookup);
    lists = parsed;
    problems = parsed.problems;
  }
  const total = lists.main.length + lists.extra.length + lists.side.length;
  if (total === 0) {
    return {
      ok: false,
      format,
      problems: problems.length ? problems : ['No encontré ninguna carta en el texto.'],
    };
  }
  const deck: Deck = {
    ...emptyDeck(today),
    name: IMPORTED_DECK_NAME,
    main: lists.main,
    extra: lists.extra,
    side: lists.side,
  };
  return { ok: true, format, deck, problems };
}
