import { useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { concertsStore } from './concertsStore.js';
import { CONCERT_SOON_DAYS, dateText, daysLeftText, daysUntil } from './concertsText.js';

const linkClass = 'text-accent-bright underline';

/**
 * "Mis próximos conciertos" (features/conciertos): opens from the concert tickets on the counter. The concerts of the
 * owner's Google calendar (events titled "Concierto: …"), and a search of Ticketmaster México for the artists the owner listens to most.
 */
export function ConcertsPanel({ transport }: { transport: MessageTransport }) {
  const { status, open } = useSyncExternalStore(concertsStore.subscribe, concertsStore.get);
  if (!open || !status) return null;
  const token = officeToken();
  const loginHref = token ? `/api/google/login?token=${encodeURIComponent(token)}` : null;
  const now = new Date();

  return (
    <Modal
      isOpen
      onClose={() => concertsStore.close()}
      title="Mis próximos conciertos"
      className="w-[min(720px,94vw)]"
    >
      <div className="max-h-[70vh] overflow-y-auto px-10 pb-6 flex flex-col gap-8 text-sm text-text">
        {!status.googleConfigured && (
          <p className="text-text-muted">
            Falta configurar Google: pon <code>clientId</code> y <code>clientSecret</code> en{' '}
            <code>~/.pixel-agents/google.json</code>.
          </p>
        )}
        {status.googleConfigured && !status.googleConnected && (
          <p>
            Conecta tu Google Calendar para ver tus conciertos.{' '}
            {loginHref ? (
              <a className={linkClass} href={loginHref} target="_blank" rel="noreferrer">
                Conectar con Google
              </a>
            ) : (
              <span className="text-text-muted">Abre la oficina con su enlace con token.</span>
            )}
          </p>
        )}
        {status.reconnectInDays !== undefined && loginHref && (
          <p className="text-status-permission">
            La conexión con Google se vence{' '}
            {status.reconnectInDays === 0 ? 'hoy' : `en ${status.reconnectInDays} día`}.{' '}
            <a className={linkClass} href={loginHref} target="_blank" rel="noreferrer">
              Reconectar
            </a>
          </p>
        )}
        {status.error && <p className="text-status-error">{status.error}</p>}

        {status.googleConnected && (
          <section className="flex flex-col gap-4">
            <div className="text-lg text-accent-bright">En tu calendario</div>
            {status.concerts.length === 0 ? (
              <p className="text-text-muted">
                No hay conciertos próximos. Agrega eventos a tu calendario con el título empezando
                con <code>Concierto:</code>.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {status.concerts.map((c) => {
                  const days = daysUntil(c.start, now);
                  return (
                    <li key={c.id} className="flex flex-col">
                      <span className="text-base">
                        {c.link ? (
                          <a
                            className="hover:underline"
                            href={c.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c.title}
                          </a>
                        ) : (
                          c.title
                        )}{' '}
                        <span
                          className={
                            days <= CONCERT_SOON_DAYS ? 'text-status-success' : 'text-text-muted'
                          }
                        >
                          · {daysLeftText(days)}
                        </span>
                      </span>
                      <span className="text-text-muted">
                        {dateText(c.start, c.allDay)}
                        {c.location ? ` · ${c.location}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {status.ticketmasterConfigured && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-8">
              <div className="text-lg text-accent-bright">En México, de lo que escuchas</div>
              <Button
                size="sm"
                variant={status.searching ? 'disabled' : 'default'}
                disabled={status.searching}
                onClick={() => transport.send({ type: 'searchConcerts' })}
              >
                {status.searching ? 'Buscando…' : 'Buscar conciertos'}
              </Button>
            </div>
            <p className="text-text-muted">
              Busca en Ticketmaster México los conciertos de tus artistas más escuchados en Spotify
              y de los que ya tienes en el calendario.
            </p>
            {status.found.length > 0 && (
              <ul className="flex flex-col gap-4">
                {status.found.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-8">
                    <span className="flex flex-col">
                      <span className="text-base">
                        {c.url ? (
                          <a
                            className="hover:underline"
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c.name}
                          </a>
                        ) : (
                          c.name
                        )}
                      </span>
                      <span className="text-text-muted">
                        {c.artist} · {dateText(c.start, c.allDay)}
                        {c.venue ? ` · ${c.venue}` : ''}
                        {c.city ? `, ${c.city}` : ''}
                      </span>
                    </span>
                    {status.googleConnected && (
                      <Button
                        size="sm"
                        onClick={() => transport.send({ type: 'addConcert', id: c.id })}
                      >
                        Agregar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {status.googleConnected && (
          <button
            className="self-start text-xs text-text-muted underline"
            onClick={() => transport.send({ type: 'disconnectGoogle' })}
          >
            Desconectar Google
          </button>
        )}
      </div>
    </Modal>
  );
}
