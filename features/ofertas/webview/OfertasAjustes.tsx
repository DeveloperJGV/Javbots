import type { OfertasAsistenteEstado, OfertasStatus } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Checkbox } from '../../../webview-ui/src/components/ui/Checkbox.js';
import {
  ASISTENTE_MODELS,
  ASISTENTE_SETTINGS_NOTE,
  BROWSER_NOTE,
  BROWSER_ROBOTS_NOTE,
  BROWSER_STORE_OFF_NOTE,
  BROWSER_SWITCH_LABEL,
  DROP_PERCENT_OPTIONS,
  EVERY_MINUTES_OPTIONS,
  KEY_STEPS,
  OPT_IN_SOURCE_NOTE,
  OPT_IN_SOURCES,
} from './constants.js';
import { sectionTitle, type Send, StoreLink } from './OfertasComun.js';
import { clock, money, shortDate, SOURCE_STATE_LABEL } from './ofertasText.js';

/** The alerts, newest first. */
export function OfertasAvisos({ status, now }: { status: OfertasStatus; now: number }) {
  const alerts = [...status.alerts].sort((a, b) => b.at.localeCompare(a.at));
  if (alerts.length === 0) return <p className="text-text-muted">Sin avisos todavía.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`flex justify-between gap-8 border-l-2 pl-6 ${a.seen ? 'border-border' : 'border-accent-bright'}`}
        >
          <span className="flex flex-col">
            <span>{a.text}</span>
            <span className="text-xs text-text-muted">
              {clock(a.at)} · {shortDate(a.at, now)}
              {a.price !== undefined ? ` · ${money(a.price)}` : ''}
              {a.store ? ` · ${a.store}` : ''}
            </span>
          </span>
          {a.url && <StoreLink href={a.url}>Ver</StoreLink>}
        </li>
      ))}
    </ul>
  );
}

/** A row of choices; the chosen one looks pressed. */
function Choices({
  options,
  value,
  label,
  onPick,
}: {
  options: readonly number[];
  value: number;
  label: (n: number) => string;
  onPick: (n: number) => void;
}) {
  return (
    <span className="flex flex-wrap gap-4">
      {options.map((n) => (
        <Button
          key={n}
          size="sm"
          variant={n === value ? 'active' : 'default'}
          aria-pressed={n === value}
          onClick={() => onPick(n)}
        >
          {label(n)}
        </Button>
      ))}
    </span>
  );
}

/** The optional assistant: on/off and its model. Only when the server said how it is. */
function AsistenteAjustes({ estado, send }: { estado?: OfertasAsistenteEstado; send: Send }) {
  if (!estado) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className={sectionTitle}>Asistente</div>
      {estado.installed ? (
        <>
          <Checkbox
            className="px-0!"
            label="Asistente (usa Claude Code de esta máquina)"
            checked={estado.enabled}
            onChange={() => send({ type: 'setOfertasAsistente', enabled: !estado.enabled })}
          />
          {estado.enabled && (
            <span className="flex flex-wrap items-center gap-8">
              <span className="text-text-muted">Modelo</span>
              <span className="flex flex-wrap gap-4">
                {ASISTENTE_MODELS.map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={m.id === estado.model ? 'active' : 'default'}
                    aria-pressed={m.id === estado.model}
                    onClick={() => send({ type: 'setOfertasAsistente', model: m.id })}
                  >
                    {m.label}
                    {m.id === 'haiku' ? ' (de fábrica)' : ''}
                  </Button>
                ))}
              </span>
            </span>
          )}
          <span className="text-xs text-text-muted">
            {ASISTENTE_SETTINGS_NOTE} Investiga el precio normal y busca similares cuando se lo
            pides; la búsqueda por tiendas funciona igual sin él.
          </span>
        </>
      ) : (
        <span className="text-xs text-text-muted">
          Claude Code no está instalado en esta máquina: el asistente no aparece. La búsqueda por
          tiendas funciona igual.
        </span>
      )}
    </section>
  );
}

/**
 * "Leer con el navegador": the general switch and one per store that can be read that way. A store whose robots.txt
 * does not allow it says so in its own line, on or off; marking it also takes it out of the switched-off list (it
 * has no other place to be turned on). A store switched off in "Tiendas" stays off: its line says so.
 */
function NavegadorAjustes({ status, send }: { status: OfertasStatus; send: Send }) {
  const { settings } = status;
  const nav = settings.navegador ?? { on: false, sources: [] };
  const stores = status.sources.filter((s) => s.browser);
  if (stores.length === 0) return null;
  const setNav = (on: boolean, sources: string[], extra: Record<string, unknown> = {}) =>
    send({ type: 'setOfertasSettings', navegador: { on, sources }, ...extra });
  const toggleStore = (id: string, robots: boolean) => {
    const marked = nav.sources.includes(id);
    const sources = marked ? nav.sources.filter((x) => x !== id) : [...nav.sources, id];
    const extra =
      !marked && robots && settings.disabledSources.includes(id)
        ? { disabledSources: settings.disabledSources.filter((x) => x !== id) }
        : {};
    setNav(nav.on, sources, extra);
  };
  return (
    <section className="flex flex-col gap-2">
      <div className={sectionTitle}>Leer con el navegador</div>
      <Checkbox
        className="px-0!"
        label={BROWSER_SWITCH_LABEL}
        checked={nav.on}
        onChange={() => setNav(!nav.on, nav.sources)}
      />
      <span className="text-xs text-text-muted pb-4">{BROWSER_NOTE}</span>
      {nav.on && (
        <ul className="flex flex-col" aria-label="Tiendas que se leen con el navegador">
          {stores.map((s) => {
            const marked = nav.sources.includes(s.id);
            const robots = !!s.linkOnly;
            const offAbove = marked && !robots && settings.disabledSources.includes(s.id);
            return (
              <li key={s.id} className="flex flex-col">
                <Checkbox
                  className="px-0!"
                  label={robots ? `${s.name} · ${BROWSER_ROBOTS_NOTE}` : s.name}
                  checked={marked}
                  onChange={() => toggleStore(s.id, robots)}
                />
                {offAbove && (
                  <span className="text-xs text-status-permission -mt-4 pb-2">
                    {BROWSER_STORE_OFF_NOTE}
                  </span>
                )}
                {marked && s.viaBrowser && s.state !== 'idle' && s.state !== 'off' && (
                  <span className="text-xs text-text-muted -mt-4 pb-2">
                    {SOURCE_STATE_LABEL[s.state]}
                    {s.detail ? ` · ${s.detail}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Which stores to ask, how often to check, the sale mode and when a drop is worth an alert. */
export function OfertasAjustes({
  status,
  asistente,
  send,
}: {
  status: OfertasStatus;
  asistente?: OfertasAsistenteEstado;
  send: Send;
}) {
  const { settings } = status;
  const toggleSource = (id: string) => {
    const off = new Set(settings.disabledSources);
    if (off.has(id)) off.delete(id);
    else off.add(id);
    send({ type: 'setOfertasSettings', disabledSources: [...off] });
  };
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <div className={sectionTitle}>Tiendas</div>
        <ul className="flex flex-col">
          {status.sources
            .filter((s) => !s.linkOnly)
            .map((s) => (
              <li key={s.id} className="flex flex-col">
                <Checkbox
                  className="px-0!"
                  label={s.name}
                  checked={!settings.disabledSources.includes(s.id)}
                  onChange={() => toggleSource(s.id)}
                />
                <span className="text-xs text-text-muted -mt-4 pb-2">
                  {SOURCE_STATE_LABEL[s.state]}
                  {s.detail && s.state !== 'nokey' && s.state !== 'off' ? ` · ${s.detail}` : ''}
                  {s.fragile ? ' · frágil: lee la página de la tienda, puede fallar' : ''}
                </span>
                {OPT_IN_SOURCES.includes(s.id) && (
                  <span className="text-xs text-status-permission pb-2">{OPT_IN_SOURCE_NOTE}</span>
                )}
                {s.state === 'nokey' && KEY_STEPS[s.id] && (
                  <ol className="text-xs text-status-permission pb-2 pl-8 list-decimal">
                    {KEY_STEPS[s.id]!.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
        </ul>
        {status.sources.some((s) => s.linkOnly) && (
          <div className="flex flex-col gap-2 pt-4">
            <span className="text-text-muted">
              Solo con liga (se pueden leer con el navegador, abajo)
            </span>
            <ul className="flex flex-col gap-1">
              {status.sources
                .filter((s) => s.linkOnly)
                .map((s) => (
                  <li key={s.id} className="text-xs">
                    {/* No arrow: this is not a link (the link to each search is in the watch's row) */}
                    <span className="text-text">{s.name}</span>
                    <span className="text-text-muted">
                      {' '}
                      ·{' '}
                      {s.viaBrowser ? `se lee con el navegador; ${BROWSER_ROBOTS_NOTE}` : s.detail}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <NavegadorAjustes status={status} send={send} />

      <section className="flex flex-col gap-4">
        <div className={sectionTitle}>Cada cuánto revisa</div>
        <Choices
          options={EVERY_MINUTES_OPTIONS}
          value={settings.everyMinutes}
          label={(n) => `${n} min`}
          onPick={(n) => send({ type: 'setOfertasSettings', everyMinutes: n })}
        />
        <Checkbox
          className="px-0!"
          label="Modo Buen Fin (revisa más seguido)"
          checked={settings.buenFin}
          onChange={() => send({ type: 'setOfertasSettings', buenFin: !settings.buenFin })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className={sectionTitle}>Avisar cuando baje más de</div>
        <Choices
          options={DROP_PERCENT_OPTIONS}
          value={settings.dropPercent}
          label={(n) => `${n} %`}
          onPick={(n) => send({ type: 'setOfertasSettings', dropPercent: n })}
        />
      </section>

      <AsistenteAjustes estado={asistente} send={send} />
    </div>
  );
}
