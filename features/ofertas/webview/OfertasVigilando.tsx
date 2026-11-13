import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';

import type { OfertasPoint, OfertasStatus, OfertasWatch } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import {
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_LINE_COLOR,
  CHART_LOW_COLOR,
  CHART_LOW_MARK,
  CHART_PAD,
  CHART_WIDTH,
  CONFIRM_RESET_MS,
  OTHER_OFFERS_MAX,
  WORDS_MAX,
} from './constants.js';
import { AsistenteBox } from './OfertasAsistente.js';
import { ReferenceFields } from './OfertasBuscar.js';
import {
  cardClass,
  inputClass,
  KeepaLink,
  MsiTag,
  SellerTag,
  type Send,
  StoreLink,
  Tag,
  VerdictLine,
} from './OfertasComun.js';
import {
  chartShape,
  checkedText,
  money,
  profecoLink,
  rangeText,
  referenceText,
  sellerTag,
  watchEditMessage,
  watchFormFields,
} from './ofertasText.js';

/** The price history as a stepped pixel line, the lowest point marked with a square. */
function MiniChart({ history }: { history: OfertasPoint[] }) {
  const shape = chartShape(history, CHART_WIDTH, CHART_HEIGHT, CHART_PAD);
  if (!shape) return <span className="text-xs text-text-muted">Aún sin historial</span>;
  const half = CHART_LOW_MARK / 2;
  return (
    <svg
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Historial del precio"
    >
      <rect
        x={0.5}
        y={0.5}
        width={CHART_WIDTH - 1}
        height={CHART_HEIGHT - 1}
        fill="none"
        stroke={CHART_GRID_COLOR}
      />
      <polyline points={shape.points} fill="none" stroke={CHART_LINE_COLOR} strokeWidth={2} />
      <rect
        x={shape.low.x - half}
        y={shape.low.y - half}
        width={CHART_LOW_MARK}
        height={CHART_LOW_MARK}
        fill={CHART_LOW_COLOR}
      />
    </svg>
  );
}

/** "Quitar", then "¿Seguro?" on the same button for a moment. */
function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), CONFIRM_RESET_MS);
    return () => clearTimeout(t);
  }, [sure]);
  return (
    <Button
      size="sm"
      className={sure ? 'border-status-error! text-status-error' : ''}
      onClick={() => (sure ? onRemove() : setSure(true))}
    >
      {sure ? '¿Seguro?' : 'Quitar'}
    </Button>
  );
}

/** Change a saved search in place: its target price (empty removes it) and the words it must or must not say. */
function EditWatch({
  watch,
  send,
  onDone,
}: {
  watch: OfertasWatch;
  send: Send;
  onDone: () => void;
}) {
  const [fields, setFields] = useState(() => watchFormFields(watch));
  const set = (k: keyof typeof fields) => (e: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));
  const save = () => {
    send(watchEditMessage(watch, fields));
    onDone();
  };
  return (
    <div className="flex flex-col gap-4 border-t-2 border-border pt-4">
      <label className="flex flex-wrap items-center gap-4">
        <span className="text-text-muted">Avísame cuando baje de $</span>
        <input
          className={`${inputClass} w-[110px]`}
          inputMode="decimal"
          placeholder="sin objetivo"
          value={fields.target}
          onChange={set('target')}
          aria-label="Precio objetivo"
        />
      </label>
      <ReferenceFields
        price={fields.refPrice}
        date={fields.refDate}
        onPrice={(v) => setFields((f) => ({ ...f, refPrice: v }))}
        onDate={(v) => setFields((f) => ({ ...f, refDate: v }))}
      />
      <label className="flex flex-col gap-1">
        <span className="text-text-muted">Debe decir (palabras separadas por coma)</span>
        <input
          className={inputClass}
          maxLength={WORDS_MAX}
          value={fields.mustHave}
          onChange={set('mustHave')}
          placeholder="ej. bluetooth, negro"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-text-muted">No debe decir</span>
        <input
          className={inputClass}
          maxLength={WORDS_MAX}
          value={fields.exclude}
          onChange={set('exclude')}
          placeholder="ej. funda, reacondicionado"
        />
      </label>
      <span className="flex gap-4">
        <Button size="sm" variant="accent" onClick={save}>
          Guardar
        </Button>
        <Button size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

function WatchCard({ watch, send, now }: { watch: OfertasWatch; send: Send; now: number }) {
  const best = watch.best;
  const pick = watch.pick;
  // "La mejor" is shown apart only when it is not the cheapest (a reseller was cheaper)
  const pickApart =
    pick && best && (pick.offer.url !== best.url || pick.offer.price !== best.price);
  const range = rangeText(watch.history, now);
  const profeco = profecoLink(now);
  const [editing, setEditing] = useState(false);
  return (
    <li className={cardClass}>
      <span className="flex flex-wrap items-baseline justify-between gap-8">
        <span className="text-base text-accent-bright">{watch.query}</span>
        {watch.reached && <Tag tone="ok">¡Llegó a tu precio!</Tag>}
      </span>
      {best ? (
        <span className="flex flex-wrap items-baseline gap-8">
          <span className="text-2xl">{money(best.price)}</span>
          <StoreLink href={best.url}>{best.store}</StoreLink>
          {pick && !pickApart && (watch.others?.length ?? 0) > 0 && (
            <Tag tone="accent" title={pick.reason}>
              La mejor
            </Tag>
          )}
          <SellerTag offer={best} />
        </span>
      ) : (
        <span className="text-text-muted">Todavía sin precio.</span>
      )}
      {pick && pickApart && (
        <span className="flex flex-wrap items-baseline gap-8">
          <Tag tone="accent" title={pick.reason}>
            La mejor
          </Tag>
          <span className="text-lg">{money(pick.offer.price)}</span>
          <StoreLink href={pick.offer.url}>{pick.offer.store}</StoreLink>
          <SellerTag offer={pick.offer} />
        </span>
      )}
      {pick && <span className="text-xs text-text-muted">{pick.reason}</span>}
      <VerdictLine verdict={watch.verdict} />
      {watch.note && <span>{watch.note}</span>}
      {(pick ?? best) && (
        <span className="flex flex-wrap items-baseline gap-8">
          <MsiTag
            installments={(pick?.offer ?? best)!.installments}
            url={(pick?.offer ?? best)!.url}
          />
          <KeepaLink offer={(pick?.offer ?? best)!} />
          <span className="text-xs">
            <StoreLink href={profeco.url}>{profeco.name}</StoreLink>
          </span>
        </span>
      )}
      <span className="flex flex-wrap items-center gap-8">
        <MiniChart history={watch.history} />
        <span className="flex flex-col text-xs text-text-muted">
          {range ? (
            <span>{range}</span>
          ) : (
            watch.lowest !== undefined && <span>El más bajo visto: {money(watch.lowest)}</span>
          )}
          {watch.reference && <span>{referenceText(watch.reference, now)} (dato tuyo)</span>}
          {watch.target !== undefined && (
            <span className={watch.reached ? 'text-status-success' : ''}>
              Objetivo: {money(watch.target)}
              {watch.reached ? ' · ya llegó' : ''}
            </span>
          )}
          {(watch.mustHave.length > 0 || watch.exclude.length > 0) && (
            <span>
              {watch.mustHave.length > 0 ? `Debe decir: ${watch.mustHave.join(', ')}` : ''}
              {watch.mustHave.length > 0 && watch.exclude.length > 0 ? ' · ' : ''}
              {watch.exclude.length > 0 ? `Sin: ${watch.exclude.join(', ')}` : ''}
            </span>
          )}
        </span>
      </span>
      {watch.others && watch.others.length > 0 && (
        <ul className="flex flex-col gap-1 border-t-2 border-border pt-4">
          {watch.others.slice(0, OTHER_OFFERS_MAX).map((o) => {
            const seller = sellerTag(o);
            return (
              <li key={`${o.sourceId}:${o.url}`} className="flex justify-between gap-8">
                <span>
                  <StoreLink href={o.url}>{o.store}</StoreLink>
                  <span className="text-text-muted" title={seller.title}>
                    {' '}
                    · {seller.text.toLowerCase()}
                  </span>
                </span>
                <span>{money(o.price)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {watch.error && <span className="text-status-error">{watch.error}</span>}
      <AsistenteBox
        target={{ watchId: watch.id }}
        product={watch.query}
        price={(pick?.offer ?? best)?.price}
        store={(pick?.offer ?? best)?.store}
        saved={watch.asistente}
        send={send}
      />
      {editing && <EditWatch watch={watch} send={send} onDone={() => setEditing(false)} />}
      <span className="flex flex-wrap items-center justify-between gap-8">
        <span className="text-xs text-text-muted">{checkedText(watch, now)}</span>
        <span className="flex gap-4">
          <Button size="sm" onClick={() => send({ type: 'checkOfertas', id: watch.id })}>
            Revisar ahora
          </Button>
          {!editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          <RemoveButton onRemove={() => send({ type: 'deleteOfertasWatch', id: watch.id })} />
        </span>
      </span>
    </li>
  );
}

/** The watched searches, one card each. */
export function OfertasVigilando({
  status,
  send,
  now,
}: {
  status: OfertasStatus;
  send: Send;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <span className="flex items-center justify-between gap-8">
        <span className="text-text-muted">
          {status.checking ? 'Revisando…' : `Cada ${status.settings.everyMinutes} min`}
        </span>
        {status.watches.length > 0 && (
          <Button
            size="sm"
            variant={status.checking ? 'disabled' : 'default'}
            disabled={status.checking}
            onClick={() => send({ type: 'checkOfertas' })}
          >
            Revisar todas
          </Button>
        )}
      </span>
      {status.watches.length === 0 ? (
        <p className="text-text-muted">Aún no vigilas nada. Busca un producto y toca Vigilar.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {status.watches.map((w) => (
            <WatchCard key={w.id} watch={w} send={send} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
