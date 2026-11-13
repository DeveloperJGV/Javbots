/**
 * Where alerts go. Each one is a Notifier; the watch calls all of them and one that fails never stops the others.
 *
 * The office adds its own desktop notifier. A phone push through Firebase Cloud Messaging would be one more
 * Notifier, without touching the watch:
 *
 *   function fcmNotifier(opts: { send: (token: string, title: string, body: string, link?: string) => Promise<void>;
 *                                 tokens: () => string[] }): Notifier {
 *     return { id: 'fcm', async notify(alert) {
 *       await Promise.all(opts.tokens().map((t) => opts.send(t, NOTIFICATION_TITLE, alert.text, alert.url)));
 *     } };
 *   }
 *
 * `send` would wrap the Firebase Admin SDK (or its HTTP v1 API) with a service account kept outside the repo, and the
 * device tokens would live in ofertas.json next to "avisadores".
 */
import { LOG_PREFIX, NOTIFICATION_TITLE, NTFY_DEFAULT_SERVER, USER_AGENT } from './constants.js';
import { clock } from './rules.js';
import type { Alert, Notifier } from './types.js';

/** Prints each alert with its digital time. */
export function consoleNotifier(log: (line: string) => void = console.log): Notifier {
  return {
    id: 'consola',
    notify(alert: Alert) {
      const link = alert.url ? `\n        ${alert.url}` : '';
      log(`${LOG_PREFIX} ${clock(Date.parse(alert.at))}  ${alert.text}${link}`);
    },
  };
}

export interface NtfyOptions {
  topic?: string;
  server?: string;
  fetch?: typeof fetch;
}

/**
 * A push to a phone through ntfy (the free app subscribes to the topic). Off (undefined) without a topic. Only the
 * alert text and its link go out, with a generic User-Agent.
 */
export function ntfyNotifier(opts: NtfyOptions): Notifier | undefined {
  const topic = opts.topic?.trim();
  if (!topic) {
    return undefined;
  }
  const server = (opts.server?.trim() || NTFY_DEFAULT_SERVER).replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  return {
    id: 'ntfy',
    async notify(alert: Alert) {
      const headers: Record<string, string> = {
        Title: NOTIFICATION_TITLE,
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': USER_AGENT,
      };
      if (alert.url) {
        headers.Click = alert.url;
      }
      const res = await doFetch(`${server}/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers,
        body: alert.text,
      });
      if (!res.ok) {
        throw new Error(`ntfy ${res.status}`);
      }
    },
  };
}
