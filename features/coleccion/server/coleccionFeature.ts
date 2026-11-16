import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as os from 'os';
import * as path from 'path';

import type {
  ColeccionGame,
  ColeccionResult,
  ColeccionStatus,
  ConnectionInfo,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { COVER_MIME } from '../core/cover.js';
import { isGameId } from '../core/game.js';
import { type Condition, CONDITIONS, type Game } from '../core/types.js';
import { type CollectionStore, createCollectionStore } from './collectionStore.js';
import {
  LOG_PREFIX,
  MESSAGES,
  REQUEST_ID_MAX,
  ROUTE_CANDIDATE,
  ROUTE_COVER,
  UPLOAD_CONTENT_TYPES,
} from './constants.js';
import { IMAGE_MAX_BYTES, SOURCE_INTERVAL_MS } from './covers/constants.js';
import { createCoverFiles, ImageError } from './covers/coverFiles.js';
import { CoverError, type CoverService, createCoverService } from './covers/coverService.js';
import { createIgdbKeyStore, createIgdbSource } from './covers/igdb.js';
import { createLibretroSource } from './covers/libretro.js';
import { createRateQueue, createSafeFetch } from './covers/net.js';

export interface ColeccionFeatureOptions {
  /** The home folder (tests: a temp folder); the file goes to <home>/.pixel-agents/coleccion.json. */
  home?: string;
  now?: () => number;
  random?: () => number;
  /** The office's own token: the cover routes answer only to whoever has it (none = they always answer 401). */
  officeToken?: () => string | null;
  /** Tests: a fake network (nothing real is ever reached from a test). */
  fetch?: typeof fetch;
  /** Tests: waiting between requests without waiting. */
  sleep?: (ms: number) => Promise<void>;
}

const send = (client: FeatureClient, msg: object) =>
  client.send(msg as unknown as Record<string, unknown>);

const requestIdOf = (msg: Record<string, unknown>): string | null =>
  typeof msg.requestId === 'string' && msg.requestId.length <= REQUEST_ID_MAX
    ? msg.requestId
    : null;

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

/**
 * An image answer: never sniffed into something else, never a document that runs anything (opened on its own it
 * is sandboxed), and only for pages of this same office.
 */
const imageHeaders = (reply: FastifyReply, cache: string): FastifyReply =>
  reply
    .header('Cache-Control', cache)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; sandbox")
    .header('Cross-Origin-Resource-Policy', 'same-origin');

const errorText = (err: unknown) =>
  err instanceof CoverError || err instanceof ImageError ? err.message : 'algo falló al guardar';

/**
 * The game collection (features/coleccion): one JSON file with every game and every "se busca" gap, filled by hand
 * from the page, plus the covers (looked up in libretro-thumbnails and IGDB, or uploaded). Messages: privileged
 * connections only; changes answer with coleccionResult. Cover images: HTTP with the office token.
 */
export function createColeccionFeature(opts: ColeccionFeatureOptions = {}): ServerFeature & {
  /** For tests. */
  readonly store: CollectionStore;
  readonly covers: CoverService;
} {
  const now = opts.now ?? Date.now;
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const store = createCollectionStore({ pixelDir, now, random: opts.random });
  const clients = new Set<FeatureClient>();
  const files = createCoverFiles(pixelDir);
  const keyStore = createIgdbKeyStore(pixelDir);
  const net = createSafeFetch(opts.fetch ?? globalThis.fetch);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const libretro = createLibretroSource({
    net,
    queue: createRateQueue(SOURCE_INTERVAL_MS, now, sleep),
    cacheDir: files.listingsDir,
    now,
  });
  const igdb = createIgdbSource({
    net,
    queue: createRateQueue(SOURCE_INTERVAL_MS, now, sleep),
    key: () => keyStore.get(),
    now,
  });

  function status(): ColeccionStatus {
    store.check();
    return {
      type: 'coleccionStatus',
      games: store.games().map(toWireGame),
      file: store.file(),
      problems: store.problems(),
      igdbKey: keyStore.get() !== null,
      covers: covers.states(),
      coverRun: covers.progress(),
    };
  }

  const broadcast = () => {
    const msg = status();
    for (const c of clients) send(c, msg);
  };

  const covers = createCoverService({
    store,
    files,
    libretro,
    igdb,
    hasKey: () => keyStore.get() !== null,
    now,
    onChange: broadcast,
  });

  // At start: «elige una» lives in memory, so its thumbnails go; and images of games no longer in the collection.
  // Only when the collection was read whole (a missing or broken file would make every cover look orphaned)
  try {
    files.clearAllCandidates();
    if (store.readWhole()) {
      const gone = files.removeOrphans(new Set(store.games().map((g) => g.id)));
      if (gone > 0) console.log(`${LOG_PREFIX} Borré ${gone} portadas de juegos que ya no están.`);
    }
  } catch {
    console.warn(`${LOG_PREFIX} No pude limpiar la carpeta de portadas.`);
  }

  function answer(client: FeatureClient, result: Omit<ColeccionResult, 'type'>): void {
    send(client, { type: 'coleccionResult', ...result } satisfies ColeccionResult);
  }

  /** Runs a change, answers it, and tells every page. */
  async function change(
    client: FeatureClient,
    requestId: string,
    what: string,
    job: () => Promise<string | undefined> | string | undefined,
  ): Promise<void> {
    try {
      const id = await job();
      answer(client, id ? { requestId, ok: true, id } : { requestId, ok: true });
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude ${what}:`, errorText(err));
      answer(client, { requestId, ok: false, error: `No se pudo ${what}: ${errorText(err)}.` });
    }
    broadcast();
  }

  /** A change in the background: it answers on its own and never leaves a rejection behind. */
  const run = (...args: Parameters<typeof change>) =>
    void change(...args).catch(() => console.warn(`${LOG_PREFIX} Un cambio falló sin respuesta.`));

  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    switch (msg.type) {
      case 'coleccionOpen':
        send(client, status());
        return;
      case 'coleccionSave': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const askedId = (msg.game as { id?: unknown } | null)?.id;
          const before = isGameId(askedId) ? store.get(askedId) : undefined;
          const game = store.save(msg.game);
          // Another title or console: the cover search (and a cover a source found for the old one) no longer fits
          if (before && (before.title !== game.title || before.platform !== game.platform))
            covers.gameChanged(game.id, !!before.coverArt && !game.coverArt);
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
          if (ok) covers.forget(String(msg.id));
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
      case 'coleccionCoverFind':
        if (isGameId(msg.id))
          covers
            .find(msg.id, true)
            .catch(() => console.warn(`${LOG_PREFIX} La búsqueda de portada falló.`));
        return;
      case 'coleccionCoverRun':
        if (msg.action === 'start')
          covers
            .startRun()
            .catch(() => console.warn(`${LOG_PREFIX} «Buscar las que faltan» se cortó.`));
        else if (msg.action === 'stop') covers.stopRun();
        broadcast();
        return;
      case 'coleccionCoverPick': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'poner la portada', async () => {
          if (!isGameId(id)) throw new CoverError('No encontré ese juego.');
          await covers.pick(id, Number(msg.n), String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'coleccionCoverDismiss': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'cerrar la elección', () => {
          if (!isGameId(id)) throw new CoverError('No encontré ese juego.');
          covers.dismiss(id, String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'coleccionCoverRemove': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'quitar la portada', () => {
          if (!isGameId(id)) throw new CoverError('No encontré ese juego.');
          covers.remove(id);
          return id;
        });
        return;
      }
      case 'coleccionIgdbKey': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        run(client, requestId, 'guardar la llave', () => {
          if (typeof msg.clientId !== 'string' || typeof msg.clientSecret !== 'string')
            throw new CoverError('Faltan el Client ID o el Client Secret.');
          try {
            keyStore.set({ clientId: msg.clientId, clientSecret: msg.clientSecret });
          } catch (err) {
            throw new CoverError((err as Error).message);
          }
          igdb.forgetToken();
          return undefined;
        });
        return;
      }
      case 'coleccionIgdbKeyRemove': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        run(client, requestId, 'borrar la llave', () => {
          keyStore.remove();
          igdb.forgetToken();
          return undefined;
        });
        return;
      }
      case 'coleccionSetCondition': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        run(client, requestId, 'cambiar el estado', () => {
          const ids = Array.isArray(msg.ids)
            ? msg.ids.filter((x): x is string => isGameId(x)).slice(0, 5000)
            : [];
          const condition = typeof msg.condition === 'string' ? msg.condition : null;
          if (
            condition === null ||
            (condition !== '' && !(CONDITIONS as readonly string[]).includes(condition))
          )
            throw new CoverError('Ese estado no existe.');
          if (ids.length === 0) throw new CoverError('No dijo qué juegos.');
          try {
            store.setConditions(ids, condition as Condition);
          } catch (err) {
            throw new CoverError((err as Error).message);
          }
          return ids.length === 1 ? ids[0] : undefined;
        });
        return;
      }
    }
  }

  // ── HTTP: cover images, office token required ──

  const guard = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (authorized(request, opts.officeToken?.() ?? null)) return true;
    void reply.code(401).send({ error: 'unauthorized' });
    return false;
  };

  function registerRoutes(app: FastifyInstance): void {
    app.get(ROUTE_COVER, async (request, reply) => {
      if (!guard(request, reply)) return reply;
      const id = String((request.params as Record<string, unknown>).id ?? '');
      if (!isGameId(id)) return reply.code(404).send({ error: 'not found' });
      store.check();
      const art = store.get(id)?.coverArt;
      const bytes = art ? files.read(id, art.type) : null;
      if (!art || !bytes) return reply.code(404).send({ error: 'not found' });
      return imageHeaders(reply, 'private, max-age=86400').type(COVER_MIME[art.type]).send(bytes);
    });

    app.get(ROUTE_CANDIDATE, async (request, reply) => {
      if (!guard(request, reply)) return reply;
      const params = request.params as Record<string, unknown>;
      const id = String(params.id ?? '');
      const n = String(params.n ?? '');
      if (!isGameId(id) || !/^[0-3]$/.test(n)) return reply.code(404).send({ error: 'not found' });
      let image: Awaited<ReturnType<CoverService['candidateImage']>>;
      try {
        image = await covers.candidateImage(id, Number(n));
      } catch {
        return reply.code(502).send({ error: 'source unavailable' });
      }
      if (!image) return reply.code(404).send({ error: 'not found' });
      return imageHeaders(reply, 'private, max-age=3600')
        .type(COVER_MIME[image.type])
        .send(Buffer.from(image.bytes));
    });

    // The upload: its own scope, so the raw image parser and the 4 MB limit apply to this route only
    app.register(async (scope) => {
      scope.addContentTypeParser(
        UPLOAD_CONTENT_TYPES,
        { parseAs: 'buffer', bodyLimit: IMAGE_MAX_BYTES },
        (_request, body, done) => done(null, body),
      );
      scope.post(
        ROUTE_COVER,
        {
          bodyLimit: IMAGE_MAX_BYTES,
          // The token is checked before the body is read
          onRequest: async (request, reply) => {
            if (!guard(request, reply)) return reply;
          },
        },
        async (request, reply) => {
          const id = String((request.params as Record<string, unknown>).id ?? '');
          if (!isGameId(id)) return reply.code(404).send({ error: 'not found' });
          const body = request.body;
          if (!Buffer.isBuffer(body))
            return reply.code(415).send({ error: 'unsupported media type' });
          store.check();
          if (!store.get(id)) return reply.code(404).send({ error: 'not found' });
          try {
            const coverArt = covers.upload(id, body);
            return reply.send({ ok: true, coverArt });
          } catch (err) {
            if (err instanceof ImageError)
              return reply
                .code(err.kind === 'tipo' ? 415 : err.kind === 'tamano' ? 413 : 400)
                .send({ ok: false, error: err.message });
            if (err instanceof CoverError)
              return reply.code(404).send({ ok: false, error: err.message });
            console.warn(`${LOG_PREFIX} No pude guardar la portada subida.`);
            return reply.code(500).send({ ok: false, error: 'no se pudo guardar' });
          }
        },
      );
    });
  }

  return {
    name: 'coleccion',
    store,
    covers,
    registerRoutes,

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
        console.warn(`${LOG_PREFIX} No pude atender ${String(msg.type)}:`, errorText(err));
      }
      return true;
    },

    connections(): ConnectionInfo[] {
      const key = keyStore.get() !== null;
      const libOk = libretro.lastOkAt();
      const libProblem = libretro.lastProblem();
      const igOk = igdb.lastOkAt();
      const igProblem = igdb.lastProblem();
      return [
        {
          id: 'coleccion-libretro',
          name: 'Portadas: libretro-thumbnails',
          feature: 'Colección',
          purpose: 'Portadas de los juegos de la colección (cajas por consola)',
          auth: 'Ninguna',
          state: libProblem ? 'warn' : 'ok',
          detail: libProblem
            ? `La última vez ${libProblem}`
            : 'Sin llave; solo sale el nombre y la consola',
          ...(libOk ? { lastUsedAt: libOk } : {}),
        },
        {
          id: 'coleccion-igdb',
          name: 'Portadas: IGDB',
          feature: 'Colección',
          purpose: 'Portadas de las consolas que libretro no tiene y de lo que no encontró',
          auth: 'Client ID y Client Secret de una app de Twitch (de la persona)',
          state: !key ? 'off' : igProblem ? 'warn' : 'ok',
          detail: !key ? 'Sin llave' : igProblem ? `La última vez ${igProblem}` : 'Llave puesta',
          ...(igOk ? { lastUsedAt: igOk } : {}),
        },
      ];
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
  if (g.coverArt) out.coverArt = { ...g.coverArt };
  if (g.coverNone) out.coverNone = g.coverNone;
  return out;
}
