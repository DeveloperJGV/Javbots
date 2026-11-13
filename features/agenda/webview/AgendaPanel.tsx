import { useState, useSyncExternalStore } from 'react';

import type { AgendaCalendar, AgendaItem, AgendaStatus } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { agendaStore } from './agendaStore.js';
import {
  type AgendaDraft,
  conflictKeys,
  dayLabel,
  defaultCalendar,
  draftConflicts,
  draftSummary,
  findConflicts,
  groupByDay,
  itemDay,
  itemKey,
  rangeText,
  splitPrefix,
  timeText,
} from './agendaText.js';
import { AGENDA_KINDS, HALF_HOURS_LIST_ID } from './constants.js';
import { PlanSection, TimeField } from './PlanSection.js';
import { halfHours, planOf, timeFieldOk } from './planView.js';

const linkClass = 'text-accent-bright underline';
const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';

/** A square in the calendar's own Google color. */
function CalendarDot({ calendar }: { calendar?: AgendaCalendar }) {
  if (!calendar?.color) return null;
  return (
    <span
      aria-hidden
      className="inline-block w-8 h-8 mr-4 border border-border align-middle"
      style={{ backgroundColor: calendar.color }}
    />
  );
}

function ItemLine({
  item,
  calendar,
  clash,
  overdue,
  onDone,
  busy,
}: {
  item: AgendaItem;
  calendar?: AgendaCalendar;
  clash: boolean;
  overdue?: boolean;
  onDone?: () => void;
  busy: boolean;
}) {
  const { prefix, rest } = splitPrefix(item.title);
  const time = item.busy ? rangeText(item) : timeText(item);
  return (
    <li className="flex items-start justify-between gap-8">
      <span className="flex flex-col">
        <span className={`text-base ${item.busy ? 'text-text-muted' : ''}`}>
          {item.kind === 'task' ? (
            <span className="text-status-permission">☐ </span>
          ) : (
            <span className="text-text-muted">
              <CalendarDot calendar={calendar} />
              {time || 'todo el día'} ·{' '}
            </span>
          )}
          {prefix && <span className="text-accent-bright">{prefix}: </span>}
          {item.link ? (
            <a className="hover:underline" href={item.link} target="_blank" rel="noreferrer">
              {rest}
            </a>
          ) : (
            rest
          )}
          {calendar && <span className="text-text-muted"> · {calendar.name}</span>}
          {item.listName && <span className="text-text-muted"> · {item.listName}</span>}
          {clash && <span className="text-status-error"> · choca con otro</span>}
          {overdue && <span className="text-status-error"> · atrasada</span>}
        </span>
        {item.location && <span className="text-text-muted">{item.location}</span>}
      </span>
      {onDone && (
        <Button size="sm" variant={busy ? 'disabled' : 'default'} disabled={busy} onClick={onDone}>
          Hecha
        </Button>
      )}
    </li>
  );
}

/** Write, check, confirm: nothing goes to Google before the owner says yes. */
function AddForm({ status, send }: { status: AgendaStatus; send: (d: AgendaDraft) => void }) {
  const [kindId, setKindId] = useState(AGENDA_KINDS[1].id);
  const [text, setText] = useState('');
  const [date, setDate] = useState(status.from);
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [review, setReview] = useState<AgendaDraft | null>(null);
  const [pickedCalendar, setPickedCalendar] = useState<string | undefined>(undefined);
  const kind = AGENDA_KINDS.find((k) => k.id === kindId) ?? AGENDA_KINDS[0];
  const isTask = kind.kind === 'task';
  const writable = (status.calendars ?? []).filter((c) => c.writable);
  const calendar =
    pickedCalendar ?? defaultCalendar(kind.id, status.sharedCalendar, status.homeCalendar);

  const draft = (): AgendaDraft | null => {
    const rest = text.trim();
    if (!rest || (!isTask && (!date || !calendar))) return null;
    // Times are typed as 24 h text: nothing is sent while one of them is not a time.
    if (!isTask && (!timeFieldOk(time, true) || !timeFieldOk(endTime, true))) return null;
    return {
      kind: kind.kind,
      title: kind.prefix ? `${kind.prefix} ${rest}` : rest,
      date: date || undefined,
      time: !isTask && time ? time : undefined,
      endTime: !isTask && time && endTime ? endTime : undefined,
      calendar: !isTask ? calendar : undefined,
    };
  };

  if (review) {
    const clashes = draftConflicts(review, status.items);
    return (
      <div className="flex flex-col gap-4 border-2 border-border p-8">
        <span>¿Lo agrego así?</span>
        <span className="text-base text-accent-bright">
          {draftSummary(review, status.from, status.calendars)}
        </span>
        {clashes.length > 0 && (
          <span className="text-status-error">
            Choca con: {clashes.map((c) => `${c.title} (${timeText(c)})`).join(', ')}
          </span>
        )}
        <span className="flex gap-8">
          <Button
            size="sm"
            variant={status.saving ? 'disabled' : 'accent'}
            disabled={status.saving}
            onClick={() => {
              send(review);
              setReview(null);
              setText('');
              setTime('');
              setEndTime('');
            }}
          >
            Sí, agregar
          </Button>
          <Button size="sm" onClick={() => setReview(null)}>
            Corregir
          </Button>
        </span>
      </div>
    );
  }

  const ready = draft();
  return (
    <div className="flex flex-col gap-4">
      <span className="flex flex-wrap gap-4">
        {AGENDA_KINDS.map((k) => (
          <Button
            key={k.id}
            size="sm"
            variant={k.id === kindId ? 'active' : 'default'}
            onClick={() => {
              setKindId(k.id);
              setPickedCalendar(undefined);
            }}
          >
            {k.label}
          </Button>
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-4">
        {kind.prefix && <span className="text-accent-bright">{kind.prefix}</span>}
        <input
          type="text"
          value={text}
          maxLength={180}
          placeholder={isTask ? 'Ej. limpiar el garage' : 'Ej. cena en el centro'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) setReview(ready);
          }}
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
      </span>
      <span className="flex flex-wrap items-center gap-4 text-text-muted">
        <label className="flex items-center gap-4">
          {isTask ? 'Para (opcional)' : 'Día'}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
        {!isTask && (
          <>
            <span className="flex items-center gap-4">
              De
              <TimeField
                label="Hora de inicio (24 h)"
                value={time}
                optional
                list={HALF_HOURS_LIST_ID}
                onChange={setTime}
              />
            </span>
            <span className="flex items-center gap-4">
              a
              <TimeField
                label="Hora de fin (24 h)"
                value={endTime}
                optional
                disabled={!time}
                list={HALF_HOURS_LIST_ID}
                onChange={setEndTime}
              />
            </span>
            <datalist id={HALF_HOURS_LIST_ID}>
              {halfHours().map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <span>(sin hora = todo el día)</span>
          </>
        )}
      </span>
      {!isTask && writable.length > 0 && (
        <label className="flex flex-wrap items-center gap-4 text-text-muted">
          Calendario
          <select
            value={calendar ?? ''}
            onChange={(e) => setPickedCalendar(e.target.value || undefined)}
            className={inputClass}
          >
            {!calendar && <option value="">(escoge uno)</option>}
            {writable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        size="sm"
        className="self-start"
        variant={ready ? 'default' : 'disabled'}
        disabled={!ready}
        onClick={() => ready && setReview(ready)}
      >
        Revisar antes de agregar
      </Button>
    </div>
  );
}

/**
 * "Hoy y esta semana" (features/agenda): opens from the furniture of the agenda room. Events of the shared calendar
 * (their type from the title: "Salida: …"), the owner's Google Tasks, clashes, adding (after a confirmation) and
 * marking tasks done.
 */
export function AgendaPanel({ transport }: { transport: MessageTransport }) {
  const { status, open } = useSyncExternalStore(agendaStore.subscribe, agendaStore.get);
  if (!open || !status) return null;
  const token = officeToken();
  const loginHref = token ? `/api/google/login?token=${encodeURIComponent(token)}` : null;
  const { days, undated } = groupByDay(status.items, status.from, status.days);
  const clash = conflictKeys(status.items);
  const pairs = findConflicts(status.items);
  const done = (id: string) => transport.send({ type: 'completeAgendaTask', id });
  const calendarOf = (i: AgendaItem) => status.calendars?.find((c) => c.id === i.calendar);
  const homeMissing = status.connected && !!status.calendars?.length && !status.homeCalendar;
  const plan = planOf(status);

  return (
    <Modal
      isOpen
      onClose={() => agendaStore.close()}
      title="Hoy y esta semana"
      className="w-[min(760px,94vw)]"
    >
      <div className="max-h-[75vh] overflow-y-auto px-10 pb-6 flex flex-col gap-8 text-sm text-text">
        {!status.connected && (
          <p>
            Conecta tu cuenta de Google para ver tu calendario y tus tareas.{' '}
            {loginHref ? (
              <a className={linkClass} href={loginHref} target="_blank" rel="noreferrer">
                Conectar con Google
              </a>
            ) : (
              <span className="text-text-muted">Abre la oficina con su enlace con token.</span>
            )}
          </p>
        )}
        {status.error && <p className="text-status-error">{status.error}</p>}
        {homeMissing && (
          <p className="text-text-muted">
            No encontré tu calendario de la casa (el de `casa` en agenda.json): los eventos que no
            son de los dos necesitan que escojas el calendario.
          </p>
        )}

        {status.connected && (
          <>
            {plan && (
              <PlanSection
                plan={plan}
                today={status.from}
                saving={status.saving}
                transport={transport}
              />
            )}

            <section className="flex flex-col gap-4">
              <div className="text-lg text-accent-bright">Agregar</div>
              <AddForm
                status={status}
                send={(d) => transport.send({ type: 'addAgendaItem', ...d })}
              />
              {status.saving && <span className="text-text-muted">Guardando…</span>}
            </section>

            {pairs.length > 0 && (
              <section className="flex flex-col gap-2 text-status-error">
                <div className="text-lg">Choques de horario</div>
                {pairs.map(([a, b]) => (
                  <span key={`${itemKey(a)}|${itemKey(b)}`}>
                    {dayLabel(itemDay(a) ?? status.from, status.from)}: {a.title} ({timeText(a)}) y{' '}
                    {b.title} ({timeText(b)})
                  </span>
                ))}
              </section>
            )}

            {days.map((d) => (
              <section key={d.day} className="flex flex-col gap-2">
                <div className="text-lg text-accent-bright">{dayLabel(d.day, status.from)}</div>
                {d.events.length + d.tasks.length === 0 ? (
                  <span className="text-text-muted">Nada.</span>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {d.events.map((e) => (
                      <ItemLine
                        key={itemKey(e)}
                        item={e}
                        calendar={calendarOf(e)}
                        clash={clash.has(itemKey(e))}
                        busy={status.saving}
                      />
                    ))}
                    {d.tasks.map((t) => (
                      <ItemLine
                        key={itemKey(t)}
                        item={t}
                        clash={false}
                        overdue={(itemDay(t) ?? d.day) < status.from}
                        busy={status.saving}
                        onDone={() => done(t.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {undated.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="text-lg text-accent-bright">Tareas sin fecha</div>
                <ul className="flex flex-col gap-2">
                  {undated.map((t) => (
                    <ItemLine
                      key={itemKey(t)}
                      item={t}
                      clash={false}
                      busy={status.saving}
                      onDone={() => done(t.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            <button
              className="self-start text-xs text-text-muted underline"
              onClick={() => transport.send({ type: 'refreshAgenda' })}
            >
              Volver a leer
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
