import { type RefObject, useState } from 'react';

import type {
  JardinStatus,
  JardinSupply,
  JardinSupplyCategory,
  JardinSupplyInput,
} from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { SUPPLY_LABEL, SUPPLY_NAME_MAX, SUPPLY_ORDER, SUPPLY_UNIT_MAX } from './constants.js';
import { inputClass, Review, sectionTitle, type Send } from './JardinComun.js';
import { groupSupplies, SUPPLY_MARK_TEXT, supplyMark, supplyMinText } from './jardinResumen.js';
import { supplyReview } from './jardinText.js';

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
        maxLength={SUPPLY_NAME_MAX}
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
        maxLength={SUPPLY_UNIT_MAX}
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

/** One supply in the list, with "Quitar" asking before it goes. */
function SupplyLine({
  supply: s,
  status,
  send,
  onEdit,
}: {
  supply: JardinSupply;
  status: JardinStatus;
  send: Send;
  onEdit: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const mark = supplyMark(s);
  const min = supplyMinText(s);
  return (
    <li className="flex items-center justify-between gap-8">
      <span className="text-base">
        {s.name} · {s.quantity} {s.unit}
        {min && <span className="text-text-muted"> ({min})</span>}
        {mark && <span className="text-status-error"> · {SUPPLY_MARK_TEXT[mark]}</span>}
        {s.buying && (
          <span className="text-status-permission"> · "Comprar {s.name}" en tus tareas</span>
        )}
      </span>
      <span className="flex gap-4">
        <Button size="sm" disabled={status.saving} onClick={onEdit}>
          Editar
        </Button>
        {confirm ? (
          <>
            <Button
              size="sm"
              variant="accent"
              disabled={status.saving}
              onClick={() => send({ type: 'deleteJardinSupply', id: s.id })}
            >
              Sí, quitar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              No
            </Button>
          </>
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
 * The supplies by category: a new one's form on top, and the one being edited turns into its form in its own row.
 */
export function JardinInventario({
  status,
  send,
  supplyEdit,
  setSupplyEdit,
  sectionRef,
}: {
  status: JardinStatus;
  send: Send;
  supplyEdit: { supply?: JardinSupply } | null;
  setSupplyEdit: (edit: { supply?: JardinSupply } | null) => void;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const editingId = supplyEdit?.supply?.id;
  const adding = supplyEdit !== null && !editingId;
  const form = (start?: JardinSupply) => (
    <SupplyForm
      key={start?.id ?? 'nuevo'}
      status={status}
      start={start}
      send={send}
      onDone={() => setSupplyEdit(null)}
    />
  );
  return (
    <section ref={sectionRef} className="flex flex-col gap-4">
      <span className="flex items-center justify-between">
        <span className={sectionTitle}>Inventario</span>
        {!supplyEdit && (
          <Button size="sm" onClick={() => setSupplyEdit({})}>
            Agregar
          </Button>
        )}
      </span>
      {adding && form()}
      {status.supplies.length === 0 && !supplyEdit && (
        <span className="text-text-muted">
          Plantas, herramientas, tierra, abono y macetas, con su mínimo.
        </span>
      )}
      {groupSupplies(status.supplies).map((g) => (
        <div key={g.category} className="flex flex-col gap-2">
          <span className="text-accent">
            {g.label} <span className="text-text-muted">({g.supplies.length})</span>
          </span>
          <ul className="flex flex-col gap-2">
            {g.supplies.map((s) =>
              s.id === editingId ? (
                <li key={s.id}>{form(s)}</li>
              ) : (
                <SupplyLine
                  key={s.id}
                  supply={s}
                  status={status}
                  send={send}
                  onEdit={() => setSupplyEdit({ supply: s })}
                />
              ),
            )}
          </ul>
        </div>
      ))}
      {editingId && !status.supplies.some((s) => s.id === editingId) && form(supplyEdit?.supply)}
    </section>
  );
}
