import { useEffect, useRef, useState } from 'react';

import type { DayNightMode } from '../../../core/src/messages.js';
import {
  ELEVATOR_KEY_ACTIVE_FACE,
  ELEVATOR_KEY_ACTIVE_ICON,
  ELEVATOR_KEY_FACE,
  ELEVATOR_KEY_ICON,
  ELEVATOR_KEY_ICON_PX,
  ELEVATOR_KEY_SIZE_PX,
  ELEVATOR_PLATE_DARK,
  ELEVATOR_PLATE_LIGHT,
  ELEVATOR_PX,
} from '../constants.js';
import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  workspaceFolders: WorkspaceFolder[];
  dayNightMode: DayNightMode;
  onCycleDayNight: () => void;
  onCapture: () => void;
  isBoardOpen: boolean;
  onToggleBoard: () => void;
  /** Fit the whole office to the window; no button when missing (debug view: no office drawn). */
  onZoomFit?: () => void;
}

/** 8×8 pixel icons, one rect per row run, drawn in the button's text color. */
const DAY_NIGHT_ICONS: Record<DayNightMode, Array<[number, number, number]>> = {
  // [x, y, width] — sun
  day: [
    [3, 0, 2],
    [0, 3, 1],
    [7, 3, 1],
    [2, 2, 4],
    [2, 3, 4],
    [2, 4, 4],
    [2, 5, 4],
    [3, 7, 2],
    [1, 1, 1],
    [6, 1, 1],
    [1, 6, 1],
    [6, 6, 1],
  ],
  // crescent moon
  night: [
    [2, 0, 3],
    [1, 1, 2],
    [0, 2, 2],
    [0, 3, 2],
    [0, 4, 2],
    [0, 5, 2],
    [1, 6, 2],
    [2, 7, 4],
    [5, 6, 2],
  ],
  // clock
  auto: [
    [2, 0, 4],
    [1, 1, 1],
    [6, 1, 1],
    [0, 2, 1],
    [7, 2, 1],
    [0, 3, 1],
    [3, 2, 1],
    [3, 3, 1],
    [3, 4, 3],
    [7, 3, 1],
    [0, 4, 1],
    [7, 4, 1],
    [0, 5, 1],
    [7, 5, 1],
    [1, 6, 1],
    [6, 6, 1],
    [2, 7, 4],
  ],
};

const DAY_NIGHT_TITLES: Record<DayNightMode, string> = {
  auto: 'Luz según tu hora (clic: siempre de día)',
  day: 'Siempre de día (clic: siempre de noche)',
  night: 'Siempre de noche (clic: según tu hora)',
};

/** 8×8 camera, same drawing scheme as the day/night icons. */
const CAMERA_ICON: Array<[number, number, number]> = [
  [2, 1, 2],
  [0, 2, 8],
  [0, 3, 2],
  [6, 3, 2],
  [0, 4, 1],
  [3, 4, 2],
  [7, 4, 1],
  [0, 5, 2],
  [6, 5, 2],
  [0, 6, 8],
];

/** 8×8 icon from text art ('#' = pixel) into the same [x, y, width] runs. */
function iconFromArt(art: readonly string[]): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  art.forEach((line, y) => {
    for (const m of line.matchAll(/#+/g)) runs.push([m.index, y, m[0].length]);
  });
  return runs;
}

/** Office tower with windows and a door (opens the layout editor). */
const OFFICE_ICON = iconFromArt([
  '.######.',
  '.#.##.#.',
  '.######.',
  '.#.##.#.',
  '.######.',
  '.#.##.#.',
  '.##..##.',
  '########',
]);

/** Whiteboard on its stand, with marker lines (opens the activity board). */
const BOARD_ICON = iconFromArt([
  '########',
  '#......#',
  '#.###..#',
  '#......#',
  '#.####.#',
  '#......#',
  '########',
  '.#....#.',
]);

const SETTINGS_ICON = iconFromArt([
  '...##...',
  '.#.##.#.',
  '..####..',
  '###..###',
  '###..###',
  '..####..',
  '.#.##.#.',
  '...##...',
]);

/** Four corners pointing out (fit the whole office to the window). */
const FIT_ICON = iconFromArt([
  '###..###',
  '#......#',
  '#......#',
  '........',
  '........',
  '#......#',
  '#......#',
  '###..###',
]);

const AGENT_ICON = iconFromArt([
  '..####..',
  '..####..',
  '..####..',
  '...##...',
  '.######.',
  '########',
  '########',
  '########',
]);

function PixelIcon({ rows }: { rows: Array<[number, number, number]> }) {
  return (
    <svg
      width={ELEVATOR_KEY_ICON_PX}
      height={ELEVATOR_KEY_ICON_PX}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.map(([x, y, w]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}

interface KeyProps {
  label: string;
  /** Tooltip; the label when missing. */
  title?: string;
  /** An open tool (editor, board, settings): dark face, amber icon, and aria-pressed. */
  active?: boolean;
  /** Toggles report aria-pressed; one-shot buttons (capture, fit) don't. */
  toggle?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** A square steel key of the elevator plate, raised (light top/left, dark bottom/right) or pressed when active. */
function Key({ label, title, active = false, toggle = false, onClick, children }: KeyProps) {
  const light = active ? ELEVATOR_PLATE_DARK : ELEVATOR_PLATE_LIGHT;
  const dark = active ? ELEVATOR_PLATE_LIGHT : ELEVATOR_PLATE_DARK;
  return (
    <button
      type="button"
      className="flex items-center justify-center p-0 rounded-none cursor-pointer shadow-pixel hover:brightness-125"
      style={{
        width: ELEVATOR_KEY_SIZE_PX,
        height: ELEVATOR_KEY_SIZE_PX,
        background: active ? ELEVATOR_KEY_ACTIVE_FACE : ELEVATOR_KEY_FACE,
        color: active ? ELEVATOR_KEY_ACTIVE_ICON : ELEVATOR_KEY_ICON,
        borderStyle: 'solid',
        borderWidth: ELEVATOR_PX,
        borderTopColor: light,
        borderLeftColor: light,
        borderBottomColor: dark,
        borderRightColor: dark,
      }}
      aria-label={label}
      aria-pressed={toggle ? active : undefined}
      title={title ?? label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The office's function buttons, as square keys on the elevator plate (Elevator.tsx): new agent (VS Code only),
 * layout editor, day/night, activity board, capture, fit to window and settings. Three per row.
 */
export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  workspaceFolders,
  dayNightMode,
  onCycleDayNight,
  onCapture,
  isBoardOpen,
  onToggleBoard,
  onZoomFit,
}: BottomToolbarProps) {
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);
  // Close folder picker / bypass menu on outside click
  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(true);
    }
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(false);
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    transport.send({ type: 'launchAgent', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      transport.send({ type: 'launchAgent', bypassPermissions });
    }
  };

  return (
    // Inside the elevator plate, under its groove: three keys per row.
    <div className="grid grid-cols-1 gap-6">
      {/* Hide + Agent in standalone browser mode (no terminal to interact with) */}
      {!isBrowserRuntime && (
        <div
          ref={folderPickerRef}
          className="relative"
          onMouseEnter={handleAgentHover}
          onMouseLeave={handleAgentLeave}
        >
          <Button
            variant="accent"
            size="icon_lg"
            style={{ width: ELEVATOR_KEY_SIZE_PX, height: ELEVATOR_KEY_SIZE_PX }}
            onClick={handleAgentClick}
            title="Nuevo agente"
            aria-label="Nuevo agente"
            className={`shadow-pixel ${
              isFolderPickerOpen || isBypassMenuOpen
                ? 'bg-accent-bright'
                : 'bg-accent hover:bg-accent-bright'
            }`}
          >
            <PixelIcon rows={AGENT_ICON} />
          </Button>
          <Dropdown isOpen={isBypassMenuOpen} direction="right">
            <DropdownItem onClick={() => handleBypassSelect(true)}>
              Modo sin permisos <span className="text-2xs text-warning">⚠</span>
            </DropdownItem>
          </Dropdown>
          <Dropdown isOpen={isFolderPickerOpen} direction="right" className="min-w-128">
            {workspaceFolders.map((folder) => (
              <DropdownItem
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                className="text-base"
              >
                {folder.name}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      )}
      <Key label="Editar la oficina" active={isEditMode} toggle onClick={onToggleEditMode}>
        <PixelIcon rows={OFFICE_ICON} />
      </Key>
      <Key label="Día y noche" title={DAY_NIGHT_TITLES[dayNightMode]} onClick={onCycleDayNight}>
        <PixelIcon rows={DAY_NIGHT_ICONS[dayNightMode]} />
      </Key>
      <Key
        label="Pizarrón"
        title="Pizarrón: lo que hizo cada agente"
        active={isBoardOpen}
        toggle
        onClick={onToggleBoard}
      >
        <PixelIcon rows={BOARD_ICON} />
      </Key>
      <Key
        label="Captura"
        title="Captura: guardar una imagen de toda la oficina"
        onClick={onCapture}
      >
        <PixelIcon rows={CAMERA_ICON} />
      </Key>
      {onZoomFit && (
        <Key
          label="Ver toda la oficina"
          title="Ver toda la oficina (ajustar a la ventana)"
          onClick={onZoomFit}
        >
          <PixelIcon rows={FIT_ICON} />
        </Key>
      )}
      <Key label="Ajustes" active={isSettingsOpen} toggle onClick={onToggleSettings}>
        <PixelIcon rows={SETTINGS_ICON} />
      </Key>
    </div>
  );
}
