import { useState } from 'react';

import type { SearchCriteriaSet } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';

const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';

/**
 * A room's criteria sets (features/busquedas): pick a set, edit its rules (one per line, the first weighs most), add
 * a new set, save. Nothing is sent until "Guardar criterios".
 */
export function CriteriaEditor({
  criteria,
  onSave,
}: {
  criteria: SearchCriteriaSet[];
  onSave: (sets: SearchCriteriaSet[]) => void;
}) {
  const [sets, setSets] = useState(criteria);
  const [currentId, setCurrentId] = useState(criteria[0]?.id ?? '');
  const current = sets.find((s) => s.id === currentId) ?? sets[0];
  const update = (next: Partial<SearchCriteriaSet>) =>
    setSets(sets.map((s) => (s.id === current?.id ? { ...s, ...next } : s)));

  return (
    <div className="flex flex-col gap-4">
      <span className="flex flex-wrap gap-4">
        {sets.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={s.id === current?.id ? 'active' : 'default'}
            onClick={() => setCurrentId(s.id)}
          >
            {s.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const id = `nuevo-${sets.length + 1}`;
            setSets([
              ...sets,
              { id, label: 'Nuevo tipo', rules: ['Escribe aquí el primer criterio'] },
            ]);
            setCurrentId(id);
          }}
        >
          + Tipo
        </Button>
      </span>
      {current && (
        <>
          <label className="flex items-center gap-4 text-text-muted">
            Nombre
            <input
              type="text"
              value={current.label}
              maxLength={60}
              onChange={(e) => update({ label: e.target.value })}
              className={`flex-1 ${inputClass}`}
            />
          </label>
          <span className="text-text-muted">Un criterio por línea; el de arriba pesa más.</span>
          <textarea
            value={current.rules.join('\n')}
            rows={Math.max(4, current.rules.length + 1)}
            onChange={(e) => update({ rules: e.target.value.split('\n') })}
            className={inputClass}
          />
        </>
      )}
      <span className="flex gap-8">
        <Button
          size="sm"
          variant="accent"
          onClick={() =>
            onSave(sets.map((s) => ({ ...s, rules: s.rules.map((r) => r.trim()).filter(Boolean) })))
          }
        >
          Guardar criterios
        </Button>
        <Button size="sm" onClick={() => setSets(criteria)}>
          Deshacer cambios
        </Button>
      </span>
    </div>
  );
}
