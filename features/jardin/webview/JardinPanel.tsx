import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type {
  JardinCareKind,
  JardinInboxItem,
  JardinPlant,
  JardinPlantInput,
  JardinStatus,
  JardinSupply,
  JardinSupplyCategory,
  JardinSupplyInput,
} from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import {
  CARE_DEFAULT_DAYS,
  CARE_LABEL,
  CARE_ORDER,
  SUPPLY_LABEL,
  SUPPLY_ORDER,
} from './constants.js';
import { jardinStore } from './jardinStore.js';
import {
  careRhythm,
  dayLabel,
  daysBetween,
  isThirsty,
  lateText,
  photoUrl,
  plantReview,
  reminderDay,
  supplyReview,
  todayCares,
  upcomingCares,
} from './jardinText.js';

const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';
const sectionTitle = 'text-lg text-accent-bright';
const STATE_COLOR: Record<string, string> = {
  ok: 'text-status-success',
  warn: 'text-status-permission',
  off: 'text-status-error',
  idea: 'text-status-active',
};

type Send = (msg: Record<string, unknown>) => void;

/** Write, check, confirm: what goes to Google is shown before anything is saved. */
function Review({
  lines,
  busy,
  onYes,
  onBack,
  yes,
}: {
  lines: string[];
  busy: boolean;
  onYes: () => void;
  onBack: () => void;
  yes: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-8">
      <span>¿Lo agrego así?</span>
      {lines.length === 0 ? (
        <span className="text-text-muted">No se agrega nada a Google.</span>
      ) : (
        <ul className="flex flex-col gap-2 text-accent-bright">
          {lines.map((l) => (
            <li key={l}>· {l}</li>
          ))}
        </ul>
      )}
      <span className="flex gap-8">
        <Button size="sm" variant={busy ? 'disabled' : 'accent'} disabled={busy} onClick={onYes}>
          {yes}
        </Button>
        <Button size="sm" onClick={onBack}>
          Corregir
        </Button>
      </span>
    </div>
  );
}

interface CareDraft {
  on: boolean;
  everyDays: string;
  time: string;
  last: string;
}

function blankCares(defaultTime: string): Record<JardinCareKind, CareDraft> {
  return Object.fromEntries(
    CARE_ORDER.map((k) => [
      k,
      { on: k === 'regar', everyDays: String(CARE_DEFAULT_DAYS[k]), time: defaultTime, last: '' },
    ]),
  ) as Record<JardinCareKind, CareDraft>;
}

/** Add or edit a plant: name, species, place, notes, its furniture on the roof and its cares. */
function PlantForm({
  status,
  start,
  fromInbox,
  send,
  onDone,
}: {
  status: JardinStatus;
  start?: JardinPlant | JardinPlantInput;
  fromInbox?: string;
  send: Send;
  onDone: () => void;
}) {
  const [name, setName] = useState(start?.name ?? '');
  const [species, setSpecies] = useState(start?.species ?? '');
  const [place, setPlace] = useState(start?.place ?? '');
  const [notes, setNotes] = useState(start?.notes ?? '');
  const [furniture, setFurniture] = useState(start?.furniture ?? '');
  const [cares, setCares] = useState(() => {
    const out = blankCares(status.defaultTime);
    if (start) {
      for (const k of CARE_ORDER) out[k].on = false;
      for (const c of start.cares)
        out[c.kind] = {
          on: true,
          everyDays: String(c.everyDays),
          time: c.time ?? status.defaultTime,
          last: c.last ?? '',
        };
    }
    return out;
  });
  const [review, setReview] = useState<JardinPlantInput | null>(null);
  const id = start && 'id' in start ? start.id : undefined;

  const draft = (): JardinPlantInput | null => {
    if (!name.trim()) return null;
    const list: JardinPlantInput['cares'] = [];
    for (const k of CARE_ORDER) {
      const c = cares[k];
      if (!c.on) continue;
      const n = Number(c.everyDays);
      if (!Number.isInteger(n) || n < 1 || n > 365) return null;
      list.push({
        kind: k,
        everyDays: n,
        time: c.time || status.defaultTime,
        ...(c.last ? { last: c.last } : {}),
      });
    }
    return {
      ...(id ? { id } : {}),
      name: name.trim(),
      ...(species.trim() ? { species: species.trim() } : {}),
      ...(place.trim() ? { place: place.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(furniture.trim() ? { furniture: furniture.trim() } : {}),
      cares: list,
    };
  };

  if (review)
    return (
      <Review
        lines={plantReview(review, status)}
        busy={status.saving}
        yes="Sí, guardar"
        onBack={() => setReview(null)}
        onYes={() => {
          send({ type: 'saveJardinPlant', plant: review, ...(fromInbox ? { fromInbox } : {}) });
          onDone();
        }}
      />
    );

  const ready = draft();
  const set = (k: JardinCareKind, v: Partial<CareDraft>) =>
    setCares((c) => ({ ...c, [k]: { ...c[k], ...v } }));
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-8">
      <span className="flex flex-wrap gap-4">
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Nombre (ej. Monstera)"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Especie (opcional)"
          value={species}
          maxLength={80}
          onChange={(e) => setSpecies(e.target.value)}
        />
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Lugar (ej. maceta azul)"
          value={place}
          maxLength={80}
          onChange={(e) => setPlace(e.target.value)}
        />
      </span>
      <textarea
        className={inputClass}
        rows={2}
        placeholder="Notas (opcional)"
        value={notes}
        maxLength={1000}
        onChange={(e) => setNotes(e.target.value)}
      />
      <label className="flex flex-wrap items-center gap-4 text-text-muted">
        Su mueble en la azotea (tipo, opcional; se ve sedienta si se atrasa el riego)
        <input
          className={`min-w-[180px] ${inputClass}`}
          placeholder="ej. JARDIN_MONSTERA"
          value={furniture}
          maxLength={60}
          onChange={(e) => setFurniture(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-2">
        {CARE_ORDER.map((k) => (
          <span key={k} className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-4 w-[90px]">
              <input
                type="checkbox"
                checked={cares[k].on}
                onChange={(e) => set(k, { on: e.target.checked })}
              />
              {CARE_LABEL[k]}
            </label>
            {cares[k].on && (
              <>
                <span className="text-text-muted">cada</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className={`w-[64px] ${inputClass}`}
                  value={cares[k].everyDays}
                  onChange={(e) => set(k, { everyDays: e.target.value })}
                />
                <span className="text-text-muted">días, aviso a las</span>
                <input
                  type="time"
                  className={inputClass}
                  value={cares[k].time}
                  onChange={(e) => set(k, { time: e.target.value })}
                />
                <span className="text-text-muted">última vez</span>
                <input
                  type="date"
                  className={inputClass}
                  value={cares[k].last}
                  max={status.today}
                  onChange={(e) => set(k, { last: e.target.value })}
                />
              </>
            )}
          </span>
        ))}
      </div>
      <span className="flex gap-8">
        <Button
          size="sm"
          variant={ready ? 'default' : 'disabled'}
          disabled={!ready}
          onClick={() => ready && setReview(ready)}
        >
          Revisar antes de guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

function SupplyForm({
  status,
  start,
  send,
  onDone,
}: {
  status: JardinStatus;
  start?: JardinSupply;
  send: Send;
  onDone: () => void;
}) {
  const [name, setName] = useState(start?.name ?? '');
  const [category, setCategory] = useState<JardinSupplyCategory>(start?.category ?? 'tierra');
  const [quantity, setQuantity] = useState(String(start?.quantity ?? 1));
  const [unit, setUnit] = useState(start?.unit ?? 'bolsa');
  const [min, setMin] = useState(String(start?.min ?? 1));
  const [review, setReview] = useState<JardinSupplyInput | null>(null);
  const draft = (): JardinSupplyInput | null => {
    const q = Number(quantity);
    const m = Number(min);
    if (!name.trim() || !Number.isFinite(q) || !Number.isFinite(m) || q < 0 || m < 0) return null;
    return {
      ...(start ? { id: start.id } : {}),
      name: name.trim(),
      category,
      quantity: q,
      unit: unit.trim() || 'pza',
      min: m,
    };
  };
  if (review)
    return (
      <Review
        lines={supplyReview(review, status)}
        busy={status.saving}
        yes="Sí, guardar"
        onBack={() => setReview(null)}
        onYes={() => {
          send({ type: 'saveJardinSupply', supply: review });
          onDone();
        }}
      />
    );
  const ready = draft();
  return (
    <div className="flex flex-wrap items-center gap-4 border-2 border-border p-8">
      <input
        className={`min-w-[140px] ${inputClass}`}
        placeholder="Qué (ej. tierra)"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className={inputClass}
        value={category}
        onChange={(e) => setCategory(e.target.value as JardinSupplyCategory)}
      >
        {SUPPLY_ORDER.map((c) => (
          <option key={c} value={c}>
            {SUPPLY_LABEL[c]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step="any"
        className={`w-[70px] ${inputClass}`}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <input
        className={`w-[80px] ${inputClass}`}
        placeholder="unidad"
        value={unit}
        maxLength={20}
        onChange={(e) => setUnit(e.target.value)}
      />
      <span className="text-text-muted">mínimo</span>
      <input
        type="number"
        min={0}
        step="any"
        className={`w-[70px] ${inputClass}`}
        value={min}
        onChange={(e) => setMin(e.target.value)}
      />
      <Button
        size="sm"
        variant={ready ? 'default' : 'disabled'}
        disabled={!ready}
        onClick={() => ready && setReview(ready)}
      >
        Revisar
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </div>
  );
}

/** One thing from the phone: a note or a photo the office couldn't place, sorted with a click. */
function InboxLine({
  item,
  status,
  send,
  onNewPlant,
}: {
  item: JardinInboxItem;
  status: JardinStatus;
  send: Send;
  onNewPlant: (item: JardinInboxItem) => void;
}) {
  const [plantId, setPlantId] = useState(status.plants[0]?.id ?? '');
  const plant = status.plants.find((p) => p.id === plantId);
  const [kind, setKind] = useState<JardinCareKind>('regar');
  const careKinds = plant?.cares.map((c) => c.kind) ?? [];
  const resolve = (action: string, extra: Record<string, unknown> = {}) =>
    send({ type: 'resolveJardinInbox', id: item.id, action, ...extra });
  return (
    <li className="flex flex-col gap-2 border-l-2 border-border pl-6">
      <span className="flex items-start gap-8">
        {item.photo && (
          <img
            src={photoUrl(item.photo, officeToken())}
            alt=""
            className="w-[56px] h-[56px] object-cover"
            style={{ imageRendering: 'auto' }}
          />
        )}
        <span className="flex flex-col">
          <span className="text-base">{item.text ?? item.name}</span>
          <span className="text-text-muted">
            {item.source === 'drive' ? 'Del celular' : 'De la compu'} · {item.why}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-4">
        {item.newPlant ? (
          <Button
            size="sm"
            variant="accent"
            disabled={status.saving}
            onClick={() => onNewPlant(item)}
          >
            Revisar y agregar planta
          </Button>
        ) : status.plants.length > 0 ? (
          <>
            <select
              className={inputClass}
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
            >
              {status.plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {item.kind === 'photo' ? (
              <Button
                size="sm"
                disabled={status.saving}
                onClick={() => resolve('photo', { plantId })}
              >
                Es de esta planta
              </Button>
            ) : (
              <>
                <select
                  className={inputClass}
                  value={careKinds.includes(kind) ? kind : careKinds[0]}
                  onChange={(e) => setKind(e.target.value as JardinCareKind)}
                >
                  {careKinds.map((k) => (
                    <option key={k} value={k}>
                      {CARE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={status.saving || careKinds.length === 0}
                  onClick={() =>
                    resolve('care', {
                      plantId,
                      kind: careKinds.includes(kind) ? kind : careKinds[0],
                    })
                  }
                >
                  Ya se hizo
                </Button>
              </>
            )}
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={status.saving}
          onClick={() => resolve('discard')}
        >
          Descartar
        </Button>
      </span>
    </li>
  );
}

function PlantCard({
  plant,
  status,
  focus,
  onEdit,
  send,
}: {
  plant: JardinPlant;
  status: JardinStatus;
  focus: boolean;
  onEdit: () => void;
  send: Send;
}) {
  const [confirm, setConfirm] = useState(false);
  const photo = plant.photos[plant.photos.length - 1];
  return (
    <li className={`flex gap-8 p-6 border-2 ${focus ? 'border-accent' : 'border-border'}`}>
      {photo ? (
        <img
          src={photoUrl(photo, officeToken())}
          alt=""
          className="w-[72px] h-[72px] object-cover shrink-0"
          style={{ imageRendering: 'auto' }}
        />
      ) : (
        <span className="w-[72px] h-[72px] shrink-0 flex items-center justify-center bg-bg-dark text-text-muted text-xs">
          sin foto
        </span>
      )}
      <span className="flex flex-col gap-1 flex-1">
        <span className="text-base">
          {plant.name}
          {plant.species && <span className="text-text-muted"> · {plant.species}</span>}
          {isThirsty(plant, status.today) && <span className="text-status-error"> · sedienta</span>}
        </span>
        {plant.place && <span className="text-text-muted">{plant.place}</span>}
        {plant.cares.map((c) => (
          <span key={c.kind} className="text-text-muted">
            {careRhythm(c)} ·{' '}
            {c.due < status.today
              ? lateText(daysBetween(c.due, status.today))
              : `próximo: ${dayLabel(reminderDay(c, status.today), status.today).toLowerCase()}`}
            {!c.synced && status.connected && ' · sin aviso en Google todavía'}
          </span>
        ))}
        {plant.notes && <span className="text-text-muted italic">{plant.notes}</span>}
      </span>
      <span className="flex flex-col gap-2">
        <Button size="sm" disabled={status.saving} onClick={onEdit}>
          Editar
        </Button>
        {confirm ? (
          <Button
            size="sm"
            variant="accent"
            disabled={status.saving}
            onClick={() => send({ type: 'deleteJardinPlant', id: plant.id })}
          >
            Sí, quitar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Quitar
          </Button>
        )}
      </span>
    </li>
  );
}

/**
 * The roof garden's panel (features/jardin): today's care with "Hecho", the plants with their photos, the supplies,
 * what came from the phone, and the state of the links with Google. Opens from the roof's control pieces.
 */
export function JardinPanel({ transport }: { transport: MessageTransport }) {
  const { status, open, focus, section } = useSyncExternalStore(
    jardinStore.subscribe,
    jardinStore.get,
  );
  const [editing, setEditing] = useState<{
    plant?: JardinPlant | JardinPlantInput;
    fromInbox?: string;
  } | null>(null);
  const [supplyEdit, setSupplyEdit] = useState<{ supply?: JardinSupply } | null>(null);
  const supplies = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && section === 'inventario') supplies.current?.scrollIntoView({ block: 'start' });
  }, [open, section]);
  if (!open || !status) return null;
  const send: Send = (msg) => transport.send(msg as never);
  const token = officeToken();
  const loginHref = token ? `/api/google/login?token=${encodeURIComponent(token)}` : null;
  const today = todayCares(status);
  const soon = upcomingCares(status);
  const plants = [...status.plants].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  const problems = status.checks.filter((c) => c.state !== 'ok');

  return (
    <Modal
      isOpen
      onClose={() => jardinStore.close()}
      title="Jardín de la azotea"
      className="w-[min(820px,94vw)]"
    >
      <div className="max-h-[75vh] overflow-y-auto px-10 pb-6 flex flex-col gap-10 text-sm text-text">
        {status.error && <p className="text-status-error">{status.error}</p>}

        <section className="flex flex-col gap-4">
          <div className={sectionTitle}>Hoy en el jardín</div>
          {today.length === 0 ? (
            <span className="text-text-muted">Nada pendiente hoy.</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {today.map(({ plant, care, late }) => (
                <li
                  key={`${plant.id}:${care.kind}`}
                  className="flex items-center justify-between gap-8"
                >
                  <span className="text-base">
                    {CARE_LABEL[care.kind]} <span className="text-accent-bright">{plant.name}</span>
                    <span className={late > 0 ? 'text-status-error' : 'text-text-muted'}>
                      {' '}
                      · {lateText(late)}
                    </span>
                    <span className="text-text-muted"> · {care.time}</span>
                  </span>
                  <Button
                    size="sm"
                    variant={status.saving ? 'disabled' : 'default'}
                    disabled={status.saving}
                    onClick={() =>
                      send({ type: 'markJardinCare', plantId: plant.id, kind: care.kind })
                    }
                  >
                    Hecho
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {soon.length > 0 && (
            <span className="text-text-muted">
              Después:{' '}
              {soon
                .map(
                  ({ plant, care }) =>
                    `${CARE_LABEL[care.kind].toLowerCase()} ${plant.name} (${dayLabel(care.due, status.today).toLowerCase()})`,
                )
                .join(', ')}
            </span>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className={sectionTitle}>Conexión</div>
          <ul className="flex flex-col gap-2">
            {status.checks.map((c) => (
              <li key={c.id} className="flex flex-col">
                <span>
                  <span className={STATE_COLOR[c.state] ?? ''}>● </span>
                  {c.label}: <span className="text-text-muted">{c.detail}</span>
                </span>
                {c.help && <span className="text-text-muted pl-12">{c.help}</span>}
              </li>
            ))}
          </ul>
          {!status.connected &&
            (loginHref ? (
              <a
                className="text-accent-bright underline self-start"
                href={loginHref}
                target="_blank"
                rel="noreferrer"
              >
                Conectar con Google
              </a>
            ) : (
              <span className="text-text-muted">
                Abre la oficina con su enlace con token para conectar Google.
              </span>
            ))}
          {problems.length === 0 && status.syncedAt && (
            <span className="text-text-muted">
              Al día con Google (
              {new Date(status.syncedAt).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              ).
            </span>
          )}
        </section>

        {status.inbox.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className={sectionTitle}>Del celular ({status.inbox.length})</div>
            <ul className="flex flex-col gap-6">
              {status.inbox.map((i) => (
                <InboxLine
                  key={i.id}
                  item={i}
                  status={status}
                  send={send}
                  onNewPlant={(item) => setEditing({ plant: item.newPlant, fromInbox: item.id })}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <span className="flex items-center justify-between">
            <span className={sectionTitle}>Plantas ({status.plants.length})</span>
            {!editing && (
              <Button size="sm" onClick={() => setEditing({})}>
                Agregar planta
              </Button>
            )}
          </span>
          {editing && (
            <PlantForm
              key={`${editing.fromInbox ?? ''}${editing.plant && 'id' in editing.plant ? editing.plant.id : 'nueva'}`}
              status={status}
              start={editing.plant}
              fromInbox={editing.fromInbox}
              send={send}
              onDone={() => setEditing(null)}
            />
          )}
          {plants.length === 0 && !editing && (
            <span className="text-text-muted">Todavía no hay plantas.</span>
          )}
          <ul className="flex flex-col gap-4">
            {plants.map((p) => (
              <PlantCard
                key={p.id}
                plant={p}
                status={status}
                focus={p.id === focus}
                send={send}
                onEdit={() => setEditing({ plant: p })}
              />
            ))}
          </ul>
        </section>

        <section ref={supplies} className="flex flex-col gap-4">
          <span className="flex items-center justify-between">
            <span className={sectionTitle}>Inventario</span>
            {!supplyEdit && (
              <Button size="sm" onClick={() => setSupplyEdit({})}>
                Agregar
              </Button>
            )}
          </span>
          {supplyEdit && (
            <SupplyForm
              key={supplyEdit.supply?.id ?? 'nuevo'}
              status={status}
              start={supplyEdit.supply}
              send={send}
              onDone={() => setSupplyEdit(null)}
            />
          )}
          {status.supplies.length === 0 && !supplyEdit && (
            <span className="text-text-muted">
              Plantas, herramientas, tierra, abono y macetas, con su mínimo.
            </span>
          )}
          <ul className="flex flex-col gap-2">
            {status.supplies.map((s) => {
              const low = s.quantity < s.min;
              return (
                <li key={s.id} className="flex items-center justify-between gap-8">
                  <span className="text-base">
                    {s.name} <span className="text-text-muted">· {SUPPLY_LABEL[s.category]}</span> ·{' '}
                    {s.quantity} {s.unit}
                    <span className="text-text-muted"> (mínimo {s.min})</span>
                    {low && <span className="text-status-error"> · falta</span>}
                    {s.buying && (
                      <span className="text-status-permission">
                        {' '}
                        · "Comprar {s.name}" en tus tareas
                      </span>
                    )}
                  </span>
                  <span className="flex gap-4">
                    <Button
                      size="sm"
                      disabled={status.saving}
                      onClick={() => setSupplyEdit({ supply: s })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={status.saving}
                      onClick={() => send({ type: 'deleteJardinSupply', id: s.id })}
                    >
                      Quitar
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {status.recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className={sectionTitle}>Lo último que hizo la oficina</div>
            <ul className="flex flex-col gap-1 text-text-muted">
              {status.recent.slice(0, 6).map((r) => (
                <li key={`${r.at}${r.text}`}>
                  {new Date(r.at).toLocaleString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {r.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <span className="flex gap-12 text-xs text-text-muted">
          {status.saving && <span>Guardando…</span>}
          <button className="underline" onClick={() => send({ type: 'refreshJardin' })}>
            Sincronizar ahora
          </button>
        </span>
      </div>
    </Modal>
  );
}
