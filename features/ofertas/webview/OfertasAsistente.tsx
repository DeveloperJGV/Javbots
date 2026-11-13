import { useEffect, useState, useSyncExternalStore } from 'react';

import type {
  OfertasAsistenteBusquedaSimilares,
  OfertasAsistenteInvestigacion,
  OfertasWatchAsistente,
} from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { ASISTENTE_BUSY_TITLE, ASISTENTE_TICK_MS } from './constants.js';
import { type Send, StoreLink, Tag } from './OfertasComun.js';
import { asistenteKey, ofertasStore } from './ofertasStore.js';
import {
  ASISTENTE_ERROR_TEXT,
  asistenteFooter,
  confianzaTag,
  elapsedText,
  fuenteText,
  money,
  precioFacts,
  similarTag,
} from './ofertasText.js';

/** Where the answer goes: a watched search, or one product of a live search. */
export interface AsistenteTarget {
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}

/** The later of two answers (the one on the watch, the one this page just got). */
function newer<T extends { revisado: string }>(a?: T, b?: T): T | undefined {
  if (!a || !b) return a ?? b;
  return Date.parse(b.revisado) > Date.parse(a.revisado) ? b : a;
}

/** "Buscando a mano… 0:42" with its own one-second clock. */
function Elapsed({ since }: { since?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ASISTENTE_TICK_MS);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{elapsedText(since, now)}</span>;
}

function PrecioResult({ precio }: { precio: OfertasAsistenteInvestigacion }) {
  const facts = precioFacts(precio);
  const conf = confianzaTag(precio.confianza);
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-6">
      {facts.length > 0 && (
        <span className="flex flex-wrap items-baseline gap-12">
          {facts.map((f) => (
            <span key={f.label} className="flex flex-col">
              <span className="text-xs text-text-muted">{f.label}</span>
              <span className="text-lg">{f.value}</span>
            </span>
          ))}
        </span>
      )}
      <span className="flex flex-wrap items-baseline gap-8">
        <Tag tone={conf.tone}>{conf.text}</Tag>
        <span className="text-xs">{precio.nota}</span>
      </span>
      {precio.fuentes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {precio.fuentes.map((f) => (
            <li key={f.url}>
              <StoreLink href={f.url}>{fuenteText(f)}</StoreLink>
            </li>
          ))}
        </ul>
      )}
      <span className="text-xs text-text-muted">{asistenteFooter(precio.revisado)}</span>
    </div>
  );
}

function SimilaresResult({
  similares,
  send,
}: {
  similares: OfertasAsistenteBusquedaSimilares;
  send: Send;
}) {
  const searchStores = (q: string) => {
    const requestId = ofertasStore.startSearch(q);
    send({ type: 'searchOfertas', requestId, query: q });
    ofertasStore.setTab('buscar');
  };
  const watch = (q: string) => {
    send({ type: 'saveOfertasWatch', query: q, mustHave: [], exclude: [] });
    ofertasStore.setTab('vigilando');
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
        {similares.similares.map((s) => (
          <li key={s.nombre} className="flex flex-col gap-4 border-2 border-border p-6">
            <span className="flex flex-wrap items-baseline justify-between gap-4">
              <Tag tone={s.tipo === 'compa' ? 'accent' : 'muted'}>{similarTag(s.tipo)}</Tag>
              {s.precioAprox !== undefined && (
                <span className="text-sm">aprox. {money(s.precioAprox)}</span>
              )}
            </span>
            <span className="text-base text-accent-bright">{s.nombre}</span>
            {s.porque && <span className="text-xs">{s.porque}</span>}
            {s.fuentes.length > 0 && (
              <ul className="flex flex-col text-xs">
                {s.fuentes.map((f) => (
                  <li key={f.url}>
                    <StoreLink href={f.url}>{fuenteText(f)}</StoreLink>
                  </li>
                ))}
              </ul>
            )}
            <span className="mt-auto flex flex-wrap gap-4">
              <Button size="sm" variant="accent" onClick={() => searchStores(s.consulta)}>
                Buscar en tiendas
              </Button>
              <Button size="sm" onClick={() => watch(s.consulta)}>
                Vigilar
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs text-text-muted">
        {asistenteFooter(similares.revisado, 'Los buscó')}
      </span>
    </div>
  );
}

/**
 * The assistant's part of one product: its two buttons (only when it can be used), "Buscando a mano…" while it works,
 * and what it found. Nothing at all when the assistant is not available and there is nothing saved to show.
 */
export function AsistenteBox({
  target,
  product,
  price,
  store,
  saved,
  send,
}: {
  target: AsistenteTarget;
  product: string;
  price?: number;
  store?: string;
  /** What a watched search already keeps (seeing it again costs nothing). */
  saved?: OfertasWatchAsistente;
  send: Send;
}) {
  const { asistente, asistenteResults } = useSyncExternalStore(
    ofertasStore.subscribe,
    ofertasStore.get,
  );
  const key = asistenteKey(target);
  const entry = key ? asistenteResults[key] : undefined;
  const precio = newer(saved?.precio, entry?.precio);
  const similares = newer(saved?.similares, entry?.similares);
  const available = asistente?.available === true;
  const running = available && asistente.busy && asistenteKey(asistente) === key;
  const busyElsewhere = available && asistente.busy && !running;
  if (!key || (!available && !precio && !similares)) return null;

  const ask = (type: 'ofertasAsistenteInvestigar' | 'ofertasAsistenteSimilares') =>
    send(
      type === 'ofertasAsistenteInvestigar'
        ? {
            type,
            producto: product,
            ...(price !== undefined ? { precioActual: price } : {}),
            ...(store ? { tienda: store } : {}),
            ...target,
          }
        : {
            type,
            producto: product,
            ...(price !== undefined ? { presupuesto: price } : {}),
            ...target,
          },
    );
  const error = entry?.error;

  return (
    <section className="flex flex-col gap-4 border-t-2 border-border pt-4">
      {available && !running && (
        <span className="flex flex-wrap gap-4">
          {(['ofertasAsistenteInvestigar', 'ofertasAsistenteSimilares'] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={busyElsewhere ? 'disabled' : 'default'}
              disabled={busyElsewhere}
              title={busyElsewhere ? ASISTENTE_BUSY_TITLE : undefined}
              onClick={() => ask(type)}
            >
              {type === 'ofertasAsistenteInvestigar'
                ? 'Investigar precio (asistente)'
                : 'Buscar similares (asistente)'}
            </Button>
          ))}
        </span>
      )}
      {running && (
        <span className="flex flex-wrap items-center gap-8 text-status-permission">
          <span>
            {asistente.job === 'similares' ? 'Buscando similares a mano…' : 'Buscando a mano…'}{' '}
            <Elapsed since={asistente.startedAt} />
          </span>
          <Button size="sm" onClick={() => send({ type: 'ofertasAsistenteCancelar' })}>
            Cancelar
          </Button>
          <span className="text-xs text-text-muted">Tarda cerca de un minuto.</span>
        </span>
      )}
      {error && !running && (
        <span
          className={error.reason === 'cancelled' ? 'text-text-muted' : 'text-status-error'}
          title={error.detail}
        >
          {ASISTENTE_ERROR_TEXT[error.reason]}
        </span>
      )}
      {precio && <PrecioResult precio={precio} />}
      {similares && <SimilaresResult similares={similares} send={send} />}
    </section>
  );
}
