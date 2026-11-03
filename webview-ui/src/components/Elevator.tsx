import { useEffect, useSyncExternalStore } from 'react';

import type { FloorInfo } from '../../../core/src/messages.js';
import {
  floorButton,
  GROUND_FLOOR,
  MAIN_OFFICE,
  sortFloorsTopDown,
} from '../../../core/src/offices.js';
import {
  ELEVATOR_BUTTON_BG,
  ELEVATOR_BUTTON_TEXT,
  ELEVATOR_DISPLAY_BG,
  ELEVATOR_DISPLAY_TEXT,
  ELEVATOR_LIT_BG,
  ELEVATOR_LIT_BORDER,
  ELEVATOR_LIT_TEXT,
  ELEVATOR_PLATE_BG,
  ELEVATOR_PLATE_BORDER,
  GROUND_FLOOR_BUTTON,
  GROUND_FLOOR_LABEL,
  MAIN_OFFICE_LABEL,
} from '../constants.js';
import { floorsOf, officesStore, switchFloor, switchOffice } from '../offices.js';
import { isBrowserRuntime } from '../runtime.js';

const GROUND: FloorInfo = {
  id: GROUND_FLOOR,
  level: 0,
  button: GROUND_FLOOR_BUTTON,
  label: GROUND_FLOOR_LABEL,
};

function buttonStyle(lit: boolean): React.CSSProperties {
  return lit
    ? { background: ELEVATOR_LIT_BG, borderColor: ELEVATOR_LIT_BORDER, color: ELEVATOR_LIT_TEXT }
    : {
        background: ELEVATOR_BUTTON_BG,
        borderColor: ELEVATOR_PLATE_BORDER,
        color: ELEVATOR_BUTTON_TEXT,
      };
}

/**
 * The elevator (core/src/offices.ts): a panel on the left, like the buttons inside a real one. The buildings
 * (offices) on top, then the floors of the one you're in, top floor first, the one you're on lit. A button reloads
 * the page on that office or floor. Hidden while there's a single building with a single floor (the office as it
 * always was). It also keeps the browser tab title on the current office. Standalone browser only.
 */
export function Elevator() {
  const state = useSyncExternalStore(officesStore.subscribe, officesStore.get);
  const { current, floor, offices, mainLabel, mainTitle } = state;
  const buildings = [
    { id: MAIN_OFFICE, label: mainLabel ?? MAIN_OFFICE_LABEL, title: mainTitle },
    ...offices,
  ];
  const floors = sortFloorsTopDown([GROUND, ...floorsOf(state, current)]);
  const here = buildings.find((o) => o.id === current);
  const hereFloor = floors.find((f) => f.id === floor) ?? GROUND;
  const visible = isBrowserRuntime && (offices.length > 0 || floors.length > 1);
  const officeTitle = here ? (here.title ?? here.label) : undefined;
  const title =
    officeTitle && hereFloor.id !== GROUND_FLOOR
      ? `${officeTitle} · ${hereFloor.label}`
      : officeTitle;
  useEffect(() => {
    if (visible && title) document.title = title;
  }, [title, visible]);
  if (!visible) return null;

  return (
    <nav
      className="absolute top-8 left-56 z-44 flex flex-col gap-8 p-6 border-2 shadow-pixel select-none"
      style={{ background: ELEVATOR_PLATE_BG, borderColor: ELEVATOR_PLATE_BORDER }}
      aria-label="Elevador"
    >
      {offices.length > 0 && (
        <div className="flex flex-col gap-4" role="group" aria-label="Edificio">
          {buildings.map((office) => {
            const lit = office.id === current;
            return (
              <button
                key={office.id}
                type="button"
                className={`border-2 rounded-none cursor-pointer py-1 px-8 text-sm text-left ${
                  lit ? 'bg-active-bg border-accent text-text' : 'hover:brightness-125'
                }`}
                style={lit ? undefined : buttonStyle(false)}
                aria-pressed={lit}
                title={lit ? `Estás en ${office.label}` : `Ir a ${office.label}`}
                onClick={() => switchOffice(office.id)}
              >
                {office.label}
              </button>
            );
          })}
        </div>
      )}
      <div
        className="text-center text-lg py-1 px-8 border-2"
        style={{
          background: ELEVATOR_DISPLAY_BG,
          borderColor: ELEVATOR_PLATE_BORDER,
          color: ELEVATOR_DISPLAY_TEXT,
        }}
        aria-live="polite"
        title={`Estás en ${hereFloor.label}`}
      >
        {floorButton(hereFloor)}
      </div>
      <div className="flex flex-col gap-4" role="group" aria-label="Piso">
        {floors.map((f) => {
          const lit = f.id === hereFloor.id;
          return (
            <button
              key={f.id}
              type="button"
              className="flex items-center gap-6 bg-transparent border-0 p-0 cursor-pointer text-sm text-left"
              style={{ color: ELEVATOR_BUTTON_TEXT }}
              aria-pressed={lit}
              title={lit ? `Estás en ${f.label}` : `Ir a ${f.label}`}
              onClick={() => switchFloor(f.id)}
            >
              <span
                className="inline-flex items-center justify-center w-32 h-28 border-2 shrink-0"
                style={buttonStyle(lit)}
              >
                {floorButton(f)}
              </span>
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
