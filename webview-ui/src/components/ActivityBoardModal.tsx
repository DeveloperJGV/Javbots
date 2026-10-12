import { useEffect, useState, useSyncExternalStore } from 'react';

import type { ActivityLog } from '../office/board/activityLog.js';
import { activityLines, ago, clockText, markColor, stateText } from '../office/board/boardText.js';
import { Modal } from './ui/Modal.js';

/** Refresh "hace N min" while the panel is open. */
const AGO_REFRESH_MS = 30_000;

interface ActivityBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityLog;
}

/** The activity board's panel: what each agent did since the page was opened. */
export function ActivityBoardModal({ isOpen, onClose, activity }: ActivityBoardModalProps) {
  useSyncExternalStore(activity.subscribe, activity.getVersion);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), AGO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isOpen]);

  const agents = activity.summaries();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pizarrón" className="w-[min(560px,92vw)]">
      <p className="px-10 pb-4 text-sm text-text-muted">
        Lo que hizo cada agente desde que abriste la oficina, a las {clockText(activity.startedAt)}.
        Se borra al recargar la página.
      </p>
      <div className="max-h-[60vh] overflow-y-auto px-10 pb-4">
        {agents.length === 0 ? (
          <p className="py-8 text-center text-text-muted">Todavía no hay actividad.</p>
        ) : (
          agents.map((a) => (
            <div key={a.id} className="border-b border-border py-6 last:border-b-0">
              <div className="flex items-center gap-6">
                <span
                  className="inline-block w-10 h-10 shrink-0"
                  style={{ backgroundColor: markColor(a) }}
                  aria-hidden="true"
                />
                <span className="text-lg text-text">{a.name}</span>
                <span className="ml-auto text-sm text-text-muted whitespace-nowrap">
                  {stateText(a.state)} · {ago(a.lastAt, now)}
                </span>
              </div>
              <ul className="mt-2 pl-16 text-sm text-text">
                {activityLines(a).map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
