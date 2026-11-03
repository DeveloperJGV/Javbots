import { useEffect, useState, useSyncExternalStore } from 'react';

import type { UsageLimit, UsageProfile } from '../../../core/src/messages.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { officesStore } from '../../../webview-ui/src/offices.js';
import { CLOCK_MS, SPOTLIGHT_MODEL } from './constants.js';
import { type UsageState, usageStore } from './usageStore.js';
import {
  costByModel,
  levelClass,
  limitLabel,
  limitText,
  mainProfile,
  officeUsage,
  PROFILE_LABELS,
  spotlightLimit,
  tokensText,
  totalCost,
} from './usageText.js';

function Bar({ limit, wide }: { limit: UsageLimit | undefined; wide?: boolean }) {
  const pct = limit ? Math.round(limit.pct) : 0;
  return (
    <span
      className={`inline-block h-[10px] ${wide ? 'w-full' : 'w-[64px]'} bg-bg-dark border-2 border-border align-middle`}
    >
      <span className={`block h-full ${levelClass(pct)}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function ProfileBlock({ p, now }: { p: UsageProfile; now: Date }) {
  return (
    <div className="py-4">
      <div className="text-lg text-accent-bright">
        {PROFILE_LABELS[p.profile] ?? p.profile}
        <span className="text-sm text-text-muted">
          {' '}
          · últimas 24 h ≈ {totalCost(p).toFixed(2)} USD estimados
        </span>
      </div>
      {p.fiveHour || p.sevenDay ? (
        <div className="mt-2 flex flex-col gap-4 text-sm text-text">
          <div>
            <div>{limitText('5 horas', p.fiveHour, now)}</div>
            <Bar limit={p.fiveHour} wide />
          </div>
          <div>
            <div>{limitText('Semana', p.sevenDay, now)}</div>
            <Bar limit={p.sevenDay} wide />
          </div>
          {!spotlightLimit(p) && (
            <div>
              <div>{limitText(`Semana · ${SPOTLIGHT_MODEL}`, undefined, now)}</div>
              <Bar limit={undefined} wide />
            </div>
          )}
          {p.otherLimits?.map((l) => (
            <div key={l.key}>
              <div>{limitText(limitLabel(l.key), l, now)}</div>
              <Bar limit={l} wide />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">
          Sin límites del plan (aparecen en Pro/Max, después de la primera respuesta de una sesión).
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-x-16 gap-y-2 text-sm text-text">
        {costByModel(p).map((m) => (
          <span key={m.model}>
            <span className="text-accent-bright">{m.model}</span> {m.costUsd.toFixed(2)} USD ·{' '}
            {tokensText(m.tokens)} tokens · {m.sessions} {m.sessions === 1 ? 'sesión' : 'sesiones'}
          </span>
        ))}
      </div>
      {p.sessions.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-text-muted text-left">
            <tr>
              <th className="font-normal">Agente (carpeta)</th>
              <th className="font-normal">Modelo</th>
              <th className="font-normal text-right">Costo</th>
              <th className="font-normal text-right">Tokens</th>
              <th className="font-normal text-right">Contexto</th>
            </tr>
          </thead>
          <tbody className="text-text">
            {p.sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.folder ?? s.id.slice(0, 8)}</td>
                <td className="text-text-muted">{s.model ?? '—'}</td>
                <td className="text-right">
                  {s.costUsd !== undefined ? `${s.costUsd.toFixed(2)} USD` : '—'}
                </td>
                <td className="text-right">{tokensText(s.tokens)}</td>
                <td className="text-right">
                  {s.contextPct !== undefined ? `${s.contextPct}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Claude usage (features/usage): a small bar with the plan limits (5 hours, week and Fable's week); a click on it, or on the
 * office's usage meter, opens every profile with its limits, when they reset, and what each session (agent) has
 * spent (estimated).
 */
export function UsageBar({ usage }: { usage: UsageState }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => clearInterval(t);
  }, []);
  const offices = useSyncExternalStore(officesStore.subscribe, officesStore.get);
  if (!usage.profiles) return null;
  // Only this office's profiles (core/src/offices.ts), its own one first
  const { profiles, preferred } = officeUsage(usage.profiles, offices.current, offices.offices);
  const main = mainProfile(profiles, preferred);
  const shown = main?.profile ?? preferred;
  const fable = spotlightLimit(main);

  return (
    <>
      <button
        type="button"
        onClick={() => usageStore.setDetailOpen(true)}
        className="absolute bottom-8 left-8 z-44 pixel-panel px-10 py-4 flex items-center gap-8 text-sm text-text cursor-pointer hover:brightness-125"
        title="Uso de Claude: límites del plan y gasto por agente"
      >
        <span className="text-text-muted">{PROFILE_LABELS[shown] ?? shown}</span>
        {main?.fiveHour || main?.sevenDay ? (
          <>
            <span>5 h</span>
            <Bar limit={main.fiveHour} />
            <span>{main.fiveHour ? `${Math.round(main.fiveHour.pct)}%` : '—'}</span>
            <span>Semana</span>
            <Bar limit={main.sevenDay} />
            <span>{main.sevenDay ? `${Math.round(main.sevenDay.pct)}%` : '—'}</span>
            <span>{SPOTLIGHT_MODEL}</span>
            <Bar limit={fable} />
            <span>{fable ? `${Math.round(fable.pct)}%` : '—'}</span>
          </>
        ) : (
          // Nothing yet: say why instead of empty bars (the limits only come while a session is open)
          <span className="text-text-muted">
            {main ? 'sin límites del plan' : 'sin sesión abierta'}
          </span>
        )}
      </button>
      {usage.detailOpen && (
        <Modal
          isOpen
          onClose={() => usageStore.setDetailOpen(false)}
          title="Uso de Claude"
          className="w-[min(760px,94vw)]"
        >
          <div className="max-h-[70vh] overflow-y-auto px-10 pb-6">
            <p className="text-sm text-text-muted">
              Lo que vio tu barra de estado la última vez que hubo una sesión abierta. El costo es
              un estimado de Claude Code a precio de lista, no tu factura.
            </p>
            {profiles.length === 0 && (
              <p className="text-sm text-text">
                Todavía no hay datos: aparecen cuando abres una sesión de Claude Code.
              </p>
            )}
            {profiles.map((p) => (
              <ProfileBlock key={p.profile} p={p} now={now} />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
