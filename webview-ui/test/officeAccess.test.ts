import { describe, expect, it } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import type { TransportState } from '../../core/src/transport.js';
import { createOfficeAccessStore } from '../src/officeAccess.js';
import type { MessageTransport } from '../src/transport/types.js';

function fakeTransport() {
  const onMsg = new Set<(m: ServerMessage) => void>();
  const onState = new Set<(s: TransportState) => void>();
  const transport = {
    onMessage: (h: (m: ServerMessage) => void) => (onMsg.add(h), () => onMsg.delete(h)),
    onStateChange: (h: (s: TransportState) => void) => (onState.add(h), () => onState.delete(h)),
  } as unknown as MessageTransport;
  return {
    transport,
    deliver: (m: ServerMessage) => onMsg.forEach((h) => h(m)),
    state: (s: TransportState) => onState.forEach((h) => h(s)),
  };
}

describe('officeAccess store', () => {
  it('keeps an answer that arrived before anyone subscribed (the notice mounts after the layout)', () => {
    const t = fakeTransport();
    const store = createOfficeAccessStore(t.transport);
    t.deliver({ type: 'officeAccess', privileged: false });
    let calls = 0;
    store.subscribe(() => calls++);
    expect(store.get()).toBe(false);
    t.deliver({ type: 'officeAccess', privileged: true });
    expect(store.get()).toBe(true);
    expect(calls).toBe(1);
  });

  it('forgets the answer while the socket is down', () => {
    const t = fakeTransport();
    const store = createOfficeAccessStore(t.transport);
    t.deliver({ type: 'officeAccess', privileged: false });
    t.state('reconnecting');
    expect(store.get()).toBeNull();
    t.state('connected');
    expect(store.get()).toBeNull(); // until the new connection answers
    t.deliver({ type: 'officeAccess', privileged: true });
    expect(store.get()).toBe(true);
  });
});
