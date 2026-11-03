import { describe, expect, it } from 'vitest';

import type { ConnectionInfo } from '../../../../core/src/messages.js';
import type { ServerFeature } from '../../../../server/src/serverFeature.js';
import { createGithubFeature } from '../../../github/server/githubFeature.js';
import { collectConnections, createConnectionsFeature } from '../../server/connectionsFeature.js';

const conn = (id: string, state: ConnectionInfo['state'] = 'ok'): ConnectionInfo => ({
  id,
  name: id,
  feature: 'Prueba',
  purpose: 'probar',
  auth: 'sin llave',
  state,
});

describe('collectConnections', () => {
  it('keeps feature order, skips features without connections, drops repeated ids', () => {
    const features: ServerFeature[] = [
      { name: 'a', connections: () => [conn('uno'), conn('dos')] },
      { name: 'b' },
      { name: 'c', connections: () => [conn('dos', 'warn'), conn('tres', 'idea')] },
    ];
    expect(collectConnections(features).map((c) => [c.id, c.state])).toEqual([
      ['uno', 'ok'],
      ['dos', 'ok'],
      ['tres', 'idea'],
    ]);
  });

  it('a feature that throws does not take the board down', () => {
    const features: ServerFeature[] = [
      {
        name: 'rota',
        connections: () => {
          throw new Error('boom');
        },
      },
      { name: 'bien', connections: () => [conn('uno')] },
    ];
    expect(collectConnections(features).map((c) => c.id)).toEqual(['uno']);
  });
});

describe('createConnectionsFeature', () => {
  it('privileged pages get the board on ready and again only when it changes', async () => {
    let state: ConnectionInfo['state'] = 'off';
    const features: ServerFeature[] = [{ name: 'x', connections: () => [conn('uno', state)] }];
    const feature = createConnectionsFeature({ features: () => features, pollMs: 3_600_000 });
    await feature.poll(); // the read at start (nobody listening)
    const sent: Array<Record<string, unknown>> = [];
    const guest: Array<Record<string, unknown>> = [];
    const page = { privileged: true, send: (m: Record<string, unknown>) => sent.push(m) };
    feature.connect?.(page);
    feature.connect?.({ privileged: false, send: (m) => guest.push(m) });
    feature.handleClientMessage?.({ type: 'webviewReady' }, page);
    expect(sent.at(-1)).toMatchObject({
      type: 'connectionsStatus',
      connections: [{ id: 'uno', state: 'off' }],
    });
    await feature.poll();
    const count = sent.length;
    await feature.poll();
    expect(sent).toHaveLength(count);
    state = 'ok';
    await feature.poll();
    expect(sent.at(-1)).toMatchObject({ connections: [{ id: 'uno', state: 'ok' }] });
    expect(guest).toHaveLength(0);
    feature.dispose?.();
  });

  it('reports what a real feature says (GitHub: off, then ok, then warn when gh fails)', async () => {
    let answer: unknown = null;
    let clock = Date.parse('2026-11-03T10:00:00Z');
    const github = createGithubFeature({
      now: () => new Date(clock),
      tickMs: 3_600_000,
      query: async () => answer,
    });
    await github.poll(); // the read at start (nobody listening)
    expect(github.connections()[0]).toMatchObject({ id: 'github', state: 'off' });
    github.connect?.({ privileged: true, send: () => {} });
    answer = { data: { viewer: { login: 'alguien', repositories: { nodes: [] } } } };
    await github.poll();
    expect(github.connections()[0]).toMatchObject({
      state: 'ok',
      detail: 'Conectado como alguien',
    });
    answer = null;
    clock += 60 * 60_000;
    await github.poll();
    expect(github.connections()[0]).toMatchObject({ state: 'warn' });
    github.dispose?.();
  });
});
