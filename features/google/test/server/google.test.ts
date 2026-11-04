import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DRIVE_READ_SCOPE,
  GOOGLE_TASKS_SCOPE,
} from '../../server/constants.js';
import type { Fetcher } from '../../server/googleAccount.js';
import { GoogleReconnectNeeded } from '../../server/googleAccount.js';
import { createGoogleFeature, findGoogleSession } from '../../server/googleFeature.js';

const DAY_MS = 86_400_000;
const T0 = Date.parse('2026-11-03T12:00:00Z');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('google feature', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function setup(config: Record<string, unknown>, tokenAnswer?: () => Response) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-'));
    const file = path.join(dir, 'google.json');
    fs.writeFileSync(file, JSON.stringify(config));
    let clock = T0;
    const requests: { url: string; body?: string; auth?: string }[] = [];
    const fetcher: Fetcher = async (url, init) => {
      requests.push({ url, body: init.body, auth: init.headers.Authorization });
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return tokenAnswer
          ? tokenAnswer()
          : json(200, {
              access_token: 'at',
              expires_in: 3600,
              refresh_token: 'rt-new',
              scope: `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_TASKS_SCOPE}`,
            });
      return json(200, { items: [] });
    };
    const feature = createGoogleFeature({
      officeToken: () => 'tok',
      serverUrl: () => 'http://127.0.0.1:3100',
      configFile: file,
      now: () => clock,
      fetcher,
    });
    const saved = () => JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    return { feature, file, requests, saved, tick: (ms: number) => (clock += ms) };
  }

  it('logs in once for Calendar and Tasks and keeps the session in google.json', async () => {
    const { feature, saved } = setup({ clientId: 'id', clientSecret: 'secret', otro: 1 });
    expect(feature.configured).toBe(true);
    expect(feature.connected).toBe(false);
    const app = Fastify();
    feature.registerRoutes?.(app);

    expect((await app.inject({ url: '/api/google/login' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/google/login?token=nope' })).statusCode).toBe(401);
    const login = await app.inject({ url: '/api/google/login?token=tok' });
    expect(login.statusCode).toBe(302);
    const auth = new URL(login.headers.location as string);
    expect(auth.searchParams.get('scope')).toBe(
      `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_TASKS_SCOPE} ${GOOGLE_DRIVE_READ_SCOPE}`,
    );
    expect(auth.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3100/api/google/callback');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');

    let changes = 0;
    feature.onChange(() => changes++);
    const state = auth.searchParams.get('state') as string;
    const cb = await app.inject({ url: `/api/google/callback?code=c&state=${state}` });
    expect(cb.body).toContain('Listo');
    expect(changes).toBe(1);
    expect(feature.connected).toBe(true);
    expect(feature.hasScope(GOOGLE_TASKS_SCOPE)).toBe(true);
    // The owner left Drive unticked on the consent screen (the token answer above has no drive scope)
    expect(feature.hasScope(GOOGLE_DRIVE_READ_SCOPE)).toBe(false);
    expect(saved()).toMatchObject({
      clientId: 'id',
      otro: 1,
      refreshToken: 'rt-new',
      connectedAt: new Date(T0).toISOString(),
      scopes: [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE],
    });

    // The same state can't be used twice.
    const again = await app.inject({ url: `/api/google/callback?code=c&state=${state}` });
    expect(again.body).toContain('caducó');
    await app.close();
  });

  it('calls the APIs with the token and warns a day before a Testing session dies', async () => {
    const { feature, requests, tick } = setup({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'rt',
      connectedAt: new Date(T0).toISOString(),
    });
    await feature.api('https://www.googleapis.com/tasks/v1/users/@me/lists');
    expect(requests.at(-1)?.auth).toBe('Bearer at');
    expect(feature.reconnectInDays()).toBeUndefined();
    tick(6.5 * DAY_MS);
    expect(feature.reconnectInDays()).toBe(0);
    expect(feature.connections?.()[0]).toMatchObject({ id: 'google', state: 'warn' });
  });

  it('downloads the raw bytes of a file with the token (Drive content)', async () => {
    const { feature, requests } = setup({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'rt',
    });
    const bytes = await feature.download('https://www.googleapis.com/drive/v3/files/f1?alt=media');
    expect(requests.at(-1)?.auth).toBe('Bearer at');
    expect(bytes.toString('utf8')).toBe(JSON.stringify({ items: [] }));
  });

  it('forgets a dead session and tells the features', async () => {
    const { feature, saved } = setup(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'rt' },
      () => json(400, { error: 'invalid_grant' }),
    );
    let changes = 0;
    feature.onChange(() => changes++);
    await expect(feature.api('https://www.googleapis.com/calendar/v3/x')).rejects.toBeInstanceOf(
      GoogleReconnectNeeded,
    );
    expect(feature.connected).toBe(false);
    expect(changes).toBe(1);
    expect(saved().refreshToken).toBeUndefined();
  });

  it('picks up keys pasted while the office runs, and only privileged pages disconnect', () => {
    const { feature, file } = setup({});
    expect(feature.configured).toBe(false);
    fs.writeFileSync(
      file,
      JSON.stringify({ clientId: 'id', clientSecret: 's', refreshToken: 'rt' }),
    );
    const later = Date.now() / 1000 + 5;
    fs.utimesSync(file, later, later);
    expect(feature.connected).toBe(true);

    const stranger = { privileged: false, send: () => {} };
    expect(feature.handleClientMessage?.({ type: 'disconnectGoogle' }, stranger)).toBe(false);
    expect(feature.connected).toBe(true);
    const owner = { privileged: true, send: () => {} };
    expect(feature.handleClientMessage?.({ type: 'disconnectGoogle' }, owner)).toBe(true);
    expect(feature.connected).toBe(false);
    expect(findGoogleSession([feature])).toBe(feature);
  });
});
