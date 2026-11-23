import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as os from 'os';
import * as path from 'path';

import type {
  ComicsLookupFound,
  ComicsLookupResult,
  ComicsResult,
  ComicsSeries,
  ComicsStatus,
  ConnectionInfo,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { COVER_MIME } from '../../coleccion/core/cover.js';
import { cleanText } from '../../coleccion/core/game.js';
import { createCoverFiles, ImageError } from '../../coleccion/server/covers/coverFiles.js';
import { createRateQueue, createSafeFetch } from '../../coleccion/server/covers/net.js';
import { pickCandidates } from '../../libros/core/lookup.js';
import {
  ARCHIVE_SERVER_PATTERN,
  BOOK_HOSTS,
  IMAGE_MAX_BYTES,
  MAX_REDIRECTS,
  SOURCE_INTERVAL_MS,
} from '../../libros/server/covers/constants.js';
import { createOpenLibrary } from '../../libros/server/covers/openLibrary.js';
import { aniScore } from '../core/lookup.js';
import { isSeriesId } from '../core/series.js';
import type { Series } from '../core/types.js';
import { createAniList } from './aniList.js';
import { type ComicsStore, createComicsStore } from './comicsStore.js';
import {
  ANILIST_API_HOST,
  ANILIST_IMAGE_HOST,
  ANILIST_INTERVAL_MS,
  COVERS_DIR,
  LOG_PREFIX,
  LOOKUP_MAX,
  MESSAGES,
  REQUEST_ID_MAX,
  ROUTE_CANDIDATE,
  ROUTE_COVER,
  UPLOAD_CONTENT_TYPES,
} from './constants.js';
import { seriesCoverChanged } from './coverIdentity.js';
import { type ComicCoverService, CoverError, createComicCoverService } from './coverService.js';

export interface ComicsFeatureOptions {
  /** The home folder (tests: a temp folder); the file goes to <home>/.pixel-agents/comics.json. */
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

/** An image answer: never sniffed into something else, never a document that runs anything, same office only. */
const imageHeaders = (reply: FastifyReply, cache: string): FastifyReply =>
  reply
    .header('Cache-Control', cache)
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; sandbox")
    .header('Cross-Origin-Resource-Policy', 'same-origin');

const errorText = (err: unknown) =>
  err instanceof CoverError || err instanceof ImageError ? err.message : 'algo falló al guardar';

/**
 * Comics and manga (features/comics): one JSON file with every series and which of its volumes are here, filled by
 * hand, plus what AniList (manga) and Open Library (comics, and any volume's ISBN) know: a series' data and covers.
 * Messages: privileged connections only; changes answer with comicsResult. Cover images: HTTP with the office token.
 */
export function createComicsFeature(opts: ComicsFeatureOptions = {}): ServerFeature & {
  /** For tests. */
  readonly store: ComicsStore;
  readonly covers: ComicCoverService;
} {
  const now = opts.now ?? Date.now;
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const store = createComicsStore({ pixelDir, now, random: opts.random });
  const clients = new Set<FeatureClient>();
  const files = createCoverFiles(pixelDir, COVERS_DIR);
  const net = createSafeFetch(opts.fetch ?? globalThis.fetch, {
    hosts: new Set([...BOOK_HOSTS, ANILIST_API_HOST, ANILIST_IMAGE_HOST]),
    hostPattern: ARCHIVE_SERVER_PATTERN,
    maxRedirects: MAX_REDIRECTS,
  });
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ol = createOpenLibrary({
    net,
    queue: createRateQueue(SOURCE_INTERVAL_MS, now, sleep),
    now,
  });
  const ani = createAniList({ net, queue: createRateQueue(ANILIST_INTERVAL_MS, now, sleep), now });

  function status(): ComicsStatus {
    store.check();
    const run = covers.progress();
    return {
      type: 'comicsStatus',
      series: store.list().map(toWireSeries),
      file: store.file(),
      problems: store.problems(),
      covers: covers.states(),
      ...(run ? { coverRun: run } : {}),
    };
  }

  const broadcast = () => {
    const msg = status();
    for (const c of clients) send(c, msg);
  };

  const covers = createComicCoverService({ store, files, ol, ani, now, onChange: broadcast });

  // At start: «elige una» lives in memory, so its thumbnails go; and images of books no longer in the library.
  // Only when the library was read whole (a missing or broken file would make every cover look orphaned)
  try {
    files.clearAllCandidates();
    if (store.readWhole()) {
      const gone = files.removeOrphans(new Set(store.list().map((b) => b.id)));
      if (gone > 0) console.log(`${LOG_PREFIX} Borré ${gone} portadas de series que ya no están.`);
    }
  } catch {
    console.warn(`${LOG_PREFIX} No pude limpiar la carpeta de portadas.`);
  }

  function answer(client: FeatureClient, result: Omit<ComicsResult, 'type'>): void {
    send(client, { type: 'comicsResult', ...result } satisfies ComicsResult);
  }

  /** Runs a change, answers it, and tells every page. Never leaves a rejection behind. */
  function run(
    client: FeatureClient,
    requestId: string,
    what: string,
    job: () => Promise<string | undefined> | string | undefined,
  ): void {
    void (async () => {
      try {
        const id = await job();
        answer(client, id ? { requestId, ok: true, id } : { requestId, ok: true });
      } catch (err) {
        console.warn(`${LOG_PREFIX} No pude ${what}:`, errorText(err));
        answer(client, { requestId, ok: false, error: `No se pudo ${what}: ${errorText(err)}.` });
      }
      broadcast();
    })().catch(() => console.warn(`${LOG_PREFIX} Un cambio falló sin respuesta.`));
  }

  /** What AniList (manga, or kind not said) or Open Library (comics) has with that title: shown, never saved. */
  function lookup(
    client: FeatureClient,
    requestId: string,
    rawTitle: unknown,
    kind: unknown,
  ): void {
    const title = cleanText(typeof rawTitle === 'string' ? rawTitle.replace(/\s+/g, ' ') : '', 160);
    const reply = (r: Omit<ComicsLookupResult, 'type' | 'requestId'>) =>
      send(client, { type: 'comicsLookupResult', requestId, ...r } satisfies ComicsLookupResult);
    if (!title) {
      reply({ ok: false, reason: 'nada' });
      return;
    }
    const western = kind === 'comic' || kind === 'novela-grafica';
    const job: Promise<ComicsLookupFound[]> = western
      ? ol.search(title, '').then((docs) =>
          pickCandidates({ title, authors: [] }, docs, LOOKUP_MAX).map((d) => ({
            source: 'openlibrary' as const,
            title: d.title,
            altTitle: '',
            writers: d.authors,
            artists: [],
            volumes: 0,
            finished: false,
            year: d.year,
            genres: [],
          })),
        )
      : ani.search(title).then((docs) =>
          docs
            .filter((d) => aniScore(title, d) > 0)
            .sort((a, b) => aniScore(title, b) - aniScore(title, a))
            .slice(0, LOOKUP_MAX)
            .map(({ id: _id, coverUrl: _c, ...d }) => ({ source: 'anilist' as const, ...d })),
        );
    job
      .then((found) => reply(found.length ? { ok: true, found } : { ok: false, reason: 'nada' }))
      .catch(() => reply({ ok: false, reason: 'sin-respuesta' }));
  }

  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    switch (msg.type) {
      case 'comicsOpen':
        send(client, status());
        return;
      case 'comicsSave': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const askedId = (msg.series as { id?: unknown } | null)?.id;
          const before = isSeriesId(askedId) ? store.get(askedId) : undefined;
          const book = store.save(msg.series);
          // Another title or first writer: the cover search (and a cover found for the old one) no longer fits
          if (before && seriesCoverChanged(before, book))
            covers.seriesChanged(book.id, !!before.coverArt && !book.coverArt);
          answer(client, { requestId, ok: true, id: book.id });
        } catch (err) {
          console.warn(`${LOG_PREFIX} No pude guardar la serie:`, (err as Error).message);
          answer(client, {
            requestId,
            ok: false,
            error: `No se guardó: ${(err as Error).message}.`,
          });
        }
        broadcast();
        return;
      }
      case 'comicsDelete': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const ok = typeof msg.id === 'string' && store.remove(msg.id);
          if (ok) covers.forget(String(msg.id));
          answer(
            client,
            ok
              ? { requestId, ok: true, id: String(msg.id) }
              : { requestId, ok: false, error: 'No encontré esa serie para borrarla.' },
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
      case 'comicsLookup': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        lookup(client, requestId, msg.title, msg.kind);
        return;
      }
      case 'comicsCoverFind':
        if (isSeriesId(msg.id))
          covers
            .find(msg.id, true)
            .catch(() => console.warn(`${LOG_PREFIX} La búsqueda de portada falló.`));
        return;
      case 'comicsCoverRun':
        if (msg.action === 'start')
          covers
            .startRun()
            .catch(() => console.warn(`${LOG_PREFIX} «Buscar las que faltan» se cortó.`));
        else if (msg.action === 'stop') covers.stopRun();
        broadcast();
        return;
      case 'comicsCoverPick': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'poner la portada', async () => {
          if (!isSeriesId(id)) throw new CoverError('No encontré esa serie.');
          await covers.pick(id, Number(msg.n), String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'comicsCoverDismiss': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'cerrar la elección', () => {
          if (!isSeriesId(id)) throw new CoverError('No encontré esa serie.');
          covers.dismiss(id, String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'comicsCoverRemove': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'quitar la portada', () => {
          if (!isSeriesId(id)) throw new CoverError('No encontré esa serie.');
          covers.remove(id);
          return id;
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
      if (!isSeriesId(id)) return reply.code(404).send({ error: 'not found' });
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
      if (!isSeriesId(id) || !/^[0-3]$/.test(n))
        return reply.code(404).send({ error: 'not found' });
      let image: Awaited<ReturnType<ComicCoverService['candidateImage']>>;
      try {
        image = await covers.candidateImage(id, Number(n));
      } catch {
        return reply.code(502).send({ error: 'source unavailable' });
      }
      if (!image) return reply.code(404).send({ error: 'not found' });
      return imageHeaders(reply, 'private, max-age=3600')
        .type(COVER_MIME[image.type as keyof typeof COVER_MIME])
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
          if (!isSeriesId(id)) return reply.code(404).send({ error: 'not found' });
          const body = request.body;
          if (!Buffer.isBuffer(body))
            return reply.code(415).send({ error: 'unsupported media type' });
          store.check();
          if (!store.get(id)) return reply.code(404).send({ error: 'not found' });
          try {
            const coverArt = covers.upload(id, body);
            broadcast();
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
    name: 'comics',
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
      const aOk = ani.lastOkAt();
      const aProblem = ani.lastProblem();
      const oOk = ol.lastOkAt();
      const oProblem = ol.lastProblem();
      return [
        {
          id: 'comics-anilist',
          name: 'Cómics: AniList',
          feature: 'Cómics y manga',
          purpose: 'Datos y portadas de las series de manga',
          auth: 'Ninguna',
          state: aProblem ? 'warn' : 'ok',
          detail: aProblem
            ? `La última vez ${aProblem}`
            : 'Sin llave; solo sale el título de la serie',
          ...(aOk ? { lastUsedAt: aOk } : {}),
        },
        {
          id: 'comics-openlibrary',
          name: 'Cómics: Open Library',
          feature: 'Cómics y manga',
          purpose: 'Datos y portadas de cómics, y portadas por el ISBN de un tomo',
          auth: 'Ninguna',
          state: oProblem ? 'warn' : 'ok',
          detail: oProblem
            ? `La última vez ${oProblem}`
            : 'Sin llave; solo sale el ISBN, o el título y el autor',
          ...(oOk ? { lastUsedAt: oOk } : {}),
        },
      ];
    },
  };
}

/** The series as the protocol has it (no extra fields: additionalProperties is false). */
export function toWireSeries(s: Series): ComicsSeries {
  const out: ComicsSeries = {
    id: s.id,
    title: s.title,
    writers: [...s.writers],
    artists: [...s.artists],
    publisher: s.publisher,
    localPublisher: s.localPublisher,
    kind: s.kind,
    genre: s.genre,
    year: s.year,
    language: s.language,
    format: s.format,
    totalVolumes: s.totalVolumes,
    finished: s.finished,
    readUpTo: s.readUpTo,
    owner: s.owner,
    notes: s.notes,
    volumes: s.volumes.map((v) => ({ ...v })),
    addedAt: s.addedAt,
    updatedAt: s.updatedAt,
  };
  if (s.coverArt) out.coverArt = { ...s.coverArt };
  if (s.coverNone) out.coverNone = s.coverNone;
  return out;
}
