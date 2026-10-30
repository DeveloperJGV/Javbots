import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import type { OfficeState } from '../../../webview-ui/src/office/engine/officeState.js';

/**
 * herdr tab names (features/herdr): keeps `officeState.agentTabLabels` in step with the server, which the labels
 * above the characters and the activity board read instead of the folder. Tokened pages only.
 */
export function useHerdrTabs(transport: MessageTransport, officeState: OfficeState): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'herdrTabLabels') return;
        officeState.agentTabLabels.clear();
        for (const [id, label] of Object.entries(msg.labels)) {
          officeState.agentTabLabels.set(Number(id), label);
        }
      }),
    [transport, officeState],
  );
}
