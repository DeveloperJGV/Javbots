import * as http from 'http';

import {
  LOG_PREFIX,
  SCREEN_CONTROL_PATH,
  SCREEN_COVER_PATH,
  SCREEN_MAX_BODY_BYTES,
  SCREEN_NOW_PATH,
} from './constants.js';
import { timingSafeEqual } from './token.js';

/**
 * Music endpoint for other screens on the local network (a tablet showing the
 * lyrics, for instance). It is a separate listener so the office itself keeps
 * listening on 127.0.0.1 only: this port serves the current song, its lyrics
 * and its cover, and takes the playback buttons (previous / play-pause / next /
 * volume), and nothing else. Off unless `screenPort` is set in music.json.
 */
export interface ScreenServerOptions {
  port: number;
  /** Interface to bind; every interface by default (that is the point). */
  host?: string;
  /** Music token (read on every request: it can change while running). */
  token: () => string;
  /** JSON body of GET /api/music/now. */
  state: () => unknown;
  /** Current cover as a data URL, if any. */
  cover: () => string | undefined;
  /** Runs a playback command; false when it isn't one or Spotify isn't listening. */
  control?: (action: string) => boolean;
}

/** Small JSON body (a playback command), or undefined when it is too big or not JSON. */
function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > SCREEN_MAX_BODY_BYTES) {
        // Too big for a command: answer now and let the rest drain unread.
        resolve(undefined);
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** `data:<mime>;base64,<bytes>` → bytes and type. */
export function decodeDataUrl(dataUrl: string | undefined): { type: string; bytes: Buffer } | undefined {
  const match = dataUrl ? /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl) : null;
  return match ? { type: match[1], bytes: Buffer.from(match[2], 'base64') } : undefined;
}

export function startScreenServer(opts: ScreenServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://screen');
    const isControl = req.method === 'POST' && url.pathname === SCREEN_CONTROL_PATH && Boolean(opts.control);
    if (req.method !== 'GET' && !isControl) return json(res, 405, { error: 'method not allowed' });

    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!timingSafeEqual(token, opts.token())) return json(res, 401, { error: 'unauthorized' });

    if (isControl) {
      void readBody(req).then((body) => {
        const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
        if (typeof action !== 'string') return json(res, 400, { error: 'bad command' });
        // 409: a valid request Spotify can't take right now (closed, or the extension isn't connected).
        return opts.control?.(action) ? json(res, 200, { ok: true }) : json(res, 409, { error: 'not sent' });
      });
      return;
    }

    if (url.pathname === SCREEN_NOW_PATH) return json(res, 200, opts.state());
    if (url.pathname === SCREEN_COVER_PATH) {
      const cover = decodeDataUrl(opts.cover());
      if (!cover) return json(res, 404, { error: 'no cover' });
      res.writeHead(200, { 'Content-Type': cover.type, 'Cache-Control': 'no-store' });
      res.end(cover.bytes);
      return;
    }
    json(res, 404, { error: 'not found' });
  });
  server.on('error', (err) => {
    console.warn(`${LOG_PREFIX} No se pudo abrir el puerto ${opts.port} para pantallas:`, err.message);
  });
  server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
    console.log(`${LOG_PREFIX} Pantallas en la red: puerto ${opts.port}`);
  });
  return server;
}
