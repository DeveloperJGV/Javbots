import type { ReactNode } from 'react';
import { useRef, useState, useSyncExternalStore } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { ownerStore } from '../office/owner/ownerStore.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  /** Whether headless agents (adopted, no terminal to focus) render translucent. */
  ghostHeadlessAgents: boolean;
  onToggleGhostHeadlessAgents: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  /** ACTUAL install state per hook provider (the hooksStatus messages), not the hooksEnabled
   *  preference. The preference defaults to true while first-run consent is
   *  still pending, so binding the checkbox to it renders "on" over an empty
   *  ~/.claude/settings.json. One checkbox per provider: one per Claude Code profile. */
  hooksInstalled: Record<string, boolean>;
  onToggleHooksEnabled: (providerId: string) => void;
  /** Whether the areas overlay is rendered outside of the Areas edit tool. */
  showAreas: boolean;
  onToggleShowAreas: () => void;
  /** Hide the Show Areas checkbox entirely when areas are unavailable. */
  showAreasAvailable: boolean;
  /** Drop shadows under characters, pets and furniture. */
  shadowsEnabled: boolean;
  onToggleShadows: () => void;
  /** Coffee steam, sparks at turn end, dust. */
  particlesEnabled: boolean;
  onToggleParticles: () => void;
  /** Browser-native layout export (standalone only; VS Code uses the host save dialog). */
  onExportLayout: () => void;
  /** Browser-native layout import from a chosen file (standalone only). */
  onImportLayout: (file: File) => void;
  /** Sections from optional features (e.g. features/musica), rendered at the end. */
  extraSections?: ReactNode;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  ghostHeadlessAgents,
  onToggleGhostHeadlessAgents,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksInstalled,
  onToggleHooksEnabled,
  showAreas,
  onToggleShowAreas,
  showAreasAvailable,
  shadowsEnabled,
  onToggleShadows,
  particlesEnabled,
  onToggleParticles,
  onExportLayout,
  onImportLayout,
  extraSections,
}: SettingsModalProps) {
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetDirDraft, setAssetDirDraft] = useState('');
  // The office's owner (office/owner): its switch shows only when an asset folder brings an avatar
  const owner = useSyncExternalStore(ownerStore.subscribe, ownerStore.get);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes">
      {/* Open Sessions Folder opens an OS file manager — impossible in the browser. */}
      {!isBrowserRuntime && (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'openSessionsFolder' });
            onClose();
          }}
        >
          Abrir carpeta de sesiones
        </MenuItem>
      )}
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            onExportLayout();
          } else {
            transport.send({ type: 'exportLayout' });
          }
          onClose();
        }}
      >
        Exportar oficina
      </MenuItem>
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            // Open the native file picker; the import is applied in onChange below.
            fileInputRef.current?.click();
          } else {
            transport.send({ type: 'importLayout' });
            onClose();
          }
        }}
      >
        Importar oficina
      </MenuItem>
      {isBrowserRuntime && (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset the value so re-selecting the same file fires change again.
            e.target.value = '';
            if (file) {
              onImportLayout(file);
              onClose();
            }
          }}
        />
      )}
      {/* Browser has no native directory picker, so accept a typed absolute path. */}
      {isBrowserRuntime ? (
        <div className="flex items-center gap-4 py-4 px-10">
          <input
            type="text"
            value={assetDirDraft}
            placeholder="Ruta completa de la carpeta de pixeles"
            onChange={(e) => setAssetDirDraft(e.target.value)}
            className="flex-1 min-w-0 text-xs py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              const path = assetDirDraft.trim();
              if (!path) return;
              transport.send({ type: 'addExternalAssetDirectory', path });
              setAssetDirDraft('');
            }}
            className="shrink-0"
          >
            Agregar
          </Button>
        </div>
      ) : (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'addExternalAssetDirectory' });
            onClose();
          }}
        >
          Agregar carpeta de pixeles
        </MenuItem>
      )}
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => transport.send({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
          >
            x
          </Button>
        </div>
      ))}
      <Checkbox
        label="Sonidos de aviso"
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label="Ver todas las sesiones"
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      {hooksProviderIds(hooksInstalled).map((providerId) => (
        <Checkbox
          key={providerId}
          label={hooksLabel(providerId)}
          checked={hooksInstalled[providerId] === true}
          onChange={() => onToggleHooksEnabled(providerId)}
        />
      ))}
      <Checkbox
        label="Mostrar siempre las etiquetas"
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      {/* Headless agents are the office's only terminal-less citizens in VS Code.
          Standalone has no terminals at all, so nothing there would ever ghost. */}
      {!isBrowserRuntime && (
        <Checkbox
          label="Mostrar agentes sin terminal como fantasmas"
          checked={ghostHeadlessAgents}
          onChange={onToggleGhostHeadlessAgents}
        />
      )}
      {showAreasAvailable && (
        <Checkbox label="Mostrar áreas" checked={showAreas} onChange={onToggleShowAreas} />
      )}
      <Checkbox label="Sombras" checked={shadowsEnabled} onChange={onToggleShadows} />
      {owner.sheet !== undefined && (
        <Checkbox
          label="Mi personaje en la oficina"
          checked={owner.enabled}
          onChange={() => {
            const next = !owner.enabled;
            ownerStore.setEnabled(next);
            transport.send({ type: 'setOwnerEnabled', enabled: next });
          }}
        />
      )}
      <Checkbox
        label="Partículas (vapor, chispas, polvo)"
        checked={particlesEnabled}
        onChange={onToggleParticles}
      />
      <Checkbox label="Vista de depuración" checked={isDebugMode} onChange={onToggleDebugMode} />
      {extraSections}
    </Modal>
  );
}

const HOOKS_LABEL = 'Detección instantánea (hooks)';
/** Hook provider ids of the Claude Code profiles: `claude` (default) and `claude-<name>`. */
const CLAUDE_PROFILE_PREFIX = 'claude-';

/** The default profile first, then the rest alphabetically. */
function hooksProviderIds(hooksInstalled: Record<string, boolean>): string[] {
  return Object.keys(hooksInstalled).sort((a, b) =>
    a === 'claude' ? -1 : b === 'claude' ? 1 : a.localeCompare(b),
  );
}

/** "Detección instantánea (hooks)" for the default profile, "… · estudio" for `claude-estudio`. */
function hooksLabel(providerId: string): string {
  return providerId.startsWith(CLAUDE_PROFILE_PREFIX)
    ? `${HOOKS_LABEL} · ${providerId.slice(CLAUDE_PROFILE_PREFIX.length)}`
    : HOOKS_LABEL;
}
