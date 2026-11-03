import { useEffect, useSyncExternalStore } from 'react';

import { MAIN_OFFICE } from '../../../core/src/offices.js';
import { MAIN_OFFICE_LABEL } from '../constants.js';
import { officesStore, switchOffice } from '../offices.js';
import { isBrowserRuntime } from '../runtime.js';
import { Button } from './ui/Button.js';

/**
 * Top-right switch between the offices, only when a pack adds one (core/src/offices.ts). It also keeps the
 * browser tab title on the current office. Standalone browser only: VS Code always shows the main office.
 */
export function OfficeSwitch() {
  const { current, offices, mainLabel, mainTitle } = useSyncExternalStore(
    officesStore.subscribe,
    officesStore.get,
  );
  const all = [
    { id: MAIN_OFFICE, label: mainLabel ?? MAIN_OFFICE_LABEL, title: mainTitle },
    ...offices,
  ];
  const here = all.find((o) => o.id === current);
  const title = here ? (here.title ?? here.label) : undefined;
  useEffect(() => {
    if (isBrowserRuntime && offices.length > 0 && title) document.title = title;
  }, [title, offices.length]);
  if (!isBrowserRuntime || offices.length === 0) return null;
  return (
    <div className="absolute top-8 right-8 z-44 flex gap-4" role="group" aria-label="Oficina">
      {all.map((office) => {
        const active = office.id === current;
        return (
          <Button
            key={office.id}
            size="md"
            variant={active ? 'active' : 'default'}
            aria-pressed={active}
            title={active ? `Estás en ${office.label}` : `Ir a ${office.label}`}
            onClick={() => switchOffice(office.id)}
            className={`shadow-pixel ${active ? '' : 'border-border!'}`}
          >
            {office.label}
          </Button>
        );
      })}
    </div>
  );
}
