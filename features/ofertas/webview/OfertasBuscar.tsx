import { useState } from 'react';

import type {
  OfertasGroup,
  OfertasOffer,
  OfertasResults,
  OfertasSource,
  OfertasStatus,
} from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { DEALS_MAX, MSI_TITLE, OTHER_OFFERS_MAX, QUERY_MAX, WORDS_MAX } from './constants.js';
import { AsistenteBox } from './OfertasAsistente.js';
import {
  cardClass,
  inputClass,
  KeepaLink,
  MsiTag,
  sectionTitle,
  SellerTag,
  type Send,
  StoreLink,
  Tag,
  VerdictLine,
} from './OfertasComun.js';
import { ofertasStore } from './ofertasStore.js';
import {
  allSourcesFailed,
  byPrice,
  dateField,
  keepaUrl,
  money,
  msiText,
  parsePrice,
  profecoLink,
  realDiscount,
  referenceFromFields,
  searchingText,
  sellerTag,
  sourceChip,
  sourcesSentence,
  splitWords,
} from './ofertasText.js';

/** One chip per source: how it did in this search. */
function SourceChips({ sources }: { sources: OfertasSource[] }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {sources.map((s) => {
        const chip = sourceChip(s);
        return (
          <li key={s.id} title={s.detail}>
            <Tag tone={chip.tone}>
              {s.name} {chip.text}
              {s.fragile ? ' ·' : ''}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/** "Lo he visto en $… el …": a price the person saw elsewhere, one more fact for the verdict. */
export function ReferenceFields({
  price,
  date,
  onPrice,
  onDate,
}: {
  price: string;
  date: string;
  onPrice: (v: string) => void;
  onDate: (v: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-4">
      <span className="text-text-muted">Lo he visto en $</span>
      <input
        className={`${inputClass} w-[110px]`}
        inputMode="decimal"
        placeholder="opcional"
        value={price}
        onChange={(e) => onPrice(e.target.value)}
        aria-label="Precio que viste en otro lado"
      />
      <span className="text-text-muted">el</span>
      <input
        className={`${inputClass} [color-scheme:dark]`}
        type="date"
        value={date}
        onChange={(e) => onDate(e.target.value)}
        aria-label="Día en que lo viste"
      />
    </label>
  );
}

/** The box to keep watching what was searched. */
function WatchBox({ query, send }: { query: string; send: Send }) {
  const [target, setTarget] = useState('');
  const [mustHave, setMustHave] = useState('');
  const [exclude, setExclude] = useState('');
  const [refPrice, setRefPrice] = useState('');
  const [refDate, setRefDate] = useState(() => dateField(Date.now()));
  const [more, setMore] = useState(false);
  const save = () => {
    const reference = referenceFromFields({ refPrice, refDate });
    send({
      type: 'saveOfertasWatch',
      query,
      target: parsePrice(target),
      mustHave: splitWords(mustHave),
      exclude: splitWords(exclude),
      ...(reference ? { reference } : {}),
    });
    ofertasStore.setTab('vigilando');
  };
  return (
    <div className={cardClass}>
      <span className="text-base">
        Vigilar esta búsqueda: <span className="text-accent-bright">{query}</span>
      </span>
      <label className="flex flex-wrap items-center gap-4">
        <span className="text-text-muted">Avísame cuando baje de $</span>
        <input
          className={`${inputClass} w-[110px]`}
          inputMode="decimal"
          placeholder="opcional"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Precio objetivo"
        />
      </label>
      <button
        className="self-start text-xs text-text-muted underline"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
      >
        {more ? 'Menos opciones' : 'Más opciones'}
      </button>
      {more && (
        <div className="flex flex-col gap-4">
          <ReferenceFields
            price={refPrice}
            date={refDate}
            onPrice={setRefPrice}
            onDate={setRefDate}
          />
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">Debe decir (palabras separadas por coma)</span>
            <input
              className={inputClass}
              maxLength={WORDS_MAX}
              value={mustHave}
              onChange={(e) => setMustHave(e.target.value)}
              placeholder="ej. bluetooth, negro"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">No debe decir</span>
            <input
              className={inputClass}
              maxLength={WORDS_MAX}
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              placeholder="ej. funda, reacondicionado"
            />
          </label>
        </div>
      )}
      <Button size="md" variant="accent" className="self-start shadow-pixel" onClick={save}>
        Vigilar
      </Button>
    </div>
  );
}

/** One product: "la mejor" big (the cheapest the store itself sells), its verdict, the other stores below. */
function Group({ group, requestId, send }: { group: OfertasGroup; requestId: string; send: Send }) {
  const sorted = byPrice(group.offers);
  const pick = group.pick?.offer;
  const isPick = (o: OfertasOffer) =>
    pick !== undefined && o.url === pick.url && o.price === pick.price;
  const best = sorted.find(isPick) ?? sorted[0];
  if (!best) return null;
  const rest = sorted.filter((o) => o !== best);
  // "La mejor" means something only when there is more than one option
  const choice = rest.length > 0 ? group.pick : undefined;
  const off = realDiscount(best.price, best.listPrice);
  return (
    <li className={cardClass}>
      <StoreLink href={best.url}>{group.title}</StoreLink>
      <span className="flex flex-wrap items-baseline gap-8">
        <span className="text-2xl text-text">{money(best.price)}</span>
        <span className="text-text-muted">{best.store}</span>
        {choice && (
          <Tag tone="accent" title={choice.reason}>
            La mejor
          </Tag>
        )}
        <SellerTag offer={best} />
        {best.freeShipping && <Tag>Envío gratis</Tag>}
      </span>
      {choice && <span className="text-xs text-text-muted">{choice.reason}</span>}
      <VerdictLine verdict={group.verdict} />
      {best.listPrice !== undefined && best.listPrice > best.price && (
        <span className="text-xs text-text-muted">
          Antes <s>{money(best.listPrice)}</s> según la tienda
          {off !== undefined ? ` · dice ${off} % menos` : ''}
        </span>
      )}
      {(best.installments || keepaUrl(best)) && (
        <span className="flex flex-wrap items-baseline gap-8">
          <MsiTag installments={best.installments} url={best.url} />
          <KeepaLink offer={best} />
        </span>
      )}
      {rest.length > 0 && (
        <ul className="flex flex-col gap-1 border-t-2 border-border pt-4">
          {rest.slice(0, OTHER_OFFERS_MAX).map((o) => {
            const seller = sellerTag(o);
            return (
              <li key={`${o.sourceId}:${o.url}`} className="flex justify-between gap-8">
                <span>
                  <StoreLink href={o.url}>{o.store}</StoreLink>
                  <span className="text-text-muted" title={seller.title}>
                    {' '}
                    · {seller.text.toLowerCase()}
                  </span>
                  {o.installments && (
                    <span className="text-text-muted" title={MSI_TITLE}>
                      {' '}
                      · {msiText(o.installments)}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap">{money(o.price)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <AsistenteBox
        target={{ requestId, groupKey: group.key }}
        product={group.title}
        price={best.price}
        store={best.store}
        send={send}
      />
    </li>
  );
}

/** What came back from a search (or "Buscando…"). */
function Results({ results, send }: { results: OfertasResults; send: Send }) {
  if (results.searching) {
    return <p className="text-text-muted">{searchingText(results.sources)}</p>;
  }
  const sentence = sourcesSentence(results.sources);
  const failed = allSourcesFailed(results.sources);
  const groups = [...results.groups].sort(
    (a, b) => Math.min(...a.offers.map((o) => o.price)) - Math.min(...b.offers.map((o) => o.price)),
  );
  return (
    <div className="flex flex-col gap-8">
      <SourceChips sources={results.sources} />
      {sentence && <p className="text-status-permission">{sentence}</p>}
      {results.sources.some((s) => s.fragile) && (
        <p className="text-xs text-text-muted">
          · tienda frágil: se lee de su página y puede fallar.
        </p>
      )}

      <WatchBox key={results.requestId} query={results.query} send={send} />

      {groups.length > 0 ? (
        <ul className="flex flex-col gap-6">
          {groups.map((g) => (
            <Group key={g.key} group={g} requestId={results.requestId} send={send} />
          ))}
        </ul>
      ) : failed ? (
        <p className="text-status-error">
          Ninguna tienda contestó esta vez. Prueba en unos minutos o usa las ligas de abajo.
        </p>
      ) : (
        <p className="text-text-muted">
          Ninguna tienda lo tiene con ese nombre; prueba con menos palabras.
        </p>
      )}

      {results.deals.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className={sectionTitle}>La comunidad ya lo publicó</div>
          <ul className="flex flex-col gap-2">
            {results.deals.slice(0, DEALS_MAX).map((d) => (
              <li
                key={d.id}
                className={`flex justify-between gap-8 ${d.expired ? 'opacity-50' : ''}`}
              >
                <span>
                  <StoreLink href={d.url}>{d.title}</StoreLink>
                  <span className="text-text-muted">
                    {d.merchant ? ` · ${d.merchant}` : ''}
                    {d.expired ? ' · vencida' : ''}
                  </span>
                  {d.installments && (
                    <span className="text-text-muted" title={MSI_TITLE}>
                      {' '}
                      · {msiText(d.installments)}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap">
                  {d.price !== undefined ? `${money(d.price)} · ` : ''}
                  <span className="text-warning">{Math.round(d.temperature)}°</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className={sectionTitle}>Ábrelo tú</div>
        <p className="text-text-muted">
          {results.links.length > 0
            ? 'Estas tiendas no se leen solas; la búsqueda ya va lista. Profeco compara precios de varias tiendas.'
            : 'Profeco compara precios de varias tiendas.'}
        </p>
        <ul className="flex flex-wrap gap-8">
          {[...results.links, profecoLink()].map((l) => (
            <li key={l.url}>
              <StoreLink href={l.url}>{l.name}</StoreLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The search tab: a field, the stores' answers and the box to keep watching it. */
export function OfertasBuscar({
  status,
  results,
  send,
}: {
  status?: OfertasStatus;
  results?: OfertasResults;
  send: Send;
}) {
  const [query, setQuery] = useState(results?.query ?? '');
  const search = () => {
    const q = query.trim();
    if (!q) return;
    const requestId = ofertasStore.startSearch(q);
    send({ type: 'searchOfertas', requestId, query: q });
  };
  const busy = results?.searching === true;
  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className={`${inputClass} flex-1 min-w-0`}
          type="search"
          aria-label="¿Qué producto buscas?"
          placeholder="¿Qué producto buscas?"
          maxLength={QUERY_MAX}
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            // Emptied (the field's own "x", or by hand): the last search goes away with it
            if (!e.target.value.trim()) ofertasStore.clearSearch();
          }}
          autoFocus
        />
        <Button
          type="submit"
          size="md"
          variant={busy || !query.trim() || !status ? 'disabled' : 'accent'}
          disabled={busy || !query.trim() || !status}
          className="shadow-pixel"
        >
          Buscar
        </Button>
      </form>
      {results ? (
        <Results results={results} send={send} />
      ) : (
        <p className="text-text-muted">
          Busca un producto y ve su precio en varias tiendas a la vez, el más barato primero. Si te
          gusta, déjalo vigilando y la oficina te avisa cuando baje. Por ejemplo: audífonos
          bluetooth.
        </p>
      )}
    </div>
  );
}
