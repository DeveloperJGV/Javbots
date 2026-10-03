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

const DAY_NIGHT_LABELS: Record<DayNightMode, string> = {
  auto: 'Auto',
  day: 'Día',
  night: 'Noche',
};

const DAY_NIGHT_TITLES: Record<DayNightMode, string> = {
  auto: 'Luz según tu hora (clic: siempre de día)',
  day: 'Siempre de día (clic: siempre de noche)',
  night: 'Siempre de noche (clic: según tu hora)',
};

function DayNightIcon({ mode }: { mode: DayNightMode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {DAY_NIGHT_ICONS[mode].map(([x, y, w]) => (
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
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
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
            onClick={handleAgentClick}
            className={
              isFolderPickerOpen || isBypassMenuOpen
                ? 'bg-accent-bright'
                : 'bg-accent hover:bg-accent-bright'
            }
          >
            + Agente
          </Button>
          <Dropdown isOpen={isBypassMenuOpen}>
            <DropdownItem onClick={() => handleBypassSelect(true)}>
              Modo sin permisos <span className="text-2xs text-warning">⚠</span>
            </DropdownItem>
          </Dropdown>
          <Dropdown isOpen={isFolderPickerOpen} className="min-w-128">
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
        onClick={onToggleEditMode}
        title="Editar la oficina"
      >
        Oficina
      </Button>
      <Button onClick={onCycleDayNight} title={DAY_NIGHT_TITLES[dayNightMode]}>
        <span className="flex items-center gap-4">
          <DayNightIcon mode={dayNightMode} />
          {DAY_NIGHT_LABELS[dayNightMode]}
        </span>
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title="Ajustes"
      >
        Ajustes
      </Button>
    </div>
  );
}
