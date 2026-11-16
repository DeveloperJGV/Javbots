/**
 * The smallest client of the browser's debugging protocol (CDP) the reader needs: commands with an id and a time
 * limit, events to listeners, flat sessions (one per page). Over the browser's own pipe; nothing to
 * install.
 */
import { StringDecoder } from 'string_decoder';

import { NAVEGADOR_CDP_TIMEOUT_MS, TEXT } from '../constants.js';
import { SourceInterrupted } from '../types.js';

export type CdpParams = Record<string, unknown>;
export type CdpListener = (method: string, params: CdpParams, sessionId?: string) => void;

export interface Cdp {
  /** One command; rejects with the browser's error, on the time limit, or when the connection closes. */
  send(method: string, params?: CdpParams, sessionId?: string): Promise<CdpParams>;
  /** Every event. Returns the unsubscribe. */
  on(listener: CdpListener): () => void;
  /** Called once when the connection closes (the browser exited or close() was called). */
  onClose(listener: () => void): void;
  close(): void;
}

/** What the reader needs of a message channel to the browser (its pipe; tests pass a double). */
export interface CdpSocket {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

/** Wraps an already open socket. */
export function cdpOver(socket: CdpSocket, timeoutMs = NAVEGADOR_CDP_TIMEOUT_MS): Cdp {
  let nextId = 0;
  let closed = false;
  const pending = new Map<
    number,
    {
      resolve: (v: CdpParams) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const listeners = new Set<CdpListener>();
  const closeListeners: Array<() => void> = [];

  const finish = (): void => {
    if (closed) return;
    closed = true;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new SourceInterrupted(TEXT.browserClosed));
    }
    pending.clear();
    for (const l of closeListeners.splice(0)) {
      try {
        l();
      } catch {
        // a listener's failure does not stop the others
      }
    }
  };

  socket.onmessage = (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      const error = msg.error as { message?: unknown } | undefined;
      if (error) p.reject(new Error(`CDP: ${String(error.message ?? 'error')}`));
      else p.resolve((msg.result as CdpParams | undefined) ?? {});
      return;
    }
    if (typeof msg.method !== 'string') return;
    const params = (msg.params as CdpParams | undefined) ?? {};
    const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : undefined;
    for (const l of [...listeners]) {
      try {
        l(msg.method, params, sessionId);
      } catch {
        // one listener's failure does not stop the others
      }
    }
  };
  socket.onclose = () => finish();
  socket.onerror = () => finish();

  return {
    send(method, params = {}, sessionId) {
      if (closed) return Promise.reject(new SourceInterrupted(TEXT.browserClosed));
      const id = ++nextId;
      return new Promise<CdpParams>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP: ${method} no contestó`));
        }, timeoutMs);
        timer.unref?.();
        pending.set(id, { resolve, reject, timer });
        const msg: Record<string, unknown> = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        try {
          socket.send(JSON.stringify(msg));
        } catch (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onClose(listener) {
      if (closed) listener();
      else closeListeners.push(listener);
    },
    close() {
      try {
        socket.close();
      } catch {
        // already closed
      }
      finish();
    },
  };
}

/**
 * The browser's own pipe (--remote-debugging-pipe): it reads commands on its fd 3 and writes answers on its fd 4, one
 * JSON message per chunk ending in "\0". No port, nothing another local program can connect to.
 */
export function pipeSocket(
  toBrowser: NodeJS.WritableStream,
  fromBrowser: NodeJS.ReadableStream,
): CdpSocket {
  let buffered = '';
  // A character split between two chunks (a «ñ» is two bytes) is decoded whole
  const decoder = new StringDecoder('utf8');
  let closed = false;
  const socket: CdpSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      if (closed) throw new SourceInterrupted(TEXT.browserClosed);
      toBrowser.write(`${data}\0`);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        toBrowser.end();
      } catch {
        // already gone
      }
      socket.onclose?.({});
    },
  };
  fromBrowser.on('data', (chunk: Buffer | string) => {
    buffered += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let end: number;
    while ((end = buffered.indexOf('\0')) >= 0) {
      const message = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      socket.onmessage?.({ data: message });
    }
  });
  const gone = (): void => {
    if (closed) return;
    closed = true;
    socket.onclose?.({});
  };
  fromBrowser.on('end', gone);
  fromBrowser.on('close', gone);
  fromBrowser.on('error', gone);
  toBrowser.on('error', gone);
  return socket;
}
