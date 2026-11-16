/**
 * One page read with the browser, as a Response: the HTTP status of the main document and, as body, the HTML already
 * drawn (or the raw answer when the document is not HTML, like a store's JSON). The main document may only be on the
 * source's own hosts: every request of the main frame is paused before it leaves (Fetch, Document) and one to any
 * other host is cut, redirects included. The page's own resources (images, scripts, frames) load as usual. The only
 * thing evaluated in the page is READ_EXPRESSION, fixed here: nothing that comes from the store or the person.
 */
import { NAVEGADOR_LOGIN_PATH, NAVEGADOR_MAX_BODY, TEXT } from '../constants.js';
import { SourceBlocked, SourceInterrupted, SourceReadError } from '../types.js';
import type { Cdp, CdpParams } from './cdp.js';

/** The only expression evaluated in a page: where it ended and its HTML (none when it is bigger than the limit). */
export const READ_EXPRESSION =
  '(() => { const d = document.documentElement; const h = d ? d.outerHTML : ""; ' +
  `return h.length > ${NAVEGADOR_MAX_BODY} ? { href: location.href, tooBig: true } : { href: location.href, html: h }; })()`;

/**
 * "The store refused" (as in http.ts). Once the main frame got one of these it is the answer, even if the page then
 * reloads itself into a 200 (a challenge that passes by itself is not waited out).
 */
const REFUSED = new Set([403, 429, 503]);

/** Statuses a Response cannot carry a body with. */
const NULL_BODY = new Set([101, 204, 205, 304]);

export interface PageLimits {
  /** The whole read, from opening the page to having its body. */
  timeoutMs: number;
  /** After the load event, time for the page to draw its results. */
  settleMs: number;
}

/** Where a page may be: the store's hosts. */
export interface PageAllow {
  hosts: readonly string[];
  /**
   * Only for tests against a local server (http://127.0.0.1:<port>): also plain http and an explicit port. Set only in
   * code that builds the reader for a test; nothing from the panel or ofertas.json reaches it.
   */
  plainHttpForTests?: boolean;
}

/** The exact host of an https URL without a port is one of the allowed ones. */
export function allowedHost(url: string, allow: PageAllow): boolean {
  try {
    const u = new URL(url);
    const scheme = u.protocol === 'https:' || (allow.plainHttpForTests && u.protocol === 'http:');
    const port = u.port === '' || !!allow.plainHttpForTests;
    return !!scheme && port && allow.hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

/** How the reader opens and forgets its own tabs (so any other new tab can be closed). */
export interface TabOwner {
  open(): Promise<string>;
  closed(targetId: string): void;
}

interface MainResponse {
  status: number;
  url: string;
  mimeType: string;
  requestId: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

export async function readPage(
  cdp: Cdp,
  url: string,
  allow: PageAllow,
  limits: PageLimits,
  signal?: AbortSignal,
  tabs?: TabOwner,
): Promise<Response> {
  if (!allowedHost(url, allow)) throw new SourceReadError(TEXT.browserOffsite);
  if (signal?.aborted) throw abortError();

  let targetId: string | undefined;
  let sessionId: string | undefined;
  let mainFrame: string | undefined;
  let offsite = false;
  let loaded = false;
  let crashed = false;
  /** The read is over (timeout, abort or done): a page created late is closed right away. */
  let over = false;
  let main: MainResponse | undefined;
  /** Bytes of the main document as received (its raw answer). */
  let mainBytes = 0;
  /** The first refusal of the main frame, if any. */
  let refused: number | undefined;
  let wake: () => void = () => undefined;
  const send = (method: string, params?: CdpParams) => cdp.send(method, params, sessionId);

  const unsubscribe = cdp.on((method, params, sid) => {
    if (!sessionId || sid !== sessionId) return;
    if (method === 'Fetch.requestPaused') {
      const requestId = str(params.requestId);
      const reqUrl = str((params.request as CdpParams | undefined)?.url);
      // Only the main frame's document is held to the list; frames inside the page are its resources
      if (params.frameId === mainFrame && !allowedHost(reqUrl, allow)) {
        offsite = true;
        void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(
          () => undefined,
        );
        wake();
        return;
      }
      void send('Fetch.continueRequest', { requestId }).catch(() => undefined);
    } else if (method === 'Network.responseReceived') {
      if (params.type !== 'Document' || params.frameId !== mainFrame) return;
      const response = params.response as CdpParams | undefined;
      const status = typeof response?.status === 'number' ? response.status : 0;
      if (REFUSED.has(status)) refused ??= status;
      // Redirect hops do not come here (they ride in requestWillBeSent): a second one is the page loading again
      main = {
        status,
        url: str(response?.url),
        mimeType: str(response?.mimeType),
        requestId: str(params.requestId),
      };
    } else if (method === 'Network.loadingFinished') {
      if (
        main &&
        params.requestId === main.requestId &&
        typeof params.encodedDataLength === 'number'
      )
        mainBytes = params.encodedDataLength;
    } else if (method === 'Page.loadEventFired') {
      loaded = true;
      wake();
    } else if (method === 'Inspector.detached' || method === 'Inspector.targetCrashed') {
      crashed = true;
      wake();
    }
  });

  // The browser closing (the office shutting down, its life limit) cuts the page at once: an interruption
  let interrupt: (err: Error) => void = () => undefined;
  cdp.onClose(() => interrupt(new SourceInterrupted(TEXT.browserClosed)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceReadError(TEXT.browserSlow)), limits.timeoutMs);
    timer.unref?.();
    onAbort = () => reject(abortError());
    interrupt = reject;
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  stop.catch(() => undefined);

  const work = async (): Promise<Response> => {
    targetId = tabs
      ? await tabs.open()
      : str((await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId);
    if (over) {
      // The read ended while the tab was opening: the finally already ran, close it here
      const id = targetId;
      void cdp
        .send('Target.closeTarget', { targetId: id })
        .catch(() => undefined)
        .finally(() => tabs?.closed(id));
      throw abortError();
    }
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = str(attached.sessionId);
    await send('Page.enable');
    await send('Network.enable');
    const tree = await send('Page.getFrameTree');
    mainFrame = str(
      ((tree.frameTree as CdpParams | undefined)?.frame as CdpParams | undefined)?.id,
    );
    if (!mainFrame) throw new SourceReadError(TEXT.browserNoPage);
    await send('Fetch.enable', {
      patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
    });

    const loadedOrCut = new Promise<void>((resolve) => {
      wake = () => {
        if (loaded || offsite || crashed) resolve();
      };
    });
    const nav = await send('Page.navigate', { url });
    if (offsite) throw new SourceReadError(TEXT.browserOffsite);
    if (typeof nav.errorText === 'string' && nav.errorText) {
      throw new SourceReadError(`${TEXT.browserNoPage} (${nav.errorText})`);
    }
    await loadedOrCut;
    if (offsite) throw new SourceReadError(TEXT.browserOffsite);
    // The tab crashed: an error of this read (back-off as usual), not an interruption by the office
    if (crashed) throw new SourceReadError(TEXT.browserClosed);
    await new Promise((r) => setTimeout(r, limits.settleMs));
    if (offsite) throw new SourceReadError(TEXT.browserOffsite);

    const doc = main as MainResponse | undefined;
    if (!doc || doc.status === 0) throw new SourceReadError(TEXT.browserNoPage);
    if (!allowedHost(doc.url, allow)) throw new SourceReadError(TEXT.browserOffsite);

    let finalUrl = doc.url;
    let body: string;
    if (/html/i.test(doc.mimeType)) {
      const read = await send('Runtime.evaluate', {
        expression: READ_EXPRESSION,
        returnByValue: true,
      });
      const value = (read.result as CdpParams | undefined)?.value as CdpParams | undefined;
      if (value?.tooBig === true) throw new SourceReadError(TEXT.browserTooBig);
      finalUrl = str(value?.href) || doc.url;
      body = str(value?.html);
    } else {
      // Not asked for at all when the browser already says it is too big
      if (mainBytes > NAVEGADOR_MAX_BODY) throw new SourceReadError(TEXT.browserTooBig);
      const got = await send('Network.getResponseBody', { requestId: doc.requestId });
      const raw = str(got.body);
      body = got.base64Encoded === true ? Buffer.from(raw, 'base64').toString('utf8') : raw;
      if (body.length > NAVEGADOR_MAX_BODY) throw new SourceReadError(TEXT.browserTooBig);
    }
    if (!allowedHost(finalUrl, allow)) throw new SourceReadError(TEXT.browserOffsite);
    // A sign-in wall on the store's own host: never filled, never waited out
    if (NAVEGADOR_LOGIN_PATH.test(new URL(finalUrl).pathname)) {
      throw new SourceBlocked(TEXT.browserLogin);
    }
    const status = refused ?? doc.status;
    if (status < 200 || status > 599) throw new SourceReadError(TEXT.browserNoPage);
    return new Response(NULL_BODY.has(status) ? null : body, {
      status,
      headers: doc.mimeType ? { 'content-type': doc.mimeType } : undefined,
    });
  };

  try {
    return await Promise.race([work(), stop]);
  } finally {
    over = true;
    interrupt = () => undefined;
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    unsubscribe();
    if (targetId) {
      const id = targetId;
      void cdp
        .send('Target.closeTarget', { targetId: id })
        .catch(() => undefined)
        .finally(() => tabs?.closed(id));
    }
  }
}
