import { useEffect, useRef, useState } from 'react';

import type { DayNightMode } from '../../../core/src/messages.js';
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

/** Toolbar icons: 3 device px per icon pixel, crisp inside the 40×40 buttons. */
const TOOL_ICON_PX = 24;

function PixelIcon({ rows }: { rows: Array<[number, number, number]> }) {
  return (
    <svg
      width={TOOL_ICON_PX}
      height={TOOL_ICON_PX}
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

  // Same look as the zoom buttons (border + hard shadow); active ones keep the accent border.
  const toolClass = (active: boolean) => `shadow-pixel ${active ? '' : 'border-border!'}`;

  return (
    // One column under the zoom buttons (top-8, 3 × 40 px + gaps): out of the office's way.
    <div className="absolute top-144 left-8 z-44 flex flex-col gap-4">
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
            onClick={handleAgentClick}
            title="Nuevo agente"
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
      <Button
        variant={isEditMode ? 'active' : 'default'}
        size="icon_lg"
        onClick={onToggleEditMode}
        title="Editar la oficina"
        className={toolClass(isEditMode)}
      >
        <PixelIcon rows={OFFICE_ICON} />
      </Button>
      <Button
        size="icon_lg"
        onClick={onCycleDayNight}
        title={DAY_NIGHT_TITLES[dayNightMode]}
        className={toolClass(false)}
      >
        <PixelIcon rows={DAY_NIGHT_ICONS[dayNightMode]} />
      </Button>
      <Button
        variant={isBoardOpen ? 'active' : 'default'}
        size="icon_lg"
        onClick={onToggleBoard}
        title="Pizarrón: lo que hizo cada agente"
        className={toolClass(isBoardOpen)}
      >
        <PixelIcon rows={BOARD_ICON} />
      </Button>
      <Button
        size="icon_lg"
        onClick={onCapture}
        title="Captura: guardar una imagen de toda la oficina"
        className={toolClass(false)}
      >
        <PixelIcon rows={CAMERA_ICON} />
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        size="icon_lg"
        onClick={onToggleSettings}
        title="Ajustes"
        className={toolClass(isSettingsOpen)}
      >
        <PixelIcon rows={SETTINGS_ICON} />
      </Button>
    </div>
  );
}
