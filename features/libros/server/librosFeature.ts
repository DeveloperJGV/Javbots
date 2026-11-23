import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as os from 'os';
import * as path from 'path';

import type {
  ConnectionInfo,
  LibrosBook,
  LibrosLookupResult,
  LibrosResult,
  LibrosStatus,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { COVER_MIME } from '../../coleccion/core/cover.js';
import { createCoverFiles, ImageError } from '../../coleccion/server/covers/coverFiles.js';
import { createRateQueue, createSafeFetch } from '../../coleccion/server/covers/net.js';
import { isBookId } from '../core/book.js';
import { coverIdentityChanged } from '../core/cover.js';
import { cleanIsbn, isbnValid } from '../core/isbn.js';
import type { Book } from '../core/types.js';
import {
  LOG_PREFIX,
  MESSAGES,
  REQUEST_ID_MAX,
  ROUTE_CANDIDATE,
  ROUTE_COVER,
  UPLOAD_CONTENT_TYPES,
} from './constants.js';
import {
  ARCHIVE_SERVER_PATTERN,
  BOOK_HOSTS,
  COVERS_DIR,
  IMAGE_MAX_BYTES,
  MAX_REDIRECTS,
  SOURCE_INTERVAL_MS,
} from './covers/constants.js';
import { CoverError, type CoverService, createCoverService } from './covers/coverService.js';
import { createOpenLibrary } from './covers/openLibrary.js';
import { createLibraryStore, type LibraryStore } from './libraryStore.js';

export interface LibrosFeatureOptions {
  /** The home folder (tests: a temp folder); the file goes to <home>/.pixel-agents/libros.json. */
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
 * The book library (features/libros): one JSON file with every book and every "se busca" gap, filled by hand from
 * the page, plus what Open Library knows (a book's data by its ISBN, and covers). Messages: privileged connections
 * only; changes answer with librosResult. Cover images: HTTP with the office token.
 */
export function createLibrosFeature(opts: LibrosFeatureOptions = {}): ServerFeature & {
  /** For tests. */
  readonly store: LibraryStore;
  readonly covers: CoverService;
} {
  const now = opts.now ?? Date.now;
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const store = createLibraryStore({ pixelDir, now, random: opts.random });
  const clients = new Set<FeatureClient>();
  const files = createCoverFiles(pixelDir, COVERS_DIR);
  const net = createSafeFetch(opts.fetch ?? globalThis.fetch, {
    hosts: BOOK_HOSTS,
    hostPattern: ARCHIVE_SERVER_PATTERN,
    maxRedirects: MAX_REDIRECTS,
  });
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ol = createOpenLibrary({
    net,
    queue: createRateQueue(SOURCE_INTERVAL_MS, now, sleep),
    now,
  });

  function status(): LibrosStatus {
    store.check();
    const run = covers.progress();
    return {
      type: 'librosStatus',
      books: store.books().map(toWireBook),
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

  const covers = createCoverService({ store, files, ol, now, onChange: broadcast });

  // At start: «elige una» lives in memory, so its thumbnails go; and images of books no longer in the library.
  // Only when the library was read whole (a missing or broken file would make every cover look orphaned)
  try {
    files.clearAllCandidates();
    if (store.readWhole()) {
      const gone = files.removeOrphans(new Set(store.books().map((b) => b.id)));
      if (gone > 0) console.log(`${LOG_PREFIX} Borré ${gone} portadas de libros que ya no están.`);
    }
  } catch {
    console.warn(`${LOG_PREFIX} No pude limpiar la carpeta de portadas.`);
  }

  function answer(client: FeatureClient, result: Omit<LibrosResult, 'type'>): void {
    send(client, { type: 'librosResult', ...result } satisfies LibrosResult);
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

  function lookup(client: FeatureClient, requestId: string, rawIsbn: unknown): void {
    const isbn = cleanIsbn(rawIsbn);
    const reply = (r: Omit<LibrosLookupResult, 'type' | 'requestId' | 'isbn'>) =>
      send(client, {
        type: 'librosLookupResult',
        requestId,
        isbn,
        ...r,
      } satisfies LibrosLookupResult);
    if (!isbnValid(isbn)) {
      reply({ ok: false, reason: 'invalido' });
      return;
    }
    ol.lookup(isbn)
      .then((found) => {
        if (!found) reply({ ok: false, reason: 'desconocido' });
        else {
          const { coverId, ...data } = found;
          reply({ ok: true, found: { ...data, hasCover: !!coverId } });
        }
      })
      .catch(() => reply({ ok: false, reason: 'sin-respuesta' }));
  }

  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    switch (msg.type) {
      case 'librosOpen':
        send(client, status());
        return;
      case 'librosSave': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const askedId = (msg.book as { id?: unknown } | null)?.id;
          const before = isBookId(askedId) ? store.get(askedId) : undefined;
          const book = store.save(msg.book);
          // Another title, first author or ISBN: the cover search (and a cover found for the old one) no longer fits
          if (before && coverIdentityChanged(before, book))
            covers.bookChanged(book.id, !!before.coverArt && !book.coverArt);
          answer(client, { requestId, ok: true, id: book.id });
        } catch (err) {
          console.warn(`${LOG_PREFIX} No pude guardar el libro:`, (err as Error).message);
          answer(client, {
            requestId,
            ok: false,
            error: `No se guardó: ${(err as Error).message}.`,
          });
        }
        broadcast();
        return;
      }
      case 'librosDelete': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        try {
          const ok = typeof msg.id === 'string' && store.remove(msg.id);
          if (ok) covers.forget(String(msg.id));
          answer(
            client,
            ok
              ? { requestId, ok: true, id: String(msg.id) }
              : { requestId, ok: false, error: 'No encontré ese libro para borrarlo.' },
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
      case 'librosLookup': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        lookup(client, requestId, msg.isbn);
        return;
      }
      case 'librosCoverFind':
        if (isBookId(msg.id))
          covers
            .find(msg.id, true)
            .catch(() => console.warn(`${LOG_PREFIX} La búsqueda de portada falló.`));
        return;
      case 'librosCoverRun':
        if (msg.action === 'start')
          covers
            .startRun()
            .catch(() => console.warn(`${LOG_PREFIX} «Buscar las que faltan» se cortó.`));
        else if (msg.action === 'stop') covers.stopRun();
        broadcast();
        return;
      case 'librosCoverPick': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'poner la portada', async () => {
          if (!isBookId(id)) throw new CoverError('No encontré ese libro.');
          await covers.pick(id, Number(msg.n), String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'librosCoverDismiss': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'cerrar la elección', () => {
          if (!isBookId(id)) throw new CoverError('No encontré ese libro.');
          covers.dismiss(id, String(msg.stamp ?? ''));
          return id;
        });
        return;
      }
      case 'librosCoverRemove': {
        const requestId = requestIdOf(msg);
        if (requestId === null) return;
        const id = String(msg.id);
        run(client, requestId, 'quitar la portada', () => {
          if (!isBookId(id)) throw new CoverError('No encontré ese libro.');
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
      if (!isBookId(id)) return reply.code(404).send({ error: 'not found' });
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
      if (!isBookId(id) || !/^[0-3]$/.test(n)) return reply.code(404).send({ error: 'not found' });
      let image: Awaited<ReturnType<CoverService['candidateImage']>>;
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
          if (!isBookId(id)) return reply.code(404).send({ error: 'not found' });
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
    name: 'libros',
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
      const okAt = ol.lastOkAt();
      const problem = ol.lastProblem();
      return [
        {
          id: 'libros-openlibrary',
          name: 'Libros: Open Library',
          feature: 'Libros',
          purpose: 'Datos de un libro por su ISBN y portadas de los libros',
          auth: 'Ninguna',
          state: problem ? 'warn' : 'ok',
          detail: problem
            ? `La última vez ${problem}`
            : 'Sin llave; solo sale el ISBN, o el título y el autor',
          ...(okAt ? { lastUsedAt: okAt } : {}),
        },
      ];
    },
  };
}

/** The book as the protocol has it (no extra fields: additionalProperties is false). */
export function toWireBook(b: Book): LibrosBook {
  const out: LibrosBook = {
    id: b.id,
    title: b.title,
    authors: [...b.authors],
    publisher: b.publisher,
    genre: b.genre,
    year: b.year,
    isbn: b.isbn,
    language: b.language,
    format: b.format,
    pages: b.pages,
    series: b.series,
    seriesNumber: b.seriesNumber,
    reading: b.reading,
    owner: b.owner,
    lentTo: b.lentTo,
    lentAt: b.lentAt,
    notes: b.notes,
    wanted: b.wanted,
    price: b.price,
    seenAt: b.seenAt,
    addedAt: b.addedAt,
    finishedAt: b.finishedAt,
    updatedAt: b.updatedAt,
  };
  if (b.coverArt) out.coverArt = { ...b.coverArt };
  if (b.coverNone) out.coverNone = b.coverNone;
  return out;
}
