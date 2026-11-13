import type { ReactNode } from 'react';
import { useEffect, useSyncExternalStore } from 'react';

import type { FloorInfo } from '../../../core/src/messages.js';
import {
  floorButton,
  GROUND_FLOOR,
  MAIN_OFFICE,
  sortFloorsTopDown,
} from '../../../core/src/offices.js';
import {
  ELEVATOR_ARROW_PX,
  ELEVATOR_BUTTON_FACE,
  ELEVATOR_BUTTON_RING,
  ELEVATOR_BUTTON_SHADOW,
  ELEVATOR_BUTTON_SHINE,
  ELEVATOR_BUTTON_TEXT,
  ELEVATOR_DISPLAY_BG,
  ELEVATOR_DISPLAY_DIM,
  ELEVATOR_DISPLAY_PX,
  ELEVATOR_DISPLAY_TEXT,
  ELEVATOR_ENGRAVED_SHADOW,
  ELEVATOR_ENGRAVED_TEXT,
  ELEVATOR_FLOOR_DISC_PX,
  ELEVATOR_FLOOR_GLOW_PX,
  ELEVATOR_LAMP_OFF,
  ELEVATOR_LAMP_ON,
  ELEVATOR_LED_DOT,
  ELEVATOR_LIT_FACE,
  ELEVATOR_LIT_GLOW,
  ELEVATOR_LIT_RING,
  ELEVATOR_LIT_SHINE,
  ELEVATOR_LIT_TEXT,
  ELEVATOR_PLATE_BG,
  ELEVATOR_PLATE_DARK,
  ELEVATOR_PLATE_LIGHT,
  ELEVATOR_PX,
  ELEVATOR_RIVET_FACE,
  ELEVATOR_RIVET_PX,
  ELEVATOR_RIVET_RIM,
  ELEVATOR_RIVET_SHINE,
  GROUND_FLOOR_BUTTON,
  GROUND_FLOOR_LABEL,
  MAIN_OFFICE_LABEL,
} from '../constants.js';
import { floorsOf, officesStore, switchFloor, switchOffice } from '../offices.js';
import { isBrowserRuntime } from '../runtime.js';
import type { PixelRuns } from './elevatorParts.js';
import {
  ARROW_DOWN,
  ARROW_UP,
  displayArrow,
  floorCaption,
  floorRows,
  LED_GLYPH_H,
  LED_GLYPH_W,
  ledText,
  pixelDisc,
} from './elevatorParts.js';

const GROUND: FloorInfo = {
  id: GROUND_FLOOR,
  level: 0,
  button: GROUND_FLOOR_BUTTON,
  label: GROUND_FLOOR_LABEL,
};

/** Light top/left edge, dark bottom/right edge: a pressed-steel bevel without rounded corners. */
const BEVEL: React.CSSProperties = {
  borderStyle: 'solid',
  borderWidth: ELEVATOR_PX,
  borderTopColor: ELEVATOR_PLATE_LIGHT,
  borderLeftColor: ELEVATOR_PLATE_LIGHT,
  borderBottomColor: ELEVATOR_PLATE_DARK,
  borderRightColor: ELEVATOR_PLATE_DARK,
};

/** Engraved text: light letters with a dark 1 px line under them (a drop, not a blur). */
const ENGRAVED: React.CSSProperties = {
  color: ELEVATOR_ENGRAVED_TEXT,
  textShadow: `0 1px 0 ${ELEVATOR_ENGRAVED_SHADOW}`,
};

function Runs({ runs, fill }: { runs: PixelRuns; fill: string }) {
  return (
    <>
      {runs.map(([x, y, w]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={1} fill={fill} />
      ))}
    </>
  );
}

/** A pixel sprite `w`×`h` sprite pixels, drawn at ELEVATOR_PX CSS px each. */
function Sprite({
  w,
  h,
  px = ELEVATOR_PX,
  children,
}: {
  w: number;
  h: number;
  /** CSS px per sprite pixel. */
  px?: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="block"
    >
      {children}
    </svg>
  );
}

const G = ELEVATOR_FLOOR_GLOW_PX;
const D = ELEVATOR_FLOOR_DISC_PX;
const SIZE = D + 2 * G;
const GLOW = pixelDisc(SIZE);
const SHADOW = pixelDisc(D, G + 1, G + 1);
const RING = pixelDisc(D, G, G);
const FACE = pixelDisc(D - 4, G + 2, G + 2);
/** A short highlight on the face's upper left, like light on a convex button. */
const SHINE: PixelRuns = [
  [G + 5, G + 3, 4],
  [G + 4, G + 4, 1],
  [G + 3, G + 5, 1],
];

/** A round floor button: dark ring, steel (or lit amber) face, hard shadow; the lit one gets a halo. */
function FloorDisc({ lit }: { lit: boolean }) {
  return (
    <Sprite w={SIZE} h={SIZE}>
      {lit && <Runs runs={GLOW} fill={ELEVATOR_LIT_GLOW} />}
      <Runs runs={SHADOW} fill={ELEVATOR_BUTTON_SHADOW} />
      <Runs runs={RING} fill={lit ? ELEVATOR_LIT_RING : ELEVATOR_BUTTON_RING} />
      <Runs runs={FACE} fill={lit ? ELEVATOR_LIT_FACE : ELEVATOR_BUTTON_FACE} />
      <Runs runs={SHINE} fill={lit ? ELEVATOR_LIT_SHINE : ELEVATOR_BUTTON_SHINE} />
    </Sprite>
  );
}

const RIVET_RIM = pixelDisc(ELEVATOR_RIVET_PX);
const RIVET_FACE: PixelRuns = [
  [1, 1, ELEVATOR_RIVET_PX - 2],
  [1, 2, ELEVATOR_RIVET_PX - 2],
];

function Rivet({ className }: { className: string }) {
  return (
    <span className={`absolute ${className}`}>
      <Sprite w={ELEVATOR_RIVET_PX} h={ELEVATOR_RIVET_PX}>
        <Runs runs={RIVET_RIM} fill={ELEVATOR_RIVET_RIM} />
        <Runs runs={RIVET_FACE} fill={ELEVATOR_RIVET_FACE} />
        <rect x={1} y={1} width={1} height={1} fill={ELEVATOR_RIVET_SHINE} />
      </Sprite>
    </span>
  );
}

/** ▲ over ▼ on the display: the one that says where you are glows, the other stays faint. */
function Arrows({ level }: { level: number }) {
  const arrow = displayArrow(level);
  return (
    <span className="flex flex-col gap-8" aria-hidden="true">
      <Sprite w={5} h={3} px={ELEVATOR_ARROW_PX}>
        <Runs
          runs={ARROW_UP}
          fill={arrow === 'up' ? ELEVATOR_DISPLAY_TEXT : ELEVATOR_DISPLAY_DIM}
        />
      </Sprite>
      <Sprite w={5} h={3} px={ELEVATOR_ARROW_PX}>
        <Runs
          runs={ARROW_DOWN}
          fill={arrow === 'down' ? ELEVATOR_DISPLAY_TEXT : ELEVATOR_DISPLAY_DIM}
        />
      </Sprite>
    </span>
  );
}

/**
 * A floor's button text in LED pixels (elevatorParts.ledText), in the current text color. `matrix` draws it like a
 * dot-matrix display: every dot of each letter is a small square with a gap, the unlit ones faint. Letters without
 * a glyph use the pixel font.
 */
function LedText({ text, px, matrix = false }: { text: string; px?: number; matrix?: boolean }) {
  const led = ledText(text);
  if (!led) return <>{text}</>;
  if (!matrix) {
    return (
      <Sprite w={led.w} h={LED_GLYPH_H} px={px}>
        <Runs runs={led.runs} fill="currentColor" />
      </Sprite>
    );
  }
  const on = new Set<string>();
  for (const [x, y, w] of led.runs) for (let i = 0; i < w; i++) on.add(`${x + i},${y}`);
  const dots: Array<[number, number, boolean]> = [];
  for (let x = 0; x < led.w; x++) {
    if ((x + 1) % (LED_GLYPH_W + 1) === 0) continue; // the blank column between letters
    for (let y = 0; y < LED_GLYPH_H; y++) dots.push([x, y, on.has(`${x},${y}`)]);
  }
  return (
    <Sprite w={led.w} h={LED_GLYPH_H} px={px}>
      {dots.map(([x, y, lit]) => (
        <rect
          key={`${x},${y}`}
          x={x}
          y={y}
          width={ELEVATOR_LED_DOT}
          height={ELEVATOR_LED_DOT}
          fill={lit ? 'currentColor' : ELEVATOR_DISPLAY_DIM}
        />
      ))}
    </Sprite>
  );
}

/** The engraved groove between the floors and the function buttons. */
function Groove() {
  return (
    <div className="w-full" aria-hidden="true">
      <div style={{ height: 1, background: ELEVATOR_PLATE_DARK }} />
      <div style={{ height: 1, background: ELEVATOR_PLATE_LIGHT }} />
    </div>
  );
}

/**
 * The elevator (core/src/offices.ts): a riveted steel plate top-left. On top, the buildings (only with more than
 * one office) as little lamps; then a dark LED display with the arrow and the floor you're on, its name engraved
 * under it, and the round floor buttons (top floor first, two per row, yours lit). Under a groove, `children`:
 * the office's function buttons (BottomToolbar). With a single floor there are no floor buttons, only the display.
 * Buildings and floors exist in the standalone browser only; in VS Code the plate holds just the function buttons.
 * It also keeps the browser tab title on the current office and floor.
 */
export function Elevator({ children }: { children?: ReactNode }) {
  const state = useSyncExternalStore(officesStore.subscribe, officesStore.get);
  const { current, floor, offices, mainLabel, mainTitle } = state;
  const buildings = [
    { id: MAIN_OFFICE, label: mainLabel ?? MAIN_OFFICE_LABEL, title: mainTitle },
    ...offices,
  ];
  const floors = sortFloorsTopDown([GROUND, ...floorsOf(state, current)]);
  const here = buildings.find((o) => o.id === current);
  const hereFloor = floors.find((f) => f.id === floor) ?? GROUND;
  const showBuildings = isBrowserRuntime && offices.length > 0;
  const showFloors = isBrowserRuntime;
  const rows = floorRows(floors);
  const officeTitle = here ? (here.title ?? here.label) : undefined;
  const title =
    officeTitle && hereFloor.id !== GROUND_FLOOR
      ? `${officeTitle} · ${hereFloor.label}`
      : officeTitle;
  const titled = isBrowserRuntime && (offices.length > 0 || floors.length > 1);
  useEffect(() => {
    if (titled && title) document.title = title;
  }, [title, titled]);

  return (
    <nav
      className="absolute top-8 left-8 z-44 flex flex-col items-center gap-8 px-12 pt-14 pb-12 shadow-pixel select-none"
      style={{ ...BEVEL, background: ELEVATOR_PLATE_BG }}
      aria-label="Elevador"
      data-elevator-plate
    >
      <Rivet className="top-3 left-3" />
      <Rivet className="top-3 right-3" />
      <Rivet className="bottom-3 left-3" />
      <Rivet className="bottom-3 right-3" />

      {showBuildings && (
        <div className="flex flex-col gap-2 w-full" role="group" aria-label="Edificio">
          {buildings.map((office) => {
            const lit = office.id === current;
            return (
              <button
                key={office.id}
                type="button"
                className="flex items-center gap-6 bg-transparent border-0 p-0 cursor-pointer text-xs text-left hover:brightness-125"
                style={ENGRAVED}
                aria-pressed={lit}
                aria-label={lit ? `Estás en ${office.label}` : `Ir a ${office.label}`}
                title={lit ? `Estás en ${office.label}` : `Ir a ${office.label}`}
                onClick={() => switchOffice(office.id)}
              >
                <span
                  className="shrink-0"
                  style={{
                    width: 3 * ELEVATOR_PX,
                    height: 3 * ELEVATOR_PX,
                    background: lit ? ELEVATOR_LAMP_ON : ELEVATOR_LAMP_OFF,
                    outline: `${ELEVATOR_PX / 2}px solid ${ELEVATOR_BUTTON_RING}`,
                  }}
                  aria-hidden="true"
                />
                <span className="truncate max-w-104">{office.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {showFloors && (
        <>
          <div
            className="flex items-center justify-center gap-8 w-full py-4 px-8"
            style={{
              background: ELEVATOR_DISPLAY_BG,
              borderStyle: 'solid',
              borderWidth: ELEVATOR_PX,
              borderTopColor: ELEVATOR_PLATE_DARK,
              borderLeftColor: ELEVATOR_PLATE_DARK,
              borderBottomColor: ELEVATOR_PLATE_LIGHT,
              borderRightColor: ELEVATOR_PLATE_LIGHT,
            }}
            role="status"
            aria-live="polite"
            aria-label={`Estás en ${floorCaption(hereFloor)}`}
            title={`Estás en ${floorCaption(hereFloor)}`}
          >
            <Arrows level={hereFloor.level} />
            <span
              className="flex items-center justify-center text-2xl leading-none min-w-36"
              style={{ color: ELEVATOR_DISPLAY_TEXT }}
            >
              <LedText text={floorButton(hereFloor)} px={ELEVATOR_DISPLAY_PX} matrix />
            </span>
          </div>
          <div className="text-xs leading-none text-center max-w-120 truncate" style={ENGRAVED}>
            {floorCaption(hereFloor)}
          </div>

          {rows.length > 0 && (
            <div className="flex flex-col gap-2" role="group" aria-label="Piso">
              {rows.map((row) => (
                <div key={row[0].id} className="flex gap-6 justify-center">
                  {row.map((f) => {
                    const lit = f.id === hereFloor.id;
                    const caption = floorCaption(f);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className="relative bg-transparent border-0 p-0 cursor-pointer hover:brightness-110"
                        aria-pressed={lit}
                        aria-label={lit ? `Estás en ${caption}` : `Ir a ${caption}`}
                        title={lit ? `Estás en ${caption}` : `Ir a ${caption}`}
                        onClick={() => switchFloor(f.id)}
                      >
                        <FloorDisc lit={lit} />
                        <span
                          className="absolute inset-0 flex items-center justify-center text-base leading-none"
                          style={{ color: lit ? ELEVATOR_LIT_TEXT : ELEVATOR_BUTTON_TEXT }}
                        >
                          <LedText text={floorButton(f)} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {children && <Groove />}
        </>
      )}

      {children}
    </nav>
  );
}
