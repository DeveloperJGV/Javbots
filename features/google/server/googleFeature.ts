import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';

import type { ConnectionInfo } from '../../../core/src/messages.js';
import type { ServerFeature } from '../../../server/src/serverFeature.js';
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_LOGIN_PATH,
  GOOGLE_RECONNECT_WARN_DAYS,
  GOOGLE_SCOPES,
  GOOGLE_TESTING_TOKEN_DAYS,
  LOG_PREFIX,
} from './constants.js';
import {
  createGoogleAccount,
  type Fetcher,
  type GoogleAccount,
  type GoogleApi,
  type GoogleDownload,
  GoogleReconnectNeeded,
} from './googleAccount.js';
import {
  type GoogleConfig,
  googleConfigPath,
  readGoogleConfig,
  updateGoogleConfig,
} from './googleConfig.js';

const DAY_MS = 86_400_000;

/** What other features use: one Google session for all of them. */
export interface GoogleSession {
  /** The app's keys are in google.json. */
  readonly configured: boolean;
  /** There is a session (it may still turn out expired on the next call). */
  readonly connected: boolean;
  /** The owner granted this permission (e.g. GOOGLE_TASKS_SCOPE) on the last login. */
  hasScope(scope: string): boolean;
  /** JSON call to a Google API with the session's token. Throws GoogleReconnectNeeded when the session died. */
  api: GoogleApi;
  /** GET of a file's raw bytes (Drive content) with the session's token; same errors as `api`. */
  download: GoogleDownload;
  /** Days until a Testing app's session dies, only when it's close (≤ 1 day); undefined otherwise. */
  reconnectInDays(): number | undefined;
  /** Log out (every feature loses Google). */
  forget(): void;
  /** Login, logout or expiry; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

export interface GoogleFeatureOptions {
  /** The office's own token: only someone who opened the office with it can connect Google. */
  officeToken: () => string | null;
  /** http://127.0.0.1:<port> of the running office (Google sends the browser back there). */
  serverUrl: () => string | null;
  configFile?: string;
  now?: () => number;
  fetcher?: Fetcher;
}

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:sans-serif;padding:40px">` +
  `<h2>${title}</h2><p>${body}</p></body>`;

/**
 * The owner's Google account (features/google): login (`/api/google/login?token=<office token>`), the session in
 * google.json, and `api` for the features that use Google (Conciertos: Calendar; the agenda: Calendar and Tasks;
 * the roof garden: Calendar, Tasks and reading Drive).
 * Other features get it from cli.ts, or find it by name ('google') among the features a pack receives.
 */
export function createGoogleFeature(opts: GoogleFeatureOptions): ServerFeature & GoogleSession {
  const file = opts.configFile ?? googleConfigPath();
  const now = opts.now ?? Date.now;
  const listeners = new Set<() => void>();
  let config: GoogleConfig = {};
  let mtime = -1;
  let account: GoogleAccount | null = null;
  let okAt: number | undefined;

  const changed = () => {
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Aviso de cambio:`, (err as Error).message);
      }
    }
  };

  const fileTime = () => {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  };

  const save = (changes: Partial<GoogleConfig>) => {
    try {
      updateGoogleConfig(changes, file);
      mtime = fileTime();
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude guardar google.json:`, (err as Error).message);
    }
    config = { ...config, ...changes };
  };

  const makeAccount = (): GoogleAccount | null => {
    if (!config.clientId || !config.clientSecret) return null;
    return createGoogleAccount({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: () => `${opts.serverUrl() ?? 'http://127.0.0.1:3100'}${GOOGLE_CALLBACK_PATH}`,
      refreshToken: config.refreshToken,
      onSession: (s) => {
        save({
          refreshToken: s?.refreshToken,
          scopes: s?.scopes,
          connectedAt: s ? new Date(now()).toISOString() : undefined,
        });
        changed();
      },
      fetcher: opts.fetcher,
      now,
    });
  };

  /** The keys are pasted by hand while the office runs: pick up an edited file without a restart. */
  function fresh(): GoogleAccount | null {
    const t = fileTime();
    if (t === mtime) return account;
    mtime = t;
    const before = config;
    config = readGoogleConfig(file).config;
    if (
      !account ||
      before.clientId !== config.clientId ||
      before.clientSecret !== config.clientSecret ||
      before.refreshToken !== config.refreshToken
    )
      account = makeAccount();
    return account;
  }
  fresh();

  const api: GoogleApi = async (url, init) => {
    const a = fresh();
    if (!a) throw new GoogleReconnectNeeded('sin llaves');
    // A dead session throws GoogleReconnectNeeded; the account already forgot it and told the listeners.
    const out = await a.api(url, init);
    okAt = now();
    return out;
  };

  const download: GoogleDownload = async (url) => {
    const a = fresh();
    if (!a) throw new GoogleReconnectNeeded('sin llaves');
    const out = await a.download(url);
    okAt = now();
    return out;
  };

  function reconnectInDays(): number | undefined {
    if (!fresh()?.connected || !config.connectedAt) return undefined;
    const left = GOOGLE_TESTING_TOKEN_DAYS - (now() - Date.parse(config.connectedAt)) / DAY_MS;
    return left <= GOOGLE_RECONNECT_WARN_DAYS ? Math.max(0, Math.floor(left)) : undefined;
  }

  return {
    name: 'google',
    get configured() {
      return !!fresh();
    },
    get connected() {
      return !!fresh()?.connected;
    },
    hasScope(scope: string) {
      return !!fresh()?.connected && (config.scopes ?? GOOGLE_SCOPES).includes(scope);
    },
    api,
    download,
    reconnectInDays,
    forget() {
      fresh()?.forget();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    registerRoutes(app: FastifyInstance) {
      app.get(GOOGLE_LOGIN_PATH, async (request, reply) => {
        const token = String((request.query as Record<string, unknown>).token ?? '');
        const office = opts.officeToken();
        if (!office || !sameToken(token, office))
          return reply.code(401).send({ error: 'unauthorized' });
        const a = fresh();
        if (!a)
          return reply
            .type('text/html')
            .send(
              page(
                'Falta configurar Google',
                'Pon clientId y clientSecret en ~/.pixel-agents/google.json.',
              ),
            );
        return reply.redirect(a.authorizeUrl());
      });

      app.get(GOOGLE_CALLBACK_PATH, async (request, reply) => {
        const q = request.query as Record<string, unknown>;
        const code = typeof q.code === 'string' ? q.code : '';
        const state = typeof q.state === 'string' ? q.state : '';
        reply.type('text/html');
        const a = fresh();
        if (!a || !code || !state)
          return reply.send(
            page('No se conectó', 'Google no regresó la autorización. Intenta otra vez.'),
          );
        try {
          if (!(await a.finishLogin(code, state)))
            return reply.send(
              page('No se conectó', 'Ese inicio de sesión ya caducó. Intenta otra vez.'),
            );
        } catch (err) {
          console.warn(`${LOG_PREFIX} Login:`, (err as Error).message);
          return reply.send(page('No se conectó', 'Google rechazó la conexión. Intenta otra vez.'));
        }
        return reply.send(
          page('Listo', 'Tu cuenta de Google quedó conectada. Ya puedes cerrar esta pestaña.'),
        );
      });
    },

    handleClientMessage(msg, client) {
      if (!client.privileged || msg.type !== 'disconnectGoogle') return false;
      fresh()?.forget();
      return true;
    },

    /** For the connections board (features/conexiones). No keys or emails in here. */
    connections(): ConnectionInfo[] {
      const a = fresh();
      const reconnect = reconnectInDays();
      let detail = 'Conectado (la sesión dura 7 días)';
      if (!a) detail = 'Faltan las llaves en google.json';
      else if (!a.connected) detail = 'Sin conectar';
      else if (reconnect !== undefined)
        detail = reconnect === 0 ? 'Reconectar hoy' : `Reconectar en ${reconnect} día`;
      return [
        {
          id: 'google',
          name: 'Google (Calendar, Tasks y Drive)',
          feature: 'Google',
          purpose: 'Una sola sesión para las funciones que usan tu calendario y tus tareas',
          auth: 'OAuth de app de escritorio (modo Prueba), permisos calendar, tasks y drive.readonly',
          state: !a?.connected ? 'off' : reconnect !== undefined ? 'warn' : 'ok',
          detail,
          ...(okAt ? { lastUsedAt: new Date(okAt).toISOString() } : {}),
        },
      ];
    },
  };
}

/** A pack's way to the session: the 'google' feature among the ones it receives. */
export function findGoogleSession(features: readonly ServerFeature[]): GoogleSession | null {
  const f = features.find((x) => x.name === 'google');
  return f ? (f as ServerFeature & GoogleSession) : null;
}
