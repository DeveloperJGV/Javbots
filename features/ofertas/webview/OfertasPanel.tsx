import { useEffect, useState, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { OFERTAS_TABS, type OfertasTab, PANEL_TICK_MS } from './constants.js';
import { OfertasAjustes, OfertasAvisos } from './OfertasAjustes.js';
import { OfertasBuscar } from './OfertasBuscar.js';
import type { Send } from './OfertasComun.js';
import { ofertasStore } from './ofertasStore.js';
import { OfertasVigilando } from './OfertasVigilando.js';

/**
 * The deals finder (features/ofertas): search a product in several stores at once, keep watching it, read the
 * alerts and choose which stores to ask. Opens from the kiosk (or the page's #ofertas hash).
 */
export function OfertasPanel({ transport }: { transport: MessageTransport }) {
  const { status, results, open, tab, asistente } = useSyncExternalStore(
    ofertasStore.subscribe,
    ofertasStore.get,
  );
  const [now, setNow] = useState(() => Date.now());
  const unseen = status?.alerts.filter((a) => !a.seen).length ?? 0;

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), PANEL_TICK_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ofertasStore.close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Opening the alerts tab reads them: the kiosk goes dark
  useEffect(() => {
    if (open && tab === 'avisos' && unseen > 0) transport.send({ type: 'markOfertasAlertsSeen' });
  }, [open, tab, unseen, transport]);

  if (!open) return null;
  const send: Send = (msg) => transport.send(msg);
  const label: Record<OfertasTab, string> = {
    buscar: 'Buscar',
    vigilando: `Vigilando (${status?.watches.length ?? 0})`,
    avisos: unseen > 0 ? `Avisos (${unseen} sin ver)` : 'Avisos',
    ajustes: 'Ajustes',
  };

  return (
    <Modal
      isOpen
      onClose={() => ofertasStore.close()}
      title="Ofertas"
      className="w-[min(760px,94vw)]"
    >
      <div className="px-10 flex flex-wrap gap-4 pb-6" role="tablist">
        {OFERTAS_TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            role="tab"
            aria-selected={t === tab}
            variant={t === tab ? 'active' : 'default'}
            onClick={() => ofertasStore.setTab(t)}
          >
            {label[t]}
          </Button>
        ))}
      </div>
      <div className="pixel-scrollbar max-h-[min(70vh,calc(100vh-160px))] overflow-y-auto px-10 pb-8 text-sm text-text">
        {!status ? (
          <p className="text-text-muted">
            El buscador de ofertas no está disponible en esta página. Ábrela con el enlace con token
            de la oficina.
          </p>
        ) : tab === 'buscar' ? (
          // A new search (also one started from a similar product) shows its words in the field
          <OfertasBuscar
            key={results?.requestId ?? 'nueva'}
            status={status}
            results={results}
            send={send}
          />
        ) : tab === 'vigilando' ? (
          <OfertasVigilando status={status} send={send} now={now} />
        ) : tab === 'avisos' ? (
          <OfertasAvisos status={status} now={now} />
        ) : (
          <OfertasAjustes status={status} asistente={asistente} send={send} />
        )}
      </div>
    </Modal>
  );
}
