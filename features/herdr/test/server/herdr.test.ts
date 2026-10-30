import { describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { createHerdrFeature, parseHerdr, tabLabels } from '../../server/herdrFeature.js';

const PANES = JSON.stringify({
  result: {
    panes: [
      { pane_id: 'w2:p1', tab_id: 'w2:t1', agent_session: { value: 'stale-a' } },
      { pane_id: 'w2:p2', tab_id: 'w2:t2', agent_session: { value: 'sess-b' } },
      { pane_id: 'w2:p3', tab_id: 'w2:t9' }, // a tab without a name
    ],
  },
});
const TABS = JSON.stringify({
  result: {
    tabs: [
      { tab_id: 'w2:t1', label: 'MI-JUEGO' },
      { tab_id: 'w2:t2', label: '  MI-JUEGO-2 ' },
      { tab_id: 'w2:t9', label: '' },
    ],
  },
});

const fakeRun =
  (panes = PANES, tabs = TABS) =>
  async (args: string[]) =>
    args[0] === 'pane' ? panes : tabs;

describe('herdr', () => {
  it('maps panes to their tab names', () => {
    const h = parseHerdr(PANES, TABS);
    expect([...h.tabOfPane]).toEqual([
      ['w2:p1', 'MI-JUEGO'],
      ['w2:p2', 'MI-JUEGO-2'],
    ]);
    expect(h.paneOfSession.get('sess-b')).toBe('w2:p2');
  });

  it('ignores output it does not understand', () => {
    const h = parseHerdr('not json', '{"result":{"tabs":"nope"}}');
    expect(h.tabOfPane.size).toBe(0);
  });

  it('prefers the pane the hook reported over the session herdr remembers', () => {
    const labels = tabLabels(
      [
        [1, { sessionId: 'sess-a' }], // herdr only knows its pane's old session: the hook tells
        [2, { sessionId: 'sess-b' }], // no hook yet: herdr's own record
        [3, { sessionId: 'sess-c' }], // not in herdr
      ],
      new Map([['sess-a', 'w2:p1']]),
      parseHerdr(PANES, TABS),
    );
    expect(labels).toEqual({ 1: 'MI-JUEGO', 2: 'MI-JUEGO-2' });
  });

  it('tells a tokened page, and only when something changed', async () => {
    const sent: Record<string, unknown>[] = [];
    const client: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
    const feature = createHerdrFeature({
      agents: () => [[7, { sessionId: 'sess-x' }]],
      run: fakeRun(),
      pollMs: 60_000,
    });
    try {
      feature.connect!(client);
      await feature.poll();
      expect(sent).toEqual([]); // nobody named yet: same as the empty start

      feature.noteHookEvent({ session_id: 'sess-x', herdr_pane_id: 'w2:p2' });
      await feature.poll();
      expect(sent).toEqual([{ type: 'herdrTabLabels', labels: { 7: 'MI-JUEGO-2' } }]);

      await feature.poll();
      expect(sent).toHaveLength(1);
    } finally {
      feature.dispose!();
    }
  });

  it('keeps the last names when herdr is not there', async () => {
    const sent: Record<string, unknown>[] = [];
    let up = true;
    const feature = createHerdrFeature({
      agents: () => [[1, { sessionId: 'stale-a' }]],
      run: async (args) => {
        if (!up) throw new Error('herdr not found');
        return fakeRun()(args);
      },
      pollMs: 60_000,
    });
    try {
      await feature.poll(); // the read at startup, before anyone listens
      feature.connect!({ privileged: true, send: (m) => sent.push(m) });
      await feature.poll();
      up = false;
      await feature.poll();
      expect(sent).toEqual([{ type: 'herdrTabLabels', labels: { 1: 'MI-JUEGO' } }]);
    } finally {
      feature.dispose!();
    }
  });

  it('tells untokened pages nothing', async () => {
    const sent: Record<string, unknown>[] = [];
    const feature = createHerdrFeature({
      agents: () => [[1, { sessionId: 'stale-a' }]],
      run: fakeRun(),
      pollMs: 60_000,
    });
    try {
      feature.connect!({ privileged: false, send: (m) => sent.push(m) });
      await feature.poll();
      expect(sent).toEqual([]);
    } finally {
      feature.dispose!();
    }
  });
});
