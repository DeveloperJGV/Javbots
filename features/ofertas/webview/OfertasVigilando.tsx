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
  FOLDED_GROUPS_KEY,
  NO_GROUP_LABEL,
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
import { DondeBusco, SinPrecio } from './OfertasDondeBusco.js';
import { GrupoElegir } from './OfertasGrupoElegir.js';
import {
  groupNames,
  moveGroup,
  suggestForWatch,
  type WatchGroup,
  watchGroups,
} from './ofertasGrupos.js';
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

/** No group yet: the suggested one, accepted with one click (never put in silence). */
function GroupSuggestion({
  watch,
  suggestion,
  send,
  onOther,
}: {
  watch: OfertasWatch;
  suggestion: string;
  send: Send;
  onOther: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-4 text-xs">
      <span className="text-text-muted">¿Va en el grupo «{suggestion}»?</span>
      <Button
        size="sm"
        onClick={() => send({ type: 'setOfertasWatchGroup', id: watch.id, group: suggestion })}
      >
        Sí, ponla ahí
      </Button>
      <Button size="sm" onClick={onOther}>
        Otro grupo
      </Button>
    </span>
  );
}

function WatchCard({
  watch,
  send,
  now,
  groups,
}: {
  watch: OfertasWatch;
  send: Send;
  now: number;
  groups: string[];
}) {
  const best = watch.best;
  const pick = watch.pick;
  // "La mejor" is shown apart only when it is not the cheapest (a reseller was cheaper)
  const pickApart =
    pick && best && (pick.offer.url !== best.url || pick.offer.price !== best.price);
  const range = rangeText(watch.history, now);
  const profeco = profecoLink(now);
  const [editing, setEditing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const suggestion = suggestForWatch(watch);
  return (
    <li className={cardClass}>
      <span className="flex flex-wrap items-baseline justify-between gap-8">
        <span className="text-base text-accent-bright">{watch.query}</span>
        {watch.reached && <Tag tone="ok">¡Llegó a tu precio!</Tag>}
      </span>
      {!watch.group && suggestion && !choosing && (
        <GroupSuggestion
          watch={watch}
          suggestion={suggestion}
          send={send}
          onOther={() => setChoosing(true)}
        />
      )}
      {choosing && (
        <GrupoElegir
          current={watch.group}
          groups={groups}
          suggestion={suggestion}
          onPick={(group) => {
            send({ type: 'setOfertasWatchGroup', id: watch.id, group });
            setChoosing(false);
          }}
          onCancel={() => setChoosing(false)}
        />
      )}
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
        <SinPrecio watch={watch} send={send} />
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
      <DondeBusco watch={watch} now={now} />
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
      {watch.error && best && <span className="text-status-error">{watch.error}</span>}
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
          {!choosing && (
            <Button size="sm" onClick={() => setChoosing(true)}>
              {watch.group ? 'Cambiar grupo' : 'Grupo'}
            </Button>
          )}
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

/** Folded groups, remembered in this browser only (it may be lost: then everything shows unfolded). */
function readFolded(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLDED_GROUPS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeFolded(folded: string[]): void {
  try {
    localStorage.setItem(FOLDED_GROUPS_KEY, JSON.stringify(folded));
  } catch {
    // Without storage it just does not remember
  }
}

/** One group: its header (name, how many, the best of it, fold, move) and its cards. */
function GroupSection({
  group,
  index,
  names,
  saved,
  folded,
  onFold,
  send,
  now,
}: {
  group: WatchGroup;
  index: number;
  names: string[];
  /** The saved order, with groups that have no watches today. */
  saved: readonly string[];
  folded: boolean;
  onFold: () => void;
  send: Send;
  now: number;
}) {
  const title = group.name ?? NO_GROUP_LABEL;
  const n = group.watches.length;
  const move = (step: -1 | 1) =>
    send({ type: 'setOfertasSettings', groupOrder: moveGroup(names, group.name!, step, saved) });
  return (
    <section className="flex flex-col gap-6" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-8 border-b-2 border-border pb-2">
        <button
          className="flex items-baseline gap-4 text-left cursor-pointer"
          aria-expanded={!folded}
          onClick={onFold}
        >
          <span className="text-accent-bright w-12">{folded ? '▸' : '▾'}</span>
          <span className="text-lg text-text">{title}</span>
          <span className="text-text-muted">
            ({n} {n === 1 ? 'vigilancia' : 'vigilancias'})
          </span>
        </button>
        <span className="flex flex-wrap items-center gap-4">
          {group.best ? (
            <span className="text-xs" title="La más barata del grupo con veredicto «Buen precio»">
              <Tag tone="ok">Lo mejor</Tag> {group.best.watch.query} ·{' '}
              {money(group.best.offer.price)} en {group.best.offer.store}
            </span>
          ) : (
            <span className="text-xs text-text-muted">Ninguna con buen precio por ahora</span>
          )}
          {group.name && (
            <>
              <Button
                size="sm"
                variant={index === 0 ? 'disabled' : 'default'}
                disabled={index === 0}
                aria-label={`Subir el grupo ${title}`}
                title="Subir el grupo"
                onClick={() => move(-1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant={index >= names.length - 1 ? 'disabled' : 'default'}
                disabled={index >= names.length - 1}
                aria-label={`Bajar el grupo ${title}`}
                title="Bajar el grupo"
                onClick={() => move(1)}
              >
                ↓
              </Button>
            </>
          )}
        </span>
      </div>
      {!folded && (
        <ul className="flex flex-col gap-6">
          {group.watches.map((w) => (
            <WatchCard key={w.id} watch={w} send={send} now={now} groups={names} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The watched searches by group ("Bocinas", "Receptor"…), "Sin grupo" last. */
export function OfertasVigilando({
  status,
  send,
  now,
}: {
  status: OfertasStatus;
  send: Send;
  now: number;
}) {
  const [folded, setFolded] = useState<string[]>(readFolded);
  const order = status.settings.groupOrder ?? [];
  const groups = watchGroups(status.watches, order);
  const names = groupNames(status.watches, order);
  const keyOf = (g: WatchGroup) => g.name ?? '';
  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeFolded(next);
      return next;
    });
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
        <div className="flex flex-col gap-10">
          {groups.map((g, i) => (
            <GroupSection
              key={keyOf(g) || '·sin-grupo'}
              group={g}
              index={i}
              names={names}
              saved={order}
              folded={folded.includes(keyOf(g))}
              onFold={() => toggle(keyOf(g))}
              send={send}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}
