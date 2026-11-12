import { useEffect, useId, useRef, useState } from 'react';

import type {
  JardinCareKind,
  JardinPlant,
  JardinPlantInput,
  JardinStatus,
} from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { CARE_LABEL, CARE_ORDER, PLANT_NOTES_MAX, PLANT_TEXT_MAX } from './constants.js';
import { inputClass, Review, sectionTitle, type Send } from './JardinComun.js';
import {
  type CareDraft,
  type CareStart,
  type CareWhen,
  formCares,
  startFields,
  startProblem,
  startsMessage,
} from './jardinCuidados.js';
import { filterPlants, placeCounts, shortPlace } from './jardinFichas.js';
import { JardinFotos } from './JardinFotos.js';
import {
  careRhythm,
  dayLabel,
  daysBetween,
  isThirsty,
  lateText,
  photoUrl,
  plantReview,
  reminderDay,
} from './jardinText.js';

const WHEN_OPTIONS: ReadonlyArray<{ when: Exclude<CareWhen, ''>; label: string }> = [
  { when: 'hoy', label: 'Toca hoy' },
  { when: 'hecho', label: 'Ya se hizo el día' },
  { when: 'hasta', label: 'Toca hasta el día' },
];

/** The three answers for when a care is due: today, already done on a day, or not until a day. */
function CareWhenPicker({
  kind,
  draft,
  today,
  onChange,
}: {
  kind: JardinCareKind;
  draft: CareDraft;
  today: string;
  onChange: (start: CareStart) => void;
}) {
  const name = `${useId()}-${kind}`;
  const { start } = draft;
  const problem = startProblem(start, draft.orig, today);
  return (
    <span
      role="radiogroup"
      aria-label={`Cuándo toca ${CARE_LABEL[kind].toLowerCase()}`}
      className="flex flex-wrap items-center gap-4 pl-[94px]"
    >
      <span className={problem === 'falta' ? 'text-status-error' : 'text-text-muted'}>
        {draft.orig ? 'Cuándo toca:' : '¿Cuándo toca la primera vez?'}
      </span>
      {WHEN_OPTIONS.map((o) => (
        <label key={o.when} className="flex items-center gap-4">
          <input
            type="radio"
            name={name}
            checked={start.when === o.when}
            onChange={() => onChange({ ...start, when: o.when })}
          />
          {o.label}
          {o.when === 'hecho' && (
            <input
              type="date"
              aria-label={`${CARE_LABEL[kind]}: ya se hizo el día`}
              className={inputClass}
              value={start.last}
              max={today}
              onChange={(e) => onChange({ ...start, when: 'hecho', last: e.target.value })}
            />
          )}
          {o.when === 'hasta' && (
            <input
              type="date"
              aria-label={`${CARE_LABEL[kind]}: toca hasta el día`}
              className={inputClass}
              value={start.first}
              min={start.first && start.first === draft.orig?.first ? undefined : today}
              onChange={(e) => onChange({ ...start, when: 'hasta', first: e.target.value })}
            />
          )}
        </label>
      ))}
    </span>
  );
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
  const id = start && 'id' in start ? start.id : undefined;
  const [cares, setCares] = useState(() => formCares(start, status));
  const [review, setReview] = useState<JardinPlantInput | null>(null);
  // The form opens where the plant's card was: bring it into view.
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const draft = (): JardinPlantInput | null => {
    if (!name.trim()) return null;
    const list: JardinPlantInput['cares'] = [];
    for (const k of CARE_ORDER) {
      const c = cares[k];
      if (!c.on) continue;
      const n = Number(c.everyDays);
      if (!Number.isInteger(n) || n < 1 || n > 365) return null;
      if (startProblem(c.start, c.orig, status.today)) return null;
      list.push({
        kind: k,
        everyDays: n,
        time: c.time || status.defaultTime,
        ...startFields(c.start, c.orig, status.today),
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
  const missing = startsMessage(
    CARE_ORDER.filter((k) => cares[k].on).map((k) => ({ kind: k, ...cares[k] })),
    status.today,
  );
  const set = (k: JardinCareKind, v: Partial<CareDraft>) =>
    setCares((c) => ({ ...c, [k]: { ...c[k], ...v } }));
  return (
    <div ref={box} className="flex flex-col gap-4 border-2 border-border p-8">
      <span className="flex flex-wrap gap-4">
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Nombre (ej. Monstera)"
          value={name}
          maxLength={PLANT_TEXT_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Especie (opcional)"
          value={species}
          maxLength={PLANT_TEXT_MAX}
          onChange={(e) => setSpecies(e.target.value)}
        />
        <input
          className={`flex-1 min-w-[160px] ${inputClass}`}
          placeholder="Lugar (ej. maceta azul)"
          value={place}
          maxLength={PLANT_TEXT_MAX}
          onChange={(e) => setPlace(e.target.value)}
        />
      </span>
      <span className="flex flex-col gap-1">
        <textarea
          className={inputClass}
          rows={8}
          placeholder="Notas (opcional)"
          value={notes}
          maxLength={PLANT_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
        />
        <span className="self-end text-xs text-text-muted">
          {notes.length} de {PLANT_NOTES_MAX}
        </span>
      </span>
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
          <span key={k} className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-4">
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
                </>
              )}
            </span>
            {cares[k].on && (
              <CareWhenPicker
                kind={k}
                draft={cares[k]}
                today={status.today}
                onChange={(start) => set(k, { start })}
              />
            )}
          </span>
        ))}
      </div>
      {missing && <span className="text-status-error">{missing}</span>}
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

/** A plant's card. Closed: photo, name, species, short place. Open: everything, with the photo gallery. */
function PlantCard({
  plant,
  status,
  focus,
  open,
  onToggle,
  onEdit,
  send,
}: {
  plant: JardinPlant;
  status: JardinStatus;
  focus: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  send: Send;
}) {
  const [confirm, setConfirm] = useState(false);
  const photo = plant.photos[plant.photos.length - 1];
  const short = plant.place ? shortPlace(plant.place) : null;
  const bodyId = `jardin-planta-${plant.id}`;
  return (
    <li className={`flex flex-col border-2 ${focus ? 'border-accent' : 'border-border'}`}>
      <button
        className="flex gap-8 p-6 text-left items-center cursor-pointer bg-transparent hover:bg-btn-hover"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        {photo ? (
          <img
            src={photoUrl(photo, officeToken())}
            alt=""
            loading="lazy"
            className="w-[48px] h-[48px] object-cover shrink-0"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <span className="w-[48px] h-[48px] shrink-0 flex items-center justify-center bg-bg-dark text-text-muted text-xs">
            sin foto
          </span>
        )}
        <span className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-base">
            {plant.name}
            {plant.species && <span className="text-text-muted"> · {plant.species}</span>}
            {isThirsty(plant, status.today) && (
              <span className="text-status-error"> · sedienta</span>
            )}
          </span>
          <span className="text-text-muted">
            {short ?? 'Sin lugar'}
            {plant.cares.length === 0 && (
              <span className="text-xs"> · sin cuidados programados</span>
            )}
          </span>
        </span>
        <span className="text-text-muted shrink-0" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-4 px-6 pb-6">
          {plant.place && plant.place !== short && (
            <span className="text-text-muted">{plant.place}</span>
          )}
          {plant.cares.map((c) => (
            <span key={c.kind} className="text-text-muted">
              {careRhythm(c)} ·{' '}
              {c.due < status.today
                ? lateText(daysBetween(c.due, status.today))
                : `próximo: ${dayLabel(reminderDay(c, status.today), status.today).toLowerCase()}`}
              {!c.synced && status.connected && ' · sin aviso en Google todavía'}
            </span>
          ))}
          {plant.notes && (
            <span className="text-text-muted italic whitespace-pre-wrap">{plant.notes}</span>
          )}
          <JardinFotos
            photos={plant.photos}
            name={plant.name}
            saving={status.saving}
            onRemove={(photo) => send({ type: 'removeJardinPhoto', plantId: plant.id, photo })}
          />
          <span className="flex gap-8">
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
          {confirm && plant.photos.length > 0 && (
            <span className="text-text-muted">
              Sus fotos no se borran: se guardan en la carpeta "Ya no están".
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** What the plant form is open on: nothing yet (new), a plant, or a plant coming from the phone. */
export interface PlantEditing {
  plant?: JardinPlant | JardinPlantInput;
  fromInbox?: string;
}

const formKey = (editing: PlantEditing) =>
  `${editing.fromInbox ?? ''}${editing.plant && 'id' in editing.plant ? editing.plant.id : 'nueva'}`;

/**
 * The plants: a search box and place buttons, then the cards (closed but the focused one, which comes first).
 * Editing a plant turns its card into the form; a new plant's form stays on top.
 */
export function JardinPlantas({
  status,
  focus,
  send,
  editing,
  setEditing,
}: {
  status: JardinStatus;
  focus?: string;
  send: Send;
  editing: PlantEditing | null;
  setEditing: (editing: PlantEditing | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus] : []));
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    if (focus) setOpen((o) => new Set(o).add(focus));
  }
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const total = status.plants.length;
  const plants = [...status.plants].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  // The plant being edited (its card turns into the form); a new one, or one already gone, edits on top.
  const wantedId = editing?.plant?.id;
  const editingId = wantedId && status.plants.some((p) => p.id === wantedId) ? wantedId : undefined;
  const pass = new Set(filterPlants(plants, query, place).map((p) => p.id));
  const shown = plants.filter((p) => pass.has(p.id) || p.id === editingId);
  const places = placeCounts(status.plants);
  if (place !== null && !places.some((p) => p.place === place)) places.push({ place, count: 0 });
  const filtering = query.trim() !== '' || place !== null;
  const clear = () => {
    setQuery('');
    setPlace(null);
  };

  return (
    <section className="flex flex-col gap-4">
      <span className="flex items-center justify-between">
        <span className={sectionTitle}>
          Plantas ({filtering ? `${shown.length} de ${total}` : total})
        </span>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({})}>
            Agregar planta
          </Button>
        )}
      </span>
      {editing && !editingId && (
        <PlantForm
          key={formKey(editing)}
          status={status}
          start={editing.plant}
          fromInbox={editing.fromInbox}
          send={send}
          onDone={() => setEditing(null)}
        />
      )}
      {total === 0 && !editing && <span className="text-text-muted">Todavía no hay plantas.</span>}
      {total > 1 && (
        <div className="flex flex-col gap-4">
          <input
            type="search"
            className={inputClass}
            placeholder="Buscar en nombre, especie, lugar o notas"
            aria-label="Buscar plantas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
          <span className="flex flex-wrap gap-4">
            <Button
              size="sm"
              variant={place === null ? 'active' : 'default'}
              aria-pressed={place === null}
              onClick={() => setPlace(null)}
            >
              Todos {total}
            </Button>
            {places.map((p) => (
              <Button
                key={p.place}
                size="sm"
                variant={place === p.place ? 'active' : 'default'}
                aria-pressed={place === p.place}
                onClick={() => setPlace(place === p.place ? null : p.place)}
              >
                {p.place} {p.count}
              </Button>
            ))}
          </span>
        </div>
      )}
      {total > 0 && shown.length === 0 && (
        <span className="flex flex-wrap items-center gap-8 text-text-muted">
          {query.trim()
            ? `Ninguna planta coincide con «${query.trim()}»${place ? ` en ${place}` : ''}.`
            : 'No hay plantas en ese lugar.'}
          <Button size="sm" variant="ghost" onClick={clear}>
            Quitar filtros
          </Button>
        </span>
      )}
      <ul className="flex flex-col gap-4">
        {shown.map((p) =>
          editing && p.id === editingId ? (
            <li key={p.id}>
              <PlantForm
                key={formKey(editing)}
                status={status}
                start={editing.plant}
                fromInbox={editing.fromInbox}
                send={send}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <PlantCard
              key={p.id}
              plant={p}
              status={status}
              focus={p.id === focus}
              open={open.has(p.id)}
              onToggle={() => toggle(p.id)}
              send={send}
              onEdit={() => setEditing({ plant: p })}
            />
          ),
        )}
      </ul>
    </section>
  );
}
