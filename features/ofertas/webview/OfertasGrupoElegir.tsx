import { useState } from 'react';

import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { GROUP_NAME_MAX } from './constants.js';
import { inputClass } from './OfertasComun.js';
import { cleanGroupName, existingGroup, sameGroup } from './ofertasGrupos.js';

/**
 * Choose a group: the ones that already exist (one click), the suggested one marked as such, "Sin grupo", or a new
 * name typed by hand. `current` looks pressed. Nothing is chosen for the person: a suggestion waits for its click.
 */
export function GrupoElegir({
  current,
  groups,
  suggestion,
  onPick,
  onCancel,
}: {
  current?: string;
  groups: readonly string[];
  suggestion?: string;
  onPick: (group: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const same = sameGroup;
  const offerSuggestion = suggestion && !groups.some((g) => same(g, suggestion));
  return (
    <div className="flex flex-col gap-4">
      <span className="flex flex-wrap items-center gap-4" role="group" aria-label="Grupos">
        {groups.map((g) => (
          <Button
            key={g}
            size="sm"
            variant={same(g, current) ? 'active' : 'default'}
            aria-pressed={same(g, current)}
            onClick={() => onPick(g)}
          >
            {g}
            {same(g, suggestion) ? ' (sugerido)' : ''}
          </Button>
        ))}
        {offerSuggestion && (
          <Button
            size="sm"
            onClick={() => onPick(suggestion)}
            title="Sugerido por el nombre del producto"
          >
            {suggestion} (sugerido, nuevo)
          </Button>
        )}
        <Button
          size="sm"
          variant={!current ? 'active' : 'default'}
          aria-pressed={!current}
          onClick={() => onPick('')}
        >
          Sin grupo
        </Button>
      </span>
      <form
        className="flex flex-wrap gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const g = cleanGroupName(text);
          if (g) {
            // "bocinas" typed with "Bocinas" there is that group, not a second one
            onPick(existingGroup(groups, g));
            setText('');
          }
        }}
      >
        <input
          className={`${inputClass} w-[220px]`}
          maxLength={GROUP_NAME_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Grupo nuevo (ej. Bocinas)"
          aria-label="Grupo nuevo"
        />
        <Button
          type="submit"
          size="sm"
          variant={cleanGroupName(text) ? 'default' : 'disabled'}
          disabled={!cleanGroupName(text)}
        >
          Crear y poner
        </Button>
        {onCancel && (
          <Button size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </form>
    </div>
  );
}
