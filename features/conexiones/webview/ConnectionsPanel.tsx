import { useSyncExternalStore } from 'react';

import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { connectionsStore } from './connectionsStore.js';
import { byFeature, sinceText, summaryText } from './connectionsText.js';
import { STATE_COLORS, STATE_LABELS } from './constants.js';

/**
 * The connections board (features/conexiones): every outside service the office talks to, grouped by the office
 * feature that uses it, with how it signs in and how it is doing. Opens with a click on the rack. The list arrives
 * through useConnections, which App calls from the start.
 */
export function ConnectionsPanel() {
  const { connections, panelOpen } = useSyncExternalStore(
    connectionsStore.subscribe,
    connectionsStore.get,
  );
  if (!panelOpen) return null;
  const now = new Date();
  return (
    <Modal
      isOpen
      onClose={() => connectionsStore.close()}
      title="Conexiones"
      className="w-[min(820px,94vw)]"
    >
      <div className="max-h-[70vh] overflow-y-auto px-10 pb-6">
        {!connections ? (
          <p className="text-sm text-text-muted">Aún no llega la lista del servidor.</p>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              {summaryText(connections)}. Cada foco del rack es una conexión: verde funcionando,
              amarillo por atender (parpadea), rojo sin llave o sin conectar, azul idea.
            </p>
            {byFeature(connections).map((group) => (
              <div key={group.feature} className="mt-4">
                <div className="text-lg text-accent-bright">{group.feature}</div>
                <ul className="mt-1 text-sm text-text">
                  {group.items.map((c) => (
                    <li key={c.id} className="mt-2">
                      <span style={{ color: STATE_COLORS[c.state] }}>■</span> {c.name}
                      <span className="text-text-muted"> · {STATE_LABELS[c.state]}</span>
                      {c.detail && <span className="text-text-muted">: {c.detail}</span>}
                      {c.lastUsedAt && (
                        <span className="text-text-muted"> · {sinceText(c.lastUsedAt, now)}</span>
                      )}
                      <div className="pl-12 text-text-muted">
                        {c.purpose}. Entra con: {c.auth}.
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
