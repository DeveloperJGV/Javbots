import { useState } from 'react';

import type {
  AgendaPlan,
  AgendaPlanBlock,
  AgendaPlanPrefs,
  AgendaPlanRange,
  AgendaPlanRule,
  AgendaPlanTask,
} from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { dayTotalText, minutesText } from '../plan/planText.js';
import { dayLabel } from './agendaText.js';
import {
  PLAN_AUTO_MINUTES,
  PLAN_NEW_REST,
  PLAN_NEW_RULE_MINUTES,
  PLAN_WEEK_LETTERS,
  PLAN_WEEK_NAMES,
} from './constants.js';
import {
  blockIds,
  emptyPlanText,
  type MinuteKind,
  minuteLabel,
  minuteOptions,
  normalizeTime,
  numberFrom,
  partText,
  prefsEqual,
  prefsValid,
  rangeOk,
  timeFieldOk,
  toggleDay,
  weekDays,
  weekLine,
} from './planView.js';

const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';
const smallInputClass = `${inputClass} w-[72px]`;
const timeInputClass = 'py-2 px-4 bg-bg-dark border-2 rounded-none text-text w-[72px] tabular-nums';
const quietSelectClass =
  'py-0 px-2 bg-bg-dark border border-border rounded-none text-xs text-text-muted';
const titleClass = 'text-lg text-accent-bright';

/** "Cuánto tarda": the choices for its kind plus "Automático" (0 = the rules decide again). */
function MinutesSelect({
  task,
  kind,
  blockMinutes,
  quiet,
  disabled,
  onChange,
}: {
  task: AgendaPlanTask;
  kind: MinuteKind;
  blockMinutes: number;
  quiet?: boolean;
  disabled: boolean;
  onChange: (minutes: number) => void;
}) {
  return (
    <select
      aria-label={`Cuánto tarda ${task.title}`}
      value={task.minutes}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={quiet ? quietSelectClass : `${inputClass} text-xs`}
    >
      {minuteOptions(task.minutes, kind, blockMinutes).map((m) => (
        <option key={m} value={m}>
          {minuteLabel(m, task)}
        </option>
      ))}
      <option value={PLAN_AUTO_MINUTES}>Automático</option>
    </select>
  );
}

function BlockRow({
  block,
  blockMinutes,
  saving,
  send,
}: {
  block: AgendaPlanBlock;
  blockMinutes: number;
  saving: boolean;
  send: MessageTransport['send'];
}) {
  const ids = blockIds(block);
  const part = partText(block);
  const setMinutes = (id: string, minutes: number) =>
    send({ type: 'agendaPlanAction', action: 'minutes', ids: [id], minutes });
  const done = (taskIds: string[]) =>
    send({ type: 'agendaPlanAction', action: 'done', ids: taskIds });
  // The garden round and "Pendientes rápidos" list their tasks, each with its own check box and minutes.
  const grouped = !!(block.round || block.quick);
  const single = !grouped && block.tasks.length === 1 ? block.tasks[0] : undefined;
  return (
    <li className="flex items-start gap-8 border-2 border-border p-8">
      <span className="flex flex-col items-center shrink-0 w-[72px]">
        <span className="text-xl text-accent-bright tabular-nums">{block.start}</span>
        <span className="text-xs text-text-muted">{minutesText(block.minutes)}</span>
      </span>
      <span className="flex flex-col flex-1 gap-2 min-w-0">
        <span className="text-base">{block.title}</span>
        {block.why && <span className="text-text-muted">{block.why}</span>}
        {part && <span className="text-text-muted">{part}</span>}
        {grouped && block.tasks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {block.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-4">
                <button
                  className={`text-status-permission ${saving ? 'cursor-default opacity-[var(--btn-disabled-opacity)]' : 'cursor-pointer hover:text-accent-bright'}`}
                  aria-label={`Hecha: ${t.title}`}
                  title="Marcar hecha"
                  disabled={saving}
                  onClick={() => done([t.id])}
                >
                  ☐
                </button>
                <span className="flex-1">{t.title}</span>
                <MinutesSelect
                  task={t}
                  kind={block.round ? 'garden' : 'quick'}
                  blockMinutes={blockMinutes}
                  quiet
                  disabled={saving}
                  onChange={(m) => setMinutes(t.id, m)}
                />
              </li>
            ))}
          </ul>
        )}
        <span className="flex flex-wrap items-center gap-4">
          <Button
            size="sm"
            variant={saving ? 'disabled' : 'accent'}
            disabled={saving}
            onClick={() => done(ids)}
          >
            Hecho
          </Button>
          <Button
            size="sm"
            variant={saving ? 'disabled' : 'default'}
            disabled={saving}
            onClick={() => send({ type: 'agendaPlanAction', action: 'skip', ids })}
          >
            Hoy no
          </Button>
          {single && (
            <MinutesSelect
              task={single}
              kind="task"
              blockMinutes={blockMinutes}
              quiet={single.minutes < blockMinutes}
              disabled={saving}
              onChange={(m) => setMinutes(single.id, m)}
            />
          )}
        </span>
      </span>
    </li>
  );
}

/**
 * A 24 h time typed as text ("7:30", "0730" become "07:30" on leaving the field); red while it is not a time.
 * `optional` lets it stay empty; `list` names a <datalist> of suggested times.
 */
export function TimeField({
  label,
  value,
  invalid,
  disabled,
  optional,
  list,
  onChange,
}: {
  label: string;
  value: string;
  invalid?: boolean;
  disabled?: boolean;
  optional?: boolean;
  list?: string;
  onChange: (text: string) => void;
}) {
  const bad = invalid || !timeFieldOk(value, optional);
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      maxLength={5}
      aria-label={label}
      aria-invalid={bad}
      value={value}
      list={list}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const t = normalizeTime(value);
        if (t && t !== value) onChange(t);
      }}
      className={`${timeInputClass} ${bad ? 'border-status-error' : 'border-border'}`}
    />
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AgendaPlanRange;
  onChange: (r: AgendaPlanRange) => void;
}) {
  const order = !rangeOk(value) && !!normalizeTime(value.from) && !!normalizeTime(value.to);
  return (
    <span className="flex flex-wrap items-center gap-4">
      <span className="w-[120px]">{label}</span>
      <TimeField
        label={`${label}: desde`}
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
      />
      a
      <TimeField
        label={`${label}: hasta`}
        value={value.to}
        invalid={order}
        onChange={(to) => onChange({ ...value, to })}
      />
    </span>
  );
}

function NumberInput({
  label,
  value,
  min = 0,
  onChange,
  after,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
  after?: string;
}) {
  return (
    <label className="flex flex-wrap items-center gap-4">
      <span className="flex-1 min-w-[200px]">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(numberFrom(e.target.value, value, min))}
        className={smallInputClass}
      />
      {after && <span className="text-text-muted">{after}</span>}
    </label>
  );
}

/** An editable list of "word → minutes" rules (remove, add; at least 1 min each). */
function RulesEditor({
  title,
  note,
  addLabel,
  rules,
  onChange,
}: {
  title: string;
  note?: string;
  addLabel: string;
  rules: readonly AgendaPlanRule[];
  onChange: (rules: AgendaPlanRule[]) => void;
}) {
  const edit = (i: number, next: AgendaPlanRule) =>
    onChange(rules.map((x, j) => (j === i ? next : x)));
  return (
    <span className="flex flex-col gap-2">
      <span>{title}</span>
      {note && <span className="text-text-muted">{note}</span>}
      {rules.map((r, i) => (
        <span key={i} className="flex flex-wrap items-center gap-4">
          <input
            type="text"
            aria-label={`${title}: palabra ${i + 1}`}
            value={r.word}
            maxLength={40}
            onChange={(e) => edit(i, { ...r, word: e.target.value })}
            className={inputClass}
          />
          <input
            type="number"
            min={1}
            aria-label={`Minutos de ${r.word || `la palabra ${i + 1}`}`}
            value={r.minutes}
            onChange={(e) => edit(i, { ...r, minutes: numberFrom(e.target.value, r.minutes, 1) })}
            className={smallInputClass}
          />
          <span className="text-text-muted">min</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
          >
            Quitar
          </Button>
        </span>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() => onChange([...rules, { word: '', minutes: PLAN_NEW_RULE_MINUTES }])}
      >
        {addLabel}
      </Button>
    </span>
  );
}

/** The plan's preferences: a local draft, saved only with "Guardar". */
function PrefsForm({
  prefs,
  saving,
  send,
}: {
  prefs: AgendaPlanPrefs;
  saving: boolean;
  send: MessageTransport['send'];
}) {
  const [draft, setDraft] = useState(prefs);
  const [base, setBase] = useState(prefs);
  const dirty = !prefsEqual(draft, base);
  // New prefs from the server replace the draft unless there are unsaved changes (sync during render).
  if (!dirty && !prefsEqual(prefs, base)) {
    setDraft(prefs);
    setBase(prefs);
  }

  const set = <K extends keyof AgendaPlanPrefs>(key: K, value: AgendaPlanPrefs[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const valid = prefsValid(draft);
  const canSave = dirty && valid && !saving;

  return (
    <div className="flex flex-col gap-6 border-2 border-border p-8 text-text">
      <span className="text-text-muted">
        Estos horarios son de fábrica y provisionales: cámbialos a los tuyos.
      </span>

      <RangeInput label="Mañana" value={draft.morning} onChange={(r) => set('morning', r)} />
      <span className="flex flex-col gap-2">
        <RangeInput label="Trabajo" value={draft.work} onChange={(r) => set('work', r)} />
        <span className="text-text-muted">Aquí solo caben cosas chicas.</span>
      </span>
      <RangeInput label="Tarde" value={draft.evening} onChange={(r) => set('evening', r)} />
      <RangeInput label="Fin de semana" value={draft.weekend} onChange={(r) => set('weekend', r)} />

      <span className="flex flex-col gap-2">
        <span>Descansos</span>
        <span className="text-text-muted">En los descansos no se pone nada.</span>
        {draft.rest.map((r, i) => (
          <span key={i} className="flex flex-wrap items-center gap-4">
            <RangeInput
              label={`Descanso ${i + 1}`}
              value={r}
              onChange={(next) =>
                set(
                  'rest',
                  draft.rest.map((x, j) => (j === i ? next : x)),
                )
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                set(
                  'rest',
                  draft.rest.filter((_, j) => j !== i),
                )
              }
            >
              Quitar
            </Button>
          </span>
        ))}
        <Button
          size="sm"
          className="self-start"
          onClick={() => set('rest', [...draft.rest, { ...PLAN_NEW_REST }])}
        >
          Agregar descanso
        </Button>
      </span>

      <span className="flex flex-wrap items-center gap-4">
        <span className="w-[120px]">Días de trabajo</span>
        {PLAN_WEEK_LETTERS.map((letter, day) => {
          const on = draft.workDays.includes(day);
          return (
            <Button
              key={day}
              size="sm"
              variant={on ? 'active' : 'default'}
              aria-pressed={on}
              aria-label={PLAN_WEEK_NAMES[day]}
              onClick={() => set('workDays', toggleDay(draft.workDays, day))}
            >
              {letter}
            </Button>
          );
        })}
      </span>

      <NumberInput
        label="Tope diario (ratos)"
        value={draft.dailyBlocks}
        onChange={(n) => set('dailyBlocks', n)}
        after={`= ${minutesText(draft.dailyBlocks * draft.blockMinutes)} al día`}
      />
      <NumberInput
        label="Tamaño del rato (min)"
        value={draft.blockMinutes}
        min={1}
        onChange={(n) => set('blockMinutes', n)}
      />
      <span className="flex flex-col gap-2">
        <NumberInput
          label="Cosa chica: hasta (min)"
          value={draft.smallMinutes}
          onChange={(n) => set('smallMinutes', n)}
        />
        <span className="text-text-muted">
          Las cosas chicas se juntan en un rato de Pendientes rápidos, que sí cabe en horario de
          trabajo.
        </span>
      </span>
      <NumberInput
        label="Margen alrededor de eventos (min)"
        value={draft.marginMinutes}
        onChange={(n) => set('marginMinutes', n)}
      />
      <NumberInput
        label="Adelantar tareas con fecha (días)"
        value={draft.soonDays}
        onChange={(n) => set('soonDays', n)}
      />
      <RulesEditor
        title="Minutos por palabra"
        note="Si el título trae la palabra, la tarea dura esos minutos (gana la primera)."
        addLabel="Agregar palabra"
        rules={draft.rules}
        onChange={(r) => set('rules', r)}
      />

      <div className="flex flex-col gap-4 border-2 border-border p-8">
        <span className="text-accent-bright">Ronda de plantas</span>
        <label className="flex flex-wrap items-center gap-4">
          <span className="flex-1 min-w-[200px]">Lista del jardín (en Tasks)</span>
          <input
            type="text"
            value={draft.gardenList}
            maxLength={100}
            onChange={(e) => set('gardenList', e.target.value)}
            className={inputClass}
          />
        </label>
        <RulesEditor
          title="Minutos por tipo de cuidado"
          addLabel="Agregar cuidado"
          rules={draft.gardenRules}
          onChange={(r) => set('gardenRules', r)}
        />
        <NumberInput
          label="Otro cuidado (min)"
          value={draft.gardenMinutes}
          onChange={(n) => set('gardenMinutes', n)}
        />
        <NumberInput
          label="Arranque por ronda (min)"
          value={draft.gardenSetupMinutes}
          onChange={(n) => set('gardenSetupMinutes', n)}
        />
        <span className="text-text-muted">
          La ronda suma sus cuidados más el arranque y se cierra a ratos de 30 min (hasta 35 min
          cuenta como un rato). Una marca como (8 min) en el título gana.
        </span>
      </div>

      <span className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-4">
          <input
            type="checkbox"
            checked={draft.morningNotice}
            onChange={(e) => set('morningNotice', e.target.checked)}
          />
          Aviso de la mañana a las
        </label>
        <TimeField
          label="Hora del aviso de la mañana"
          value={draft.morningAt}
          disabled={!draft.morningNotice}
          onChange={(t) => set('morningAt', t)}
        />
      </span>
      <NumberInput
        label="Avisar antes de cada bloque (min)"
        value={draft.remindMinutes}
        onChange={(n) => set('remindMinutes', n)}
        after={draft.remindMinutes ? undefined : '(apagado)'}
      />

      {!valid && <span className="text-status-error">Revisa las horas marcadas.</span>}
      <span className="flex flex-wrap gap-8">
        <Button
          size="sm"
          variant={canSave ? 'accent' : 'disabled'}
          disabled={!canSave}
          onClick={() => {
            send({ type: 'setAgendaPlanPrefs', prefs: draft });
            setBase(draft);
          }}
        >
          Guardar
        </Button>
        <Button
          size="sm"
          variant={saving ? 'disabled' : 'default'}
          disabled={saving}
          onClick={() => send({ type: 'setAgendaPlanPrefs', reset: true })}
        >
          Valores de fábrica
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setDraft(base)}>
            Deshacer cambios
          </Button>
        )}
      </span>
    </div>
  );
}

/**
 * "Plan de hoy" (features/agenda): today's blocks with done / not today / how long, the rest of the week, what did
 * not fit and the plan's preferences. The plan is made by the office (features/agenda/plan); this only shows it.
 */
export function PlanSection({
  plan,
  today,
  saving,
  transport,
}: {
  plan: AgendaPlan;
  today: string;
  saving: boolean;
  transport: MessageTransport;
}) {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const send: MessageTransport['send'] = (m) => transport.send(m);
  const day0 = plan.days[0];
  const blockMinutes = plan.prefs.blockMinutes;
  const empty = emptyPlanText(plan);
  const week = weekDays(plan);

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-8">
          <span className={titleClass}>Plan de hoy</span>
          {day0 && <span className="text-text-muted">{dayTotalText(day0, blockMinutes)}</span>}
        </div>
        {empty ? (
          <span className="text-text-muted">{empty}</span>
        ) : (
          <ul className="flex flex-col gap-4">
            {day0?.blocks.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                blockMinutes={blockMinutes}
                saving={saving}
                send={send}
              />
            ))}
          </ul>
        )}
      </section>

      {week.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className={titleClass}>Esta semana</div>
          {week.map((d) => (
            <div key={d.day} className="flex flex-col gap-2">
              <span>
                <span className="text-accent-bright">{dayLabel(d.day, today)}</span>
                <span className="text-text-muted"> · {dayTotalText(d, blockMinutes)}</span>
              </span>
              <ul className="flex flex-col gap-2 pl-8">
                {d.blocks.map((b) => (
                  <li key={b.id} className="tabular-nums">
                    {weekLine(b)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {plan.leftover.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className={titleClass}>No cupo esta semana</div>
          <ul className="flex flex-col gap-2">
            {plan.leftover.map((l, i) => (
              <li key={`${l.title}-${i}`}>
                {l.title} <span className="text-text-muted">· {minutesText(l.minutes)}</span>
                {l.why && <span className="text-text-muted"> — {l.why}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <button
          className="self-start text-text-muted underline"
          aria-expanded={prefsOpen}
          onClick={() => setPrefsOpen((o) => !o)}
        >
          Preferencias del plan {prefsOpen ? '▾' : '▸'}
        </button>
        {prefsOpen && <PrefsForm prefs={plan.prefs} saving={saving} send={send} />}
      </section>
    </>
  );
}
