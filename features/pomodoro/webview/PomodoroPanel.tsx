import { useEffect, useState, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { PANEL_TICK_MS } from './constants.js';
import { pomodoroStore } from './pomodoroStore.js';
import { BLOCK_BUTTONS, mmss, PHASE_LABEL, remainingMs, todayText } from './pomodoroText.js';

/**
 * The pomodoro (features/pomodoro): opens from the tomato clock or the hourglass on the roof. Start a focus block or
 * a break, pause, resume or stop; the server keeps the time and sends a Mac notification when it ends.
 */
export function PomodoroPanel({ transport }: { transport: MessageTransport }) {
  const { status, open } = useSyncExternalStore(pomodoroStore.subscribe, pomodoroStore.get);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), PANEL_TICK_MS);
    return () => clearInterval(timer);
  }, [open]);
  if (!open || !status) return null;

  const idle = status.phase === 'idle';
  const send = (msg: Parameters<MessageTransport['send']>[0]) => transport.send(msg);

  return (
    <Modal
      isOpen
      onClose={() => pomodoroStore.close()}
      title="Pomodoro"
      className="w-[min(420px,94vw)]"
    >
      <div className="px-10 pb-8 flex flex-col gap-8 text-sm text-text">
        <div className="flex items-baseline justify-between">
          <span className="text-lg text-accent-bright">
            {PHASE_LABEL[status.phase]}
            {!idle && !status.running ? ' (en pausa)' : ''}
          </span>
          {!idle && <span className="text-2xl">{mmss(remainingMs(status, now))}</span>}
        </div>

        {idle ? (
          <div className="flex flex-col gap-4">
            {BLOCK_BUTTONS.map((b) => (
              <Button
                key={b.phase}
                size="md"
                variant={b.phase === status.suggested ? 'accent' : 'default'}
                className="shadow-pixel"
                onClick={() => send({ type: 'startPomodoro', phase: b.phase })}
              >
                {b.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex gap-4">
            {status.running ? (
              <Button
                size="md"
                className="shadow-pixel flex-1"
                onClick={() => send({ type: 'pausePomodoro' })}
              >
                Pausar
              </Button>
            ) : (
              <Button
                size="md"
                variant="accent"
                className="shadow-pixel flex-1"
                onClick={() => send({ type: 'resumePomodoro' })}
              >
                Seguir
              </Button>
            )}
            <Button
              size="md"
              className="shadow-pixel flex-1"
              onClick={() => send({ type: 'stopPomodoro' })}
            >
              Parar
            </Button>
          </div>
        )}

        <p className="text-text-muted">{todayText(status)}</p>
        <p className="text-text-muted">
          Al terminar te llega un aviso de escritorio (Mac o Windows), aunque la página esté
          cerrada. El siguiente bloque lo empiezas tú.
        </p>
      </div>
    </Modal>
  );
}
