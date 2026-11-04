import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { pomodoroStore } from './pomodoroStore.js';

/**
 * The pomodoro (features/pomodoro), fed from the server into pomodoroStore. Called by App from the start: the server
 * sends the status once when the page opens, and the wall clock needs it before the panel is ever opened.
 */
export function usePomodoro(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'pomodoroStatus') pomodoroStore.setStatus(msg);
      }),
    [transport],
  );
}
