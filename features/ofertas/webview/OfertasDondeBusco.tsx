import { useState } from 'react';

import type { OfertasWatch } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { type Send, StoreLink, Tag } from './OfertasComun.js';
import { ofertasStore } from './ofertasStore.js';
import {
  fewerWords,
  money,
  noPriceSentence,
  searchedCount,
  storeMark,
  storeSentence,
  storeWhen,
} from './ofertasText.js';

/** Starts a search in the Buscar tab (a shorter one suggested when nothing matched). */
function searchNow(query: string, send: Send): void {
  const requestId = ofertasStore.startSearch(query);
  send({ type: 'searchOfertas', requestId, query });
  ofertasStore.setTab('buscar');
}

/**
 * "Dónde buscó": one mark per store asked (✓ has it, – not with that name, ✗ did not answer, ○ off, ! no key),
 * the reason on hover, and the whole detail unfolded with each store's own search to open by hand.
 */
export function DondeBusco({ watch, now }: { watch: OfertasWatch; now: number }) {
  const [open, setOpen] = useState(false);
  const stores = watch.stores;
  if (!stores) {
    return (
      <span className="text-xs text-text-muted">
        Dónde buscó: lo dice desde la próxima revisión.
      </span>
    );
  }
  const asked = stores.filter((c) => c.result !== 'link');
  const linked = stores.length - asked.length;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-4">
        <span className="text-xs text-text-muted">Dónde buscó:</span>
        <ul className="flex flex-wrap gap-4" aria-label="Dónde buscó">
          {asked.map((c) => {
            const m = storeMark(c.result);
            const when = storeWhen(c, now);
            const said = `${c.name}: ${storeSentence(c, watch.query)}${when ? ` · ${when}` : ''}`;
            return (
              // The sign alone (✓ – ✗) says nothing to a screen reader: the label says it in words
              <li key={c.id} title={said} aria-label={`${c.name}, ${m.label}. ${said}`}>
                <Tag tone={m.tone}>
                  {m.mark} {c.name}
                  {c.result === 'found' && c.price !== undefined ? ` ${money(c.price)}` : ''}
                </Tag>
              </li>
            );
          })}
          {linked > 0 && (
            <li
              title="Tiendas que la oficina no lee: su búsqueda va lista para abrirla tú"
              aria-label={`${linked} ${linked === 1 ? 'tienda' : 'tiendas'} para abrir tú: la oficina no las lee, su búsqueda va lista`}
            >
              <Tag>↗ {linked} para abrir tú</Tag>
            </li>
          )}
        </ul>
        <button
          className="text-xs text-text-muted underline"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </span>
      {open && (
        <div className="flex flex-col gap-4 border-l-2 border-border pl-6">
          <span className="text-xs text-text-muted">{searchedCount(stores)}</span>
          <ul className="flex flex-col gap-4">
            {stores.map((c) => {
              const m = storeMark(c.result);
              const when = storeWhen(c, now);
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-4">
                    <Tag tone={m.tone}>
                      {m.mark} {m.label}
                    </Tag>
                    <span>{c.name}</span>
                    {when && <span className="text-xs text-text-muted">· {when}</span>}
                    {c.url && (
                      <span className="text-xs">
                        <StoreLink href={c.url}>Ábrela tú</StoreLink>
                      </span>
                    )}
                  </span>
                  {c.result !== 'link' && (
                    <span className="text-xs">{storeSentence(c, watch.query)}</span>
                  )}
                  {c.result === 'link' && c.detail && (
                    <span className="text-xs text-text-muted">{c.detail}</span>
                  )}
                  {c.closest && (
                    <span className="text-xs text-text-muted">
                      El primero que dio: «{c.closest}»
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A watch without a price is not a dead end: which store answered what, and a shorter search to try.
 */
export function SinPrecio({ watch, send }: { watch: OfertasWatch; send: Send }) {
  const why = noPriceSentence(watch.stores, watch.query);
  const shorter = fewerWords(watch.query);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-status-permission">{why ?? watch.error ?? 'Todavía sin precio.'}</span>
      {shorter && (
        <span className="flex flex-wrap items-center gap-4">
          <span className="text-xs text-text-muted">Prueba con menos palabras:</span>
          <Button size="sm" onClick={() => searchNow(shorter, send)}>
            Buscar «{shorter}»
          </Button>
        </span>
      )}
    </div>
  );
}
