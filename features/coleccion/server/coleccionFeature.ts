import * as os from 'os';
import * as path from 'path';

import type {
  ColeccionGame,
  ColeccionResult,
  ColeccionStatus,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import type { Game } from '../core/types.js';
import { type CollectionStore, createCollectionStore } from './collectionStore.js';
import { LOG_PREFIX, MESSAGES, REQUEST_ID_MAX } from './constants.js';

export interface ColeccionFeatureOptions {
  /** The home folder (tests: a temp folder); the file goes to <home>/.pixel-agents/coleccion.json. */
  home?: string;
  now?: () => number;
  random?: () => number;
}

const send = (client: FeatureClient, msg: object) =>
  client.send(msg as unknown as Record<string, unknown>);

const requestIdOf = (msg: Record<string, unknown>): string | null =>
  typeof msg.requestId === 'string' && msg.requestId.length <= REQUEST_ID_MAX
    ? msg.requestId
    : null;

/**
 * The game collection (features/coleccion): one JSON file with every game and every "se busca" gap, filled by hand
 * from the page. Messages: privileged connections only; saving and deleting answer with coleccionResult.
 */
export function createColeccionFeature(opts: ColeccionFeatureOptions = {}): ServerFeature & {
  /** For tests. */
  readonly store: CollectionStore;
} {
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const store = createCollectionStore({ pixelDir, now: opts.now, random: opts.random });
  const clients = new Set<FeatureClient>();

  function status(): ColeccionStatus {
    store.check();
    return {
      type: 'coleccionStatus',
      games: store.games().map(toWireGame),
      file: store.file(),
      problems: store.problems(),
    };
  }

  const broadcast = () => {
    const msg = status();
    for (const c of clients) send(c, msg);
  };

  function answer(client: FeatureClient, result: Omit<ColeccionResult, 'type'>): void {
    send(client, { type: 'coleccionResult', ...result } satisfies ColeccionResult);
  }

  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    switch (msg.type) {
      case 'coleccionOpen':
        send(client, status());
        return;
      case 'coleccionSave': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const game = store.save(msg.game);
          answer(client, { requestId, ok: true, id: game.id });
        } catch (err) {
          console.warn(`${LOG_PREFIX} No pude guardar el juego:`, (err as Error).message);
          answer(client, {
            requestId,
            ok: false,
            error: `No se guardó: ${(err as Error).message}.`,
          });
        }
        broadcast();
        return;
      }
      case 'coleccionDelete': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const ok = typeof msg.id === 'string' && store.remove(msg.id);
          answer(
            client,
            ok
              ? { requestId, ok: true, id: String(msg.id) }
              : { requestId, ok: false, error: 'No encontré ese juego para borrarlo.' },
          );
        } catch (err) {
          answer(client, {
            requestId,
            ok: false,
            error: `No se borró: ${(err as Error).message}.`,
          });
        }
        broadcast();
        return;
      }
    }
  }

  return {
    name: 'coleccion',
    store,

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
      if (!(MESSAGES as readonly string[]).includes(String(msg.type))) return false;
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
  };
}

/** The game as the protocol has it (no extra fields: additionalProperties is false). */
export function toWireGame(g: Game): ColeccionGame {
  const out: ColeccionGame = {
    id: g.id,
    title: g.title,
    platform: g.platform,
    wanted: g.wanted,
    region: g.region,
    condition: g.condition,
    progress: g.progress,
    players: g.players,
    coop: g.coop,
    length: g.length,
    series: g.series,
    owner: g.owner,
    notes: g.notes,
    price: g.price,
    seenAt: g.seenAt,
    addedAt: g.addedAt,
    lastPlayed: g.lastPlayed,
    updatedAt: g.updatedAt,
  };
  if (g.externalId) out.externalId = g.externalId;
  if (g.barcode) out.barcode = g.barcode;
  if (g.cover) out.cover = g.cover;
  return out;
}
