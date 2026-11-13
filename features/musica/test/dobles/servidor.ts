/**
 * The Spotify double over HTTP, for the isolated test office (never the real Spotify):
 *
 *   npx tsx features/musica/test/dobles/servidor.ts [--port N] [--scopes viejo] [--publicas]
 *
 * `--publicas` lets other people's lists be read (the real API answers 403 since 2026).
 *
 * API under /v1, token under /api/token, same port; point the office at it with
 *   JAVBOTS_SPOTIFY_API_URL=http://127.0.0.1:N/v1  JAVBOTS_SPOTIFY_ACCOUNTS_URL=http://127.0.0.1:N
 * GET /__estado returns the lists created / removed and the calls received; GET /__quitar?id=<list> takes a list
 * out of the library as if the owner removed it in Spotify.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createFakeSpotify, type FakeSpotify } from './fakeSpotify.js';

export function startFakeSpotifyServer(fake: FakeSpotify, port = 0): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const send = (status: number, json?: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(json === undefined ? undefined : JSON.stringify(json));
      };
      if (url.pathname === '/__estado') {
        send(200, {
          created: fake.state.created,
          removed: fake.state.removed,
          played: fake.state.played,
          calls: fake.state.calls,
        });
        return;
      }
      if (url.pathname === '/__quitar') {
        fake.library.delete(url.searchParams.get('id') ?? '');
        send(200, { ok: true });
        return;
      }
      if (url.pathname !== '/api/token' && !url.pathname.startsWith('/v1/')) {
        send(404, { error: { status: 404, message: 'Service not found' } });
        return;
      }
      const path = url.pathname === '/api/token' ? url.pathname : url.pathname.slice('/v1'.length);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = v;
      const body = chunks.length ? Buffer.concat(chunks).toString('utf-8') : undefined;
      const answer = fake.handle(
        req.method ?? 'GET',
        path,
        Object.fromEntries(url.searchParams.entries()),
        headers,
        body,
      );
      send(answer.status, answer.json, answer.headers);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Run directly (not imported by a test).
if (process.argv[1] && /servidor\.ts$/.test(process.argv[1])) {
  const scopes = arg('--scopes') === 'viejo' ? 'old' : 'full';
  const fake = createFakeSpotify({ scopes, publicReadable: process.argv.includes('--publicas') });
  void startFakeSpotifyServer(fake, Number(arg('--port') ?? 0)).then((server) => {
    console.log(`fake-spotify listening ${(server.address() as AddressInfo).port}`);
  });
}
