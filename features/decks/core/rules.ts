import {
  COPIES_MAX,
  EXTRA_MAX,
  LIMITED_MAX,
  MAIN_MAX,
  MAIN_MIN,
  SEMI_LIMITED_MAX,
  SIDE_MAX,
} from './constants.js';
import type { CardLookup, Deck, DeckWarning } from './types.js';

const copies = (n: number) => (n === 1 ? '1 copia' : `${n} copias`);

/**
 * The deck-building rules the deck breaks, as warnings (nothing is blocked): sizes of Main / Extra / Side, more than
 * 3 copies (Main + Extra + Side together, alternate artworks counted as the same card), the TCG list of forbidden and
 * limited cards, and cards in the wrong zone. Cards not in the database are only counted.
 */
export function deckWarnings(
  deck: Pick<Deck, 'main' | 'extra' | 'side'>,
  lookup: CardLookup,
): DeckWarning[] {
  const out: DeckWarning[] = [];
  const main = deck.main.length;
  if (main < MAIN_MIN || main > MAIN_MAX)
    out.push({
      code: 'main-size',
      text: `El Main tiene ${main} cartas; debe tener de ${MAIN_MIN} a ${MAIN_MAX}.`,
    });
  if (deck.extra.length > EXTRA_MAX)
    out.push({
      code: 'extra-size',
      text: `El Extra tiene ${deck.extra.length} cartas; el máximo es ${EXTRA_MAX}.`,
    });
  if (deck.side.length > SIDE_MAX)
    out.push({
      code: 'side-size',
      text: `El Side tiene ${deck.side.length} cartas; el máximo es ${SIDE_MAX}.`,
    });

  // Copies of each card, alternate artworks under their card's main code
  const total = new Map<number, number>();
  for (const id of [...deck.main, ...deck.extra, ...deck.side]) {
    const key = lookup.get(id)?.id ?? id;
    total.set(key, (total.get(key) ?? 0) + 1);
  }
  for (const [id, n] of total) {
    const card = lookup.get(id);
    const name = card?.name ?? `La carta ${id}`;
    if (n > COPIES_MAX)
      out.push({
        code: 'copies',
        text: `${name}: ${copies(n)}; el máximo es ${COPIES_MAX}.`,
        cardId: id,
      });
    if (card?.banTcg === 'Banned')
      out.push({ code: 'banned', text: `${name} está prohibida.`, cardId: id });
    else if (card?.banTcg === 'Limited' && n > LIMITED_MAX)
      out.push({
        code: 'limited',
        text: `${name} está limitada: máximo ${copies(LIMITED_MAX)} (hay ${n}).`,
        cardId: id,
      });
    else if (card?.banTcg === 'Semi-Limited' && n > SEMI_LIMITED_MAX)
      out.push({
        code: 'semi-limited',
        text: `${name} está semilimitada: máximo ${copies(SEMI_LIMITED_MAX)} (hay ${n}).`,
        cardId: id,
      });
  }

  const seen = new Set<number>();
  for (const id of deck.main) {
    const card = lookup.get(id);
    if (card?.extraDeck && !seen.has(card.id)) {
      seen.add(card.id);
      out.push({
        code: 'extra-in-main',
        text: `${card.name} va en el Extra, no en el Main.`,
        cardId: card.id,
      });
    }
  }
  for (const id of deck.extra) {
    const card = lookup.get(id);
    if (card && !card.extraDeck && !seen.has(card.id)) {
      seen.add(card.id);
      out.push({
        code: 'main-in-extra',
        text: `${card.name} no es de Extra Deck y está en el Extra.`,
        cardId: card.id,
      });
    }
  }
  return out;
}
