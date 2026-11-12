import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { JardinSupply } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { JardinCelular } from './JardinCelular.js';
import { sectionTitle, type Send } from './JardinComun.js';
import { JardinHoy } from './JardinHoy.js';
import { JardinInventario } from './JardinInventario.js';
import { JardinPlantas, type PlantEditing } from './JardinPlantas.js';
import { jardinStore } from './jardinStore.js';

const STATE_COLOR: Record<string, string> = {
  ok: 'text-status-success',
  warn: 'text-status-permission',
  off: 'text-status-error',
  idea: 'text-status-active',
};

/**
 * The roof garden's panel (features/jardin): today's care with "Hecho", the plants with their photos, the supplies,
 * what came from the phone, and the state of the links with Google. Opens from the roof's control pieces.
 * Each section lives in its own file (JardinHoy, JardinCelular, JardinPlantas, JardinInventario); this one holds the
 * state they share and puts them together.
 */
export function JardinPanel({ transport }: { transport: MessageTransport }) {
  const { status, open, focus, section } = useSyncExternalStore(
    jardinStore.subscribe,
    jardinStore.get,
  );
  const [editing, setEditing] = useState<PlantEditing | null>(null);
  const [supplyEdit, setSupplyEdit] = useState<{ supply?: JardinSupply } | null>(null);
  const supplies = useRef<HTMLElement | null>(null);
  const plants = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && section === 'inventario') supplies.current?.scrollIntoView({ block: 'start' });
  }, [open, section]);
  if (!open || !status) return null;
  const send: Send = (msg) => transport.send(msg as never);
  const token = officeToken();
  const loginHref = token ? `/api/google/login?token=${encodeURIComponent(token)}` : null;
  const problems = status.checks.filter((c) => c.state !== 'ok');

  return (
    <Modal
      isOpen
      onClose={() => jardinStore.close()}
      title="Jardín de la azotea"
      className="w-[min(820px,94vw)]"
    >
      <div className="max-h-[75vh] overflow-y-auto px-10 pb-6 flex flex-col gap-10 text-sm text-text">
        {status.error && <p className="text-status-error">{status.error}</p>}

        <JardinHoy
          status={status}
          send={send}
          onGoPlants={() => plants.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        />

        <section className="flex flex-col gap-2">
          <div className={sectionTitle}>Conexión</div>
          <ul className="flex flex-col gap-2">
            {status.checks.map((c) => (
              <li key={c.id} className="flex flex-col">
                <span>
                  <span className={STATE_COLOR[c.state] ?? ''}>● </span>
                  {c.label}: <span className="text-text-muted">{c.detail}</span>
                </span>
                {c.help && <span className="text-text-muted pl-12">{c.help}</span>}
              </li>
            ))}
          </ul>
          {!status.connected &&
            (loginHref ? (
              <a
                className="text-accent-bright underline self-start"
                href={loginHref}
                target="_blank"
                rel="noreferrer"
              >
                Conectar con Google
              </a>
            ) : (
              <span className="text-text-muted">
                Abre la oficina con su enlace con token para conectar Google.
              </span>
            ))}
          {problems.length === 0 && status.syncedAt && (
            <span className="text-text-muted">
              Al día con Google (
              {new Date(status.syncedAt).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              ).
            </span>
          )}
        </section>

        <JardinCelular
          status={status}
          send={send}
          onNewPlant={(item) => setEditing({ plant: item.newPlant, fromInbox: item.id })}
        />

        <div ref={plants}>
          <JardinPlantas
            status={status}
            focus={focus}
            send={send}
            editing={editing}
            setEditing={setEditing}
          />
        </div>

        <JardinInventario
          status={status}
          send={send}
          supplyEdit={supplyEdit}
          setSupplyEdit={setSupplyEdit}
          sectionRef={supplies}
        />

        {status.recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className={sectionTitle}>Lo último que hizo la oficina</div>
            <ul className="flex flex-col gap-1 text-text-muted">
              {status.recent.slice(0, 6).map((r) => (
                <li key={`${r.at}${r.text}`}>
                  {new Date(r.at).toLocaleString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {r.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <span className="flex gap-12 text-xs text-text-muted">
          {status.saving && <span>Guardando…</span>}
          <button className="underline" onClick={() => send({ type: 'refreshJardin' })}>
            Sincronizar ahora
          </button>
        </span>
      </div>
    </Modal>
  );
}
