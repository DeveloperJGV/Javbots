import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  ConnectionInfo,
  DecksCard,
  DecksCardInfo,
  DecksDeck,
  DecksImportResult,
  DecksSearchResults,
  DecksStatus,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { countDeck, deckCover, isDeckId, isoDay, normalizeDeck, toCardId } from '../core/deck.js';
import { toYdk } from '../core/formats.js';
import { importDeck } from '../core/importDeck.js';
import { deckWarnings } from '../core/rules.js';
import type { Deck, DeckCard } from '../core/types.js';
import { type CardDb, createCardDb, type ImageSize } from './cardDb.js';
import {
  CACHE_DIR,
  CARDS_REQUEST_MAX,
  CONNECTION_AUTH,
  CONNECTION_FEATURE,
  CONNECTION_ID,
  CONNECTION_NAME,
  CONNECTION_PURPOSE,
  IMAGE_REMOTE_DIRS,
  IMPORT_TEXT_MAX,
  LOG_PREFIX,
  ROUTE_DECK,
  ROUTE_IMAGE,
  ROUTE_LIST,
  SEARCH_LIMIT,
  SEARCH_QUERY_MAX,
  YDK_SUFFIX,
} from './constants.js';
import { createDeckStore, type DeckStore } from './deckStore.js';

export interface DecksFeatureOptions {
  /** The office's own token: the HTTP routes answer only to whoever has it. */
  officeToken: () => string | null;
  /** The home folder (tests: a temp folder); the data goes to <home>/.pixel-agents/. */
  home?: string;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Off in tests: the deck folder is not watched (they call the store's check() through reload). */
  timers?: boolean;
}

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** `?token=` or `Authorization: Bearer`, against the office token. */
function authorized(request: FastifyRequest, officeToken: string | null): boolean {
  if (!officeToken) return false;
  const query = String((request.query as Record<string, unknown> | undefined)?.token ?? '');
  const header = String(request.headers.authorization ?? '');
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  return (
    (query !== '' && sameToken(query, officeToken)) ||
    (bearer !== '' && sameToken(bearer, officeToken))
  );
}

const MESSAGES = [
  'decksOpen',
  'decksSearch',
  'decksCards',
  'decksSave',
  'decksDelete',
  'decksImport',
];

const send = (client: FeatureClient, msg: object) =>
  client.send(msg as unknown as Record<string, unknown>);

/**
 * Yu-Gi-Oh! decks (features/decks): one JSON file per deck in a folder of the person's choice, the card data and
 * images of YGOPRODeck downloaded once and kept on this machine, and the decks over HTTP for other screens.
 * Messages: privileged connections only.
 */
export function createDecksFeature(opts: DecksFeatureOptions): ServerFeature & {
  /** For tests and other features. */
  readonly store: DeckStore;
  readonly db: CardDb;
} {
  const now = opts.now ?? Date.now;
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const store = createDeckStore({ pixelDir, now, random: opts.random, timers: opts.timers });
  const db = createCardDb({
    dir: path.join(pixelDir, CACHE_DIR),
    fetch: opts.fetch,
    now,
    sleep: opts.sleep,
  });
  const clients = new Set<FeatureClient>();
  let started = false;

  /** First use: read the folder and start watching it (not at office start: most sessions never open decks). */
  function start(): void {
    if (started) return;
    started = true;
    store.reload();
    db.loadLocal();
  }

  function status(problems: string[] = []): DecksStatus {
    start();
    return {
      type: 'decksStatus',
      decks: store.decks().map(toWireDeck),
      folder: store.folder(),
      db: db.state(),
      problems: [...store.problems(), ...problems],
    };
  }

  const broadcast = () => {
    const msg = status();
    for (const c of clients) send(c, msg);
  };
  const offStore = store.onChange(broadcast);
  const offDb = db.onChange(broadcast);

  function cardsOf(ids: number[]): { cards: DeckCard[]; missing: number[] } {
    const index = db.index();
    const cards: DeckCard[] = [];
    const seen = new Set<number>();
    const missing: number[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const card = index.get(id);
      // An alternate artwork answers with its own code, so the page finds it under the code it asked for
      if (card) cards.push(card.id === id ? card : { ...card, id });
      else missing.push(id);
    }
    return { cards, missing };
  }

  async function search(requestId: string, query: string, client: FeatureClient): Promise<void> {
    await db.ensure();
    const msg: DecksSearchResults = {
      type: 'decksSearchResults',
      requestId,
      query,
      cards: db.index().search(query, SEARCH_LIMIT).map(toWireCard),
    };
    send(client, msg);
  }

  async function importText(requestId: string, text: string, client: FeatureClient): Promise<void> {
    await db.ensure();
    const result = importDeck(text, db.index(), isoDay(now()));
    const msg: DecksImportResult = {
      type: 'decksImportResult',
      requestId,
      ok: result.ok,
      problems: result.problems,
    };
    if (result.deck) msg.deck = toWireDeck(result.deck);
    send(client, msg);
  }

  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    switch (msg.type) {
      case 'decksOpen':
        start();
        store.reload();
        send(client, status());
        void db.ensure();
        return;
      case 'decksSearch': {
        const query =
          typeof msg.query === 'string' ? msg.query.trim().slice(0, SEARCH_QUERY_MAX) : '';
        if (typeof msg.requestId !== 'string') return;
        if (!query) {
          send(client, { type: 'decksSearchResults', requestId: msg.requestId, query, cards: [] });
          return;
        }
        void search(msg.requestId, query, client);
        return;
      }
      case 'decksCards': {
        if (!Array.isArray(msg.ids)) return;
        const ids = msg.ids
          .slice(0, CARDS_REQUEST_MAX)
          .map(toCardId)
          .filter((id): id is number => id !== null);
        db.loadLocal();
        const { cards, missing } = cardsOf(ids);
        const answer: DecksCardInfo = {
          type: 'decksCardInfo',
          cards: cards.map(toWireCard),
          missing,
        };
        send(client, answer);
        return;
      }
      case 'decksSave': {
        start();
        const parsed = normalizeDeck(msg.deck, isoDay(now()));
        if (!parsed) return;
        const raw = msg.deck as Record<string, unknown>;
        // A new deck comes with id ""; anything else that is not an id is refused instead of creating a copy
        if (raw.id !== '' && raw.id !== undefined && !isDeckId(raw.id)) {
          send(client, status(['No se guardó: el id del deck no es válido.']));
          return;
        }
        try {
          store.save(parsed.deck); // broadcasts through onChange
        } catch (err) {
          console.warn(`${LOG_PREFIX} No pude guardar el deck:`, (err as Error).message);
          send(client, status([`No se pudo guardar el deck: ${(err as Error).message}`]));
        }
        return;
      }
      case 'decksDelete': {
        start();
        if (typeof msg.id !== 'string' || !store.remove(msg.id))
          send(client, status(['No encontré ese deck para borrarlo.']));
        return;
      }
      case 'decksImport': {
        if (typeof msg.requestId !== 'string' || typeof msg.text !== 'string') return;
        if (msg.text.length > IMPORT_TEXT_MAX) {
          send(client, {
            type: 'decksImportResult',
            requestId: msg.requestId,
            ok: false,
            problems: ['El texto es demasiado largo para ser un deck.'],
          });
          return;
        }
        void importText(msg.requestId, msg.text, client);
        return;
      }
    }
  }

  // ── HTTP ───────────────────────────────────────────────────────────────────────────────

  function deckDetail(deck: Deck) {
    db.loadLocal();
    const index = db.index();
    const ids = [...deck.main, ...deck.extra, ...deck.side];
    return {
      deck: toWireDeck(deck),
      cards: cardsOf(ids).cards.map(toWireCard),
      warnings: deckWarnings(deck, index),
    };
  }

  async function sendImage(request: FastifyRequest, reply: FastifyReply) {
    const id = toCardId((request.params as Record<string, unknown>).cardId);
    const sizeParam = String((request.query as Record<string, unknown>).size ?? 'small');
    if (id === null || !(sizeParam in IMAGE_REMOTE_DIRS))
      return reply.code(400).send({ error: 'bad request' });
    if (!db.loadLocal()) void db.ensure();
    const file = await db.image(id, sizeParam as ImageSize);
    if (!file) return reply.code(404).send({ error: 'not found' });
    return reply
      .header('Cache-Control', 'private, max-age=604800')
      .type('image/jpeg')
      .send(fs.readFileSync(file));
  }

  return {
    name: 'decks',
    store,
    db,

    registerRoutes(app: FastifyInstance) {
      const guard = (request: FastifyRequest, reply: FastifyReply): boolean => {
        if (authorized(request, opts.officeToken())) return true;
        void reply.code(401).send({ error: 'unauthorized' });
        return false;
      };
      app.get(ROUTE_LIST, async (request, reply) => {
        if (!guard(request, reply)) return reply;
        start();
        store.check();
        return {
          decks: store.decks().map((d) => ({
            id: d.id,
            name: d.name,
            owner: d.owner,
            cover: deckCover(d),
            box: { color: d.box.color },
            counts: countDeck(d),
          })),
        };
      });
      app.get(ROUTE_IMAGE, async (request, reply) => {
        if (!guard(request, reply)) return reply;
        return sendImage(request, reply);
      });
      app.get(ROUTE_DECK, async (request, reply) => {
        if (!guard(request, reply)) return reply;
        start();
        store.check();
        const param = String((request.params as Record<string, unknown>).id ?? '');
        const ydk = param.endsWith(YDK_SUFFIX);
        const id = ydk ? param.slice(0, -YDK_SUFFIX.length) : param;
        const deck = isDeckId(id) ? store.get(id) : undefined;
        if (!deck) return reply.code(404).send({ error: 'not found' });
        if (ydk)
          return reply
            .type('text/plain; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${id}.ydk"`)
            .send(toYdk(deck));
        return deckDetail(deck);
      });
    },

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady') {
        if (client.privileged) send(client, status());
        return false; // the core handler still runs
      }
      if (!MESSAGES.includes(String(msg.type))) return false;
      if (!client.privileged) {
        console.warn(`${LOG_PREFIX} Ignorando ${String(msg.type)} de un cliente sin token.`);
        return true;
      }
      try {
        apply(msg, client);
      } catch (err) {
        console.warn(`${LOG_PREFIX} No pude atender ${String(msg.type)}:`, (err as Error).message);
      }
      return true;
    },

    dispose() {
      offStore();
      offDb();
      store.dispose();
    },

    /** For the connections board (features/conexiones). */
    connections(): ConnectionInfo[] {
      const state = db.state();
      const info: ConnectionInfo = {
        id: CONNECTION_ID,
        name: CONNECTION_NAME,
        feature: CONNECTION_FEATURE,
        purpose: CONNECTION_PURPOSE,
        auth: CONNECTION_AUTH,
        state: state.state === 'ready' ? 'ok' : state.state === 'error' ? 'warn' : 'off',
      };
      const detail =
        state.state === 'ready' ? `${state.count ?? 0} cartas guardadas` : state.detail;
      if (detail) info.detail = detail;
      const last = db.lastOkAt() ?? state.updatedAt;
      if (last) info.lastUsedAt = last;
      return [info];
    },
  };
}

/** The deck as the protocol has it (no extra fields: additionalProperties is false). */
function toWireDeck(d: Deck): DecksDeck {
  return {
    id: d.id,
    name: d.name,
    owner: d.owner,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    cover: d.cover,
    box: { color: d.box.color },
    notes: d.notes,
    main: [...d.main],
    extra: [...d.extra],
    side: [...d.side],
  };
}

function toWireCard(c: DeckCard): DecksCard {
  const out: DecksCard = {
    id: c.id,
    name: c.name,
    kind: c.kind,
    extraDeck: c.extraDeck,
    type: c.type,
    frameType: c.frameType,
    desc: c.desc,
  };
  if (c.race !== undefined) out.race = c.race;
  if (c.attribute !== undefined) out.attribute = c.attribute;
  if (c.level !== undefined) out.level = c.level;
  if (c.atk !== undefined) out.atk = c.atk;
  if (c.def !== undefined) out.def = c.def;
  if (c.archetype !== undefined) out.archetype = c.archetype;
  if (c.banTcg !== undefined) out.banTcg = c.banTcg;
  if (c.banOcg !== undefined) out.banOcg = c.banOcg;
  return out;
}
