import { useState, useSyncExternalStore } from 'react';

import type {
  SearchCriteriaSet,
  SearchRequest,
  SearchResult,
  SearchRoomStatus,
} from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { CriteriaEditor } from '../../busquedas/webview/CriteriaEditor.js';
import { SearchRequestCard } from '../../busquedas/webview/SearchRequestCard.js';
import { DIRECTORIO_KIND_LABELS, DIRECTORIO_ROOM, SERVICE_EVENT_PREFIX } from './constants.js';
import { directorioStore } from './directorioStore.js';
import { scheduleSummary, todayLocal } from './directorioText.js';

const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';
const kindLabel = (k: string) => DIRECTORIO_KIND_LABELS[k] ?? k;

/** What is needed, where and for when; and which criteria. Saving does not launch anything yet. */
function NewRequest({
  criteria,
  onSave,
}: {
  criteria: SearchCriteriaSet[];
  onSave: (r: { text: string; place: string; when: string; criteriaId: string }) => void;
}) {
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState('');
  const [criteriaId, setCriteriaId] = useState(criteria[0]?.id ?? '');
  const ready = text.trim().length > 0;
  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={text}
        maxLength={300}
        placeholder="¿Qué necesitas? Ej. reparar refrigerador que no enfría, marca y modelo"
        onChange={(e) => setText(e.target.value)}
        className={inputClass}
      />
      <span className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={place}
          maxLength={120}
          placeholder="¿Dónde? Ej. tu ciudad o colonia"
          onChange={(e) => setPlace(e.target.value)}
          className={`flex-1 min-w-[160px] ${inputClass}`}
        />
        <input
          type="text"
          value={when}
          maxLength={120}
          placeholder="¿Para cuándo? Ej. esta semana"
          onChange={(e) => setWhen(e.target.value)}
          className={`flex-1 min-w-[160px] ${inputClass}`}
        />
      </span>
      <span className="flex flex-wrap items-center gap-4">
        <span className="text-text-muted">Criterios:</span>
        {criteria.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === criteriaId ? 'active' : 'default'}
            onClick={() => setCriteriaId(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </span>
      <Button
        size="sm"
        className="self-start"
        variant={ready ? 'accent' : 'disabled'}
        disabled={!ready}
        onClick={() => {
          onSave({ text: text.trim(), place: place.trim(), when: when.trim(), criteriaId });
          setText('');
          setPlace('');
          setWhen('');
        }}
      >
        Guardar pedido
      </Button>
    </div>
  );
}

/** Agendar: day and time, then "¿Lo agrego así?" like the agenda. Nothing reaches Google before "Sí, agregar". */
function ScheduleForm({
  result,
  status,
  onSend,
  onCancel,
}: {
  result: SearchResult;
  status: SearchRoomStatus;
  onSend: (d: { title: string; date: string; time?: string }) => void;
  onCancel: () => void;
}) {
  const [rest, setRest] = useState(result.name);
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState('');
  const [review, setReview] = useState(false);
  const title = `${SERVICE_EVENT_PREFIX} ${rest.trim()}`;
  const ready = rest.trim().length > 0 && !!date;

  if (review) {
    return (
      <div className="w-full flex flex-col gap-4 border-2 border-border p-8">
        <span>¿Lo agrego así?</span>
        <span className="text-base text-accent-bright">
          {scheduleSummary({ title, date, time: time || undefined }, todayLocal())}
        </span>
        <span className="text-text-muted">
          En el calendario «{status.calendar}»{result.address ? `, en ${result.address}` : ''}
          {result.phone ? `, tel. ${result.phone}` : ''}.
        </span>
        <span className="flex gap-8">
          <Button
            size="sm"
            variant={status.saving ? 'disabled' : 'accent'}
            disabled={status.saving}
            onClick={() => onSend({ title, date, time: time || undefined })}
          >
            Sí, agregar
          </Button>
          <Button size="sm" onClick={() => setReview(false)}>
            Corregir
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 border-2 border-border p-8">
      <span className="flex flex-wrap items-center gap-4">
        <span className="text-accent-bright">{SERVICE_EVENT_PREFIX}</span>
        <input
          type="text"
          value={rest}
          maxLength={180}
          onChange={(e) => setRest(e.target.value)}
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
      </span>
      <span className="flex flex-wrap items-center gap-4 text-text-muted">
        <label className="flex items-center gap-4">
          Día
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-4">
          Hora
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </label>
        <span>(sin hora = todo el día)</span>
      </span>
      <span className="flex gap-8">
        <Button
          size="sm"
          variant={ready ? 'default' : 'disabled'}
          disabled={!ready}
          onClick={() => setReview(true)}
        >
          Revisar antes de agregar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

function RequestWithSchedule({
  request,
  status,
  transport,
}: {
  request: SearchRequest;
  status: SearchRoomStatus;
  transport: MessageTransport;
}) {
  const [scheduling, setScheduling] = useState<string | null>(null);
  const room = DIRECTORIO_ROOM;
  const criteriaLabel =
    status.criteria.find((c) => c.id === request.criteriaId)?.label ?? request.criteriaId;
  return (
    <SearchRequestCard
      request={request}
      launcher={status.launcher}
      criteriaLabel={criteriaLabel}
      kindLabel={kindLabel}
      onLaunch={() => transport.send({ type: 'launchSearchAgent', room, id: request.id })}
      onDelete={() => transport.send({ type: 'deleteSearchRequest', room, id: request.id })}
      onMark={(resultId, mark) =>
        transport.send({ type: 'markSearchResult', room, requestId: request.id, resultId, mark })
      }
      actions={(r) =>
        scheduling === r.id ? (
          <ScheduleForm
            result={r}
            status={status}
            onCancel={() => setScheduling(null)}
            onSend={(d) => {
              transport.send({
                type: 'scheduleSearchResult',
                room,
                requestId: request.id,
                resultId: r.id,
                ...d,
              });
              setScheduling(null);
            }}
          />
        ) : (
          <Button
            size="sm"
            variant={status.calendar && !status.saving ? 'default' : 'disabled'}
            disabled={!status.calendar || status.saving}
            title={status.calendar ? undefined : 'Conecta Google (en la agenda) para agendar'}
            onClick={() => setScheduling(r.id)}
          >
            Agendar
          </Button>
        )
      }
    />
  );
}

/**
 * Directorio (features/directorio): opens from the room's furniture. New requests, the criteria sets, and each
 * request with what the search agent found, best first, with Contacté / Descartado / Agendar.
 */
export function DirectorioPanel({ transport }: { transport: MessageTransport }) {
  const { status, open } = useSyncExternalStore(directorioStore.subscribe, directorioStore.get);
  const [editing, setEditing] = useState(false);
  if (!open || !status) return null;
  const room = DIRECTORIO_ROOM;

  return (
    <Modal
      isOpen
      onClose={() => directorioStore.close()}
      title="Directorio"
      className="w-[min(820px,94vw)]"
    >
      <div className="max-h-[78vh] overflow-y-auto px-10 pb-6 flex flex-col gap-8 text-sm text-text">
        <p className="text-text-muted">
          Escribe qué necesitas y un agente de Claude Code lo busca en internet con tus criterios:
          primero el servicio oficial, luego negocios establecidos, y descarta a quien no tenga
          negocio visible.
        </p>
        {status.error && <p className="text-status-error">{status.error}</p>}

        <section className="flex flex-col gap-4">
          <div className="text-lg text-accent-bright">Nuevo pedido</div>
          <NewRequest
            criteria={status.criteria}
            onSave={(r) => transport.send({ type: 'createSearchRequest', room, ...r })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <span className="flex items-center justify-between">
            <span className="text-lg text-accent-bright">Criterios</span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? 'Cerrar' : 'Editar'}
            </Button>
          </span>
          {editing ? (
            <CriteriaEditor
              criteria={status.criteria}
              onSave={(criteria) => {
                transport.send({ type: 'saveSearchCriteria', room, criteria });
                setEditing(false);
              }}
            />
          ) : (
            <span className="text-text-muted">
              {status.criteria.map((c) => `${c.label} (${c.rules.length})`).join(' · ')}
            </span>
          )}
        </section>

        {status.saving && <span className="text-text-muted">Agregando al calendario…</span>}
        {status.requests.length === 0 ? (
          <span className="text-text-muted">Todavía no hay pedidos.</span>
        ) : (
          status.requests.map((r) => (
            <RequestWithSchedule key={r.id} request={r} status={status} transport={transport} />
          ))
        )}
      </div>
    </Modal>
  );
}
