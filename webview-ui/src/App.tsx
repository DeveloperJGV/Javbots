import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgendaPanel } from '../../features/agenda/webview/AgendaPanel.js';
import { useAgenda } from '../../features/agenda/webview/useAgenda.js';
import { BodegaPanel } from '../../features/bodega/webview/BodegaPanel.js';
import { bodegaStore } from '../../features/bodega/webview/bodegaStore.js';
import { useSearchRoom } from '../../features/busquedas/webview/searchRoomStore.js';
import { ConcertsPanel } from '../../features/conciertos/webview/ConcertsPanel.js';
import { ConnectionsPanel } from '../../features/conexiones/webview/ConnectionsPanel.js';
import { useConnections } from '../../features/conexiones/webview/useConnections.js';
import { DirectorioPanel } from '../../features/directorio/webview/DirectorioPanel.js';
import { directorioStore } from '../../features/directorio/webview/directorioStore.js';
import { GithubPanel } from '../../features/github/webview/GithubPanel.js';
import { useHerdrTabs } from '../../features/herdr/webview/useHerdrTabs.js';
import { JardinPanel } from '../../features/jardin/webview/JardinPanel.js';
import { useJardin } from '../../features/jardin/webview/useJardin.js';
import { JukeboxPicker } from '../../features/musica/webview/JukeboxPicker.js';
import { LyricBubble } from '../../features/musica/webview/LyricBubble.js';
import { MusicColumn } from '../../features/musica/webview/MusicColumn.js';
import { MusicSettings } from '../../features/musica/webview/MusicSettings.js';
import { useMusic } from '../../features/musica/webview/useMusic.js';
import { UsageBar } from '../../features/usage/webview/UsageBar.js';
import { useUsage } from '../../features/usage/webview/useUsage.js';
import { toMajorMinor } from './changelogData.js';
import { ActivityBoardModal } from './components/ActivityBoardModal.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { ConnectionIndicator } from './components/ConnectionIndicator.js';
import { DebugView } from './components/DebugView.js';
import { EditActionBar } from './components/EditActionBar.js';
import { Elevator } from './components/Elevator.js';
import { IntroBubble } from './components/IntroBubble.js';
import { MigrationNotice } from './components/MigrationNotice.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Tooltip } from './components/Tooltip.js';
import { Modal } from './components/ui/Modal.js';
import { VersionIndicator } from './components/VersionIndicator.js';
import { ZoomControls } from './components/ZoomControls.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { useIntroTour } from './hooks/useIntroTour.js';
import { captureOffice, downloadBlob } from './office/capture.js';
import { captureFileName } from './office/captureFrame.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { nextDayNightMode } from './office/effects/effectsSettings.js';
import { OfficeState } from './office/engine/officeState.js';
import { exportLayoutToFile } from './office/layout/exportLayout.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from './office/layout/layoutSerializer.js';
import { getPetCount } from './office/sprites/petSpriteData.js';
import { EditTool, type OfficeLayout } from './office/types.js';
import { PackOverlays } from './packs/PackOverlays.js';
import { isBrowserRuntime, isE2E } from './runtime.js';
import { installTestHooks } from './testHooks.js';
import { transport } from './transport/index.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

// Test-only observability hooks (message/sound logs, addAgent wrapper, selectAgent).
// Installed only under the e2e harness so they never patch prototypes or grow
// unbounded logs in a real user's session.
if (isE2E) installTestHooks(officeStateRef);

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

function App() {
  // Optional feature (features/musica): what Spotify is playing, via a Spicetify extension
  const music = useMusic(transport);
  // Optional feature (features/usage): Claude plan limits and cost per agent
  const usage = useUsage(transport);
  // Optional feature (features/conexiones): listen from the start, the board is sent once when the page opens
  useConnections(transport);
  useAgenda(transport);
  // Optional feature (features/jardin): the roof garden, sent once when the page opens
  useJardin(transport);
  useSearchRoom(transport, directorioStore);
  // Optional feature (features/herdr): each character named after its herdr terminal tab
  useHerdrTabs(transport, getOfficeState());
  // Browser runtime (dev or static dist): dispatch mock messages after the
  // useExtensionMessages listener has been registered.
  useEffect(() => {
    // browserMock is for Vite dev mode only (UI prototyping without a server).
    // In standalone server mode, the server sends all state over WebSocket.
    // In VS Code mode, the extension sends all state via postMessage.
    if (isBrowserRuntime && import.meta.env.DEV) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    }
  }, []);

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    agentFolderNames,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    ghostHeadlessAgents,
    setGhostHeadlessAgents,
    hooksEnabled,
    hooksInstalled,
    hooksStatusSeq,
    hooksInfoShown,
    consentRequest,
    dismissConsentRequest,
    areaMappings,
    setAreaMappings,
    showAreas,
    setShowAreas,
    shadowsEnabled,
    setShadowsEnabled,
    particlesEnabled,
    setParticlesEnabled,
    dayNightMode,
    setDayNightMode,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [isHooksInfoOpen, setIsHooksInfoOpen] = useState(false);
  const [hooksTooltipDismissed, setHooksTooltipDismissed] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    transport.send({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    transport.send({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  // Sync alwaysShowOverlay from persisted settings
  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      transport.send({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  // Toggle "Display headless as ghosts". setGhostHeadlessAgents also updates the
  // renderer's module copy, so the office redraws on the next frame.
  const handleToggleGhostHeadlessAgents = useCallback(() => {
    const next = !ghostHeadlessAgents;
    setGhostHeadlessAgents(next);
    transport.send({ type: 'setGhostHeadlessAgents', enabled: next });
  }, [ghostHeadlessAgents, setGhostHeadlessAgents]);

  // Visual effects (Fase 2): local + renderer first, then persist on the server.
  const handleToggleShadows = useCallback(() => {
    const next = !shadowsEnabled;
    setShadowsEnabled(next);
    transport.send({ type: 'setShadowsEnabled', enabled: next });
  }, [shadowsEnabled, setShadowsEnabled]);

  const handleToggleParticles = useCallback(() => {
    const next = !particlesEnabled;
    setParticlesEnabled(next);
    transport.send({ type: 'setParticlesEnabled', enabled: next });
  }, [particlesEnabled, setParticlesEnabled]);

  const handleCycleDayNight = useCallback(() => {
    const next = nextDayNightMode(dayNightMode);
    setDayNightMode(next);
    transport.send({ type: 'setDayNightMode', mode: next });
  }, [dayNightMode, setDayNightMode]);

  const handleCapture = useCallback(() => {
    void captureOffice(getOfficeState()).then((blob) => {
      if (blob) downloadBlob(blob, captureFileName(new Date()));
      else console.warn('[Webview] Captura: no se pudo dibujar la oficina');
    });
  }, []);

  const handleSelectAgent = useCallback((id: number) => {
    transport.send({ type: 'focusAgent', id });
  }, []);

  // The Intro's wire-facing state machine — which asks survive being mooted,
  // when a hooksStatus is this tour's install verdict — lives in useIntroTour
  // (pure reducer in introTourState.ts); the App only wires it to the bubble.
  const {
    intro,
    installFailed,
    installPending,
    onChoice: handleConsentChoice,
    onClose: handleIntroClose,
  } = useIntroTour({ consentRequest, hooksInstalled, hooksStatusSeq, dismissConsentRequest });

  // The Settings surface renders one provider today; its checkbox binds to
  // the Claude row of the per-provider install-state map.
  // Any Claude Code profile's hooks (one hook provider per profile).
  const claudeHooksInstalled = Object.values(hooksInstalled).some(Boolean);

  // Mutate folder→Area mappings locally + send to server. Updates OfficeState in
  // the same tick so a follow-up agentCreated picks up the new mapping.
  const handleAreaMappingChange = useCallback(
    (folderName: string, areaLabel: string, action: 'add' | 'remove') => {
      const current = areaMappings[folderName] ?? [];
      let nextLabels: string[];
      if (action === 'add') {
        if (current.includes(areaLabel)) return;
        nextLabels = [...current, areaLabel];
      } else {
        nextLabels = current.filter((l) => l !== areaLabel);
      }
      const next = { ...areaMappings };
      if (nextLabels.length === 0) {
        delete next[folderName];
      } else {
        next[folderName] = nextLabels;
      }
      setAreaMappings(next);
      getOfficeState().setAreaMappings(next);
      transport.send({ type: 'saveAreaMappings', mappings: next });
    },
    [areaMappings, setAreaMappings],
  );

  // Toggle global Show Areas — persisted via setShowAreas message; runs server-
  // side through configPersistence.
  const onToggleShowAreas = useCallback(() => {
    const next = !showAreas;
    setShowAreas(next);
    transport.send({ type: 'setShowAreas', enabled: next });
  }, [showAreas, setShowAreas]);

  // When AREA_PAINT is active in the editor, force the overlay on even if the
  // user has toggled Show Areas off globally — they need to see what they're
  // editing. The selected area's overlay is alpha-bumped via activeAreaLabel.
  const isEditingAreas = editor.isEditMode && editorState.activeTool === EditTool.AREA_PAINT;
  const effectiveShowAreas = isEditingAreas || showAreas;
  const activeAreaLabel = isEditingAreas ? editor.selectedAreaLabel : null;

  // e2e: register the component-scoped editor-action drivers + the effective
  // show-areas gate on the test-hooks namespace (module-load installTestHooks
  // can't reach these React callbacks). Bypasses only canvas pixel→tile
  // geometry — the handlers still own undo/dirty/rebuild. Guarded on isE2E.
  useEffect(() => {
    if (!isE2E || typeof window === 'undefined') return;
    const hooks = (window.__pixelAgentsTestHooks ??= {});
    hooks.editorTileAction = (col, row) => editor.handleEditorTileAction(col, row);
    hooks.editorEraseAction = (col, row) => editor.handleEditorEraseAction(col, row);
    hooks.getShowAreas = () => effectiveShowAreas;
  }, [editor.handleEditorTileAction, editor.handleEditorEraseAction, effectiveShowAreas]);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  // Storage room (features/bodega): "Sacar" opens the editor with that piece ready to place.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  useEffect(
    () =>
      bodegaStore.onTakeOut((type) => {
        const ed = editorRef.current;
        if (!ed.isEditMode) ed.handleToggleEditMode();
        if (editorState.activeTool !== EditTool.FURNITURE_PLACE)
          ed.handleToolChange(EditTool.FURNITURE_PLACE);
        if (editorState.selectedFurnitureType !== type) ed.handleFurnitureTypeChange(type);
      }),
    [],
  );
  const getPlacedTypes = useCallback(
    () =>
      getOfficeState()
        .getLayout()
        .furniture.map((f) => f.type),
    [],
  );

  // Jukebox style menu (features/musica): swap the piece in place and save, like an editor change.
  const getFurnitureType = useCallback(
    (uid: string) =>
      getOfficeState()
        .getLayout()
        .furniture.find((f) => f.uid === uid)?.type,
    [],
  );
  const handlePickJukebox = useCallback((uid: string, type: string) => {
    const os = getOfficeState();
    const layout = os.getLayout();
    const next: OfficeLayout = {
      ...layout,
      furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, type } : f)),
    };
    os.rebuildFromLayout(next);
    editorRef.current.setLastSavedLayout(next);
    transport.send({ type: 'saveLayout', layout: next as unknown as Record<string, unknown> });
  }, []);

  const handleCloseAgent = useCallback((id: number) => {
    transport.send({ type: 'closeAgent', id });
  }, []);

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    transport.send({ type: 'focusAgent', id: focusId });
  }, []);

  const officeState = getOfficeState();

  // Merged set of folders the Areas dropdown can map: real workspace folders plus
  // every distinct folder an agent has run in this session (deduped by name; name
  // is the areaMappings key / seat-bias identity, path is only the React list key).
  const areaFolders = useMemo(() => {
    const byName = new Map<string, { name: string; path: string }>();
    for (const f of workspaceFolders) byName.set(f.name, f);
    for (const name of agentFolderNames) {
      if (!byName.has(name)) byName.set(name, { name, path: name });
    }
    return [...byName.values()];
  }, [workspaceFolders, agentFolderNames]);

  // Areas are always available: besides project areas they hold the task zones
  // (fork, Fase 3), which need no folder at all.
  const areasAvailable = true;

  const handleExportLayout = useCallback(() => {
    exportLayoutToFile(getOfficeState().getLayout());
  }, []);

  const handleImportLayout = useCallback(
    (file: File) => {
      // Browser-native import (standalone): read + validate + apply directly,
      // bypassing the layoutLoaded message whose dirty guard would skip it.
      if (
        isEditDirty() &&
        !window.confirm('¿Reemplazar la oficina actual? Se perderán los cambios sin guardar.')
      ) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(String(reader.result)) as Record<string, unknown>;
          // Match the VS Code guard, plus the furniture-array check VS Code omits
          // (migrate + rebuild iterate furniture and would throw on a non-array).
          if (
            imported.version !== 1 ||
            !Array.isArray(imported.tiles) ||
            !Array.isArray(imported.furniture)
          ) {
            window.alert('El archivo de oficina no es válido.');
            return;
          }
          const migrated = migrateLayoutColors(imported as unknown as OfficeLayout);
          getOfficeState().rebuildFromLayout(migrated);
          editor.setLastSavedLayout(migrated);
          transport.send({
            type: 'saveLayout',
            layout: migrated as unknown as Record<string, unknown>,
          });
          editor.markClean();
        } catch {
          window.alert('No se pudo leer el archivo de oficina.');
        }
      };
      reader.readAsText(file);
    },
    [isEditDirty, editor],
  );

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard;

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return <div className="w-full h-full flex items-center justify-center ">Loading...</div>;
  }

  return (
    <div className="w-full h-full flex">
      {/* The office takes what the music column leaves: the column never covers it. */}
      <div
        ref={containerRef}
        data-office-area
        className="flex-1 min-w-0 h-full relative overflow-hidden"
      >
        <OfficeCanvas
          officeState={officeState}
          onClick={handleClick}
          isEditMode={editor.isEditMode}
          editorState={editorState}
          onEditorTileAction={editor.handleEditorTileAction}
          onEditorEraseAction={editor.handleEditorEraseAction}
          onEditorSelectionChange={editor.handleEditorSelectionChange}
          onDeleteSelected={editor.handleDeleteSelected}
          onRotateSelected={editor.handleRotateSelected}
          onDragMove={editor.handleDragMove}
          editorTick={editor.editorTick}
          zoom={editor.zoom}
          onZoomChange={editor.handleZoomChange}
          panRef={editor.panRef}
          showAreas={effectiveShowAreas}
          activeAreaLabel={activeAreaLabel}
          onOpenBoard={() => setIsBoardOpen(true)}
        />

        {!isDebugMode ? (
          <>
            <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

            {/* Vignette overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'var(--vignette)' }}
            />

            {editor.isEditMode && editor.isDirty && (
              <EditActionBar editor={editor} editorState={editorState} />
            )}

            {showRotateHint && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-11 bg-accent-bright text-white text-sm py-3 px-8 rounded-none border-2 border-accent shadow-pixel pointer-events-none whitespace-nowrap"
                style={{ top: editor.isDirty ? 64 : 8 }}
              >
                Girar (R)
              </div>
            )}

            {editor.isEditMode &&
              (() => {
                const selUid = editorState.selectedFurnitureUid;
                const selColor = selUid
                  ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
                  : null;
                return (
                  <EditorToolbar
                    activeTool={editorState.activeTool}
                    selectedTileType={editorState.selectedTileType}
                    selectedFurnitureType={editorState.selectedFurnitureType}
                    selectedFurnitureUid={selUid}
                    selectedFurnitureColor={selColor}
                    floorColor={editorState.floorColor}
                    wallColor={editorState.wallColor}
                    selectedWallSet={editorState.selectedWallSet}
                    onToolChange={editor.handleToolChange}
                    onTileTypeChange={editor.handleTileTypeChange}
                    onFloorColorChange={editor.handleFloorColorChange}
                    onWallColorChange={editor.handleWallColorChange}
                    onWallSetChange={editor.handleWallSetChange}
                    onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                    pickedFurnitureColor={editorState.pickedFurnitureColor}
                    onPickedFurnitureColorChange={editor.handlePickedFurnitureColorChange}
                    onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                    loadedAssets={loadedAssets}
                    activePetTypes={officeState.getActivePetTypes()}
                    petCount={getPetCount()}
                    onPetToggle={editor.handlePetToggle}
                    carpetVariant={editor.carpetVariant}
                    carpetColor={editor.carpetColor}
                    carpetAccentColor={editor.carpetAccentColor}
                    onCarpetVariantChange={editor.handleCarpetVariantChange}
                    onCarpetColorChange={editor.handleCarpetColorChange}
                    onCarpetAccentColorChange={editor.handleCarpetAccentColorChange}
                    areas={officeState.getLayout().areas ?? []}
                    selectedAreaLabel={editor.selectedAreaLabel}
                    workspaceFolders={areaFolders}
                    areasAvailable={areasAvailable}
                    areaMappings={areaMappings}
                    onSelectArea={editor.handleSelectArea}
                    onAddArea={editor.handleAddArea}
                    onRemoveArea={editor.handleRemoveArea}
                    onRenameArea={editor.handleRenameArea}
                    onAreaColorChange={editor.handleAreaColorChange}
                    onAreaZoneKindChange={editor.handleAreaZoneKindChange}
                    onAreaMappingChange={handleAreaMappingChange}
                  />
                );
              })()}

            <ToolOverlay
              officeState={officeState}
              agents={agents}
              agentTools={agentTools}
              subagentTools={subagentTools}
              subagentCharacters={subagentCharacters}
              containerRef={containerRef}
              zoom={editor.zoom}
              panRef={editor.panRef}
              onCloseAgent={handleCloseAgent}
              alwaysShowOverlay={alwaysShowOverlay}
            />
            {/* Private packs (webview-ui/src/packs/registry.ts) */}
            <PackOverlays
              transport={transport}
              officeState={officeState}
              containerRef={containerRef}
              zoom={editor.zoom}
              panRef={editor.panRef}
            />
            <LyricBubble
              music={music}
              officeState={officeState}
              containerRef={containerRef}
              zoom={editor.zoom}
              panRef={editor.panRef}
            />
          </>
        ) : (
          <DebugView
            agents={agents}
            selectedAgent={selectedAgent}
            agentTools={agentTools}
            agentStatuses={agentStatuses}
            subagentTools={subagentTools}
            officeState={officeState}
            onSelectAgent={handleSelectAgent}
          />
        )}

        {/* Hooks first-run tooltip. Gated on hooksInstalled (the hooksStatus
          message), NOT the hooksEnabled preference: hooksEnabled defaults true
          while first-run consent is still pending, and announcing "Instant
          Detection Active" before anything is installed would be a lie. */}
        {hooksEnabled && claudeHooksInstalled && !hooksInfoShown && !hooksTooltipDismissed && (
          <Tooltip
            title="Detección instantánea activa"
            position="top-right"
            onDismiss={() => {
              setHooksTooltipDismissed(true);
              transport.send({ type: 'setHooksInfoShown' });
            }}
          >
            <span className="text-sm text-text leading-none">
              Tus agentes ahora reaccionan al instante.{' '}
              <span
                className="text-accent cursor-pointer underline"
                onClick={() => {
                  setIsHooksInfoOpen(true);
                  setHooksTooltipDismissed(true);
                  transport.send({ type: 'setHooksInfoShown' });
                }}
              >
                Ver más
              </span>
            </span>
          </Tooltip>
        )}

        {/* Hooks info modal */}
        <Modal
          isOpen={isHooksInfoOpen}
          onClose={() => setIsHooksInfoOpen(false)}
          title="La detección instantánea está activada"
          zIndex={52}
        >
          <div className="text-base text-text px-10" style={{ lineHeight: 1.4 }}>
            <p className="mb-8">Tu oficina ahora reacciona al instante:</p>
            <ul className="mb-8 pl-18 list-disc m-0">
              <li className="text-sm mb-2">Las solicitudes de permiso aparecen en cuanto llegan</li>
              <li className="text-sm mb-2">Se nota en el momento en que un agente termina</li>
              <li className="text-sm mb-2">Los sonidos de aviso suenan de inmediato</li>
            </ul>
            <p className="mb-12 text-text-muted">
              Funciona con los hooks de Claude Code: pequeños avisos que le cuentan a la oficina lo
              que pasa en tus sesiones de Claude.
            </p>
            <div className="text-center">
              <button
                onClick={() => setIsHooksInfoOpen(false)}
                className="py-4 px-20 text-lg bg-accent text-white border-2 border-accent rounded-none cursor-pointer shadow-pixel"
              >
                Entendido
              </button>
            </div>
            <p className="mt-8 text-xs text-text-muted text-center">
              Para desactivarla: Ajustes {'>'} Detección instantánea
            </p>
          </div>
        </Modal>

        <VersionIndicator
          currentVersion={extensionVersion}
          lastSeenVersion={lastSeenVersion}
          onDismiss={handleWhatsNewDismiss}
          onOpenChangelog={handleOpenChangelog}
        />

        <ConnectionIndicator />

        {/* The elevator plate top-left: buildings and floors (core/src/offices.ts) plus the office's function keys */}
        <Elevator>
          <BottomToolbar
            isEditMode={editor.isEditMode}
            onOpenClaude={editor.handleOpenClaude}
            onToggleEditMode={editor.handleToggleEditMode}
            isSettingsOpen={isSettingsOpen}
            onToggleSettings={() => setIsSettingsOpen((v) => !v)}
            workspaceFolders={workspaceFolders}
            dayNightMode={dayNightMode}
            onCycleDayNight={handleCycleDayNight}
            onCapture={handleCapture}
            isBoardOpen={isBoardOpen}
            onToggleBoard={() => setIsBoardOpen((v) => !v)}
            onZoomFit={isDebugMode ? undefined : editor.handleZoomFit}
          />
        </Elevator>

        {/* Optional feature (features/usage): Claude plan limits and cost per agent */}
        <UsageBar usage={usage} />
        {/* Optional feature (features/github): repositories as cabinets in the GitHub room */}
        <GithubPanel transport={transport} />
        {/* Optional feature (features/conciertos): upcoming concerts from the tickets on the counter */}
        <ConcertsPanel transport={transport} />
        {/* Optional feature (features/agenda): today and this week, from the agenda room's furniture */}
        <AgendaPanel transport={transport} />
        {/* Optional feature (features/jardin): the roof garden, from its control screen, shed, tool rack or plaque */}
        <JardinPanel transport={transport} />
        {/* Optional feature (features/directorio): searches by an agent with criteria, from the room's furniture */}
        <DirectorioPanel transport={transport} />
        {/* Optional feature (features/conexiones): the outside services the office talks to, from the rack */}
        <ConnectionsPanel />
        {/* Optional feature (features/bodega): every piece of furniture not in the office, with thumbnails */}
        <BodegaPanel getPlacedTypes={getPlacedTypes} />
        <JukeboxPicker getType={getFurnitureType} onPick={handlePickJukebox} />

        <ActivityBoardModal
          isOpen={isBoardOpen}
          onClose={() => setIsBoardOpen(false)}
          activity={officeState.activity}
        />

        <ChangelogModal
          isOpen={isChangelogOpen}
          onClose={() => setIsChangelogOpen(false)}
          currentVersion={extensionVersion}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={handleToggleDebugMode}
          alwaysShowOverlay={alwaysShowOverlay}
          onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
          ghostHeadlessAgents={ghostHeadlessAgents}
          onToggleGhostHeadlessAgents={handleToggleGhostHeadlessAgents}
          externalAssetDirectories={externalAssetDirectories}
          watchAllSessions={watchAllSessions}
          onToggleWatchAllSessions={() => {
            const newVal = !watchAllSessions;
            setWatchAllSessions(newVal);
            transport.send({ type: 'setWatchAllSessions', enabled: newVal });
          }}
          hooksInstalled={hooksInstalled}
          onToggleHooksEnabled={(providerId) => {
            // Toggle the DISPLAYED state (actual install), not the preference: when the two disagree — preference on,
            // nothing installed while consent is pending — toggling the preference would turn hooks OFF for a user
            // asking for ON. No optimistic local update either; both backends answer with the truthful hooksStatus this
            // checkbox renders, so it lands correct instead of flickering when an install fails. The providerId is
            // ECHOED from the row (one per hooksStatus received, never originated here).
            transport.send({
              type: 'setHooksEnabled',
              providerId,
              enabled: hooksInstalled[providerId] !== true,
            });
          }}
          showAreas={showAreas}
          onToggleShowAreas={onToggleShowAreas}
          showAreasAvailable={areasAvailable}
          shadowsEnabled={shadowsEnabled}
          onToggleShadows={handleToggleShadows}
          particlesEnabled={particlesEnabled}
          onToggleParticles={handleToggleParticles}
          onExportLayout={handleExportLayout}
          onImportLayout={handleImportLayout}
          extraSections={<MusicSettings music={music} transport={transport} />}
        />

        {showMigrationNotice && (
          <MigrationNotice onDismiss={() => setMigrationNoticeDismissed(true)} />
        )}

        {intro && (
          <IntroBubble
            officeState={officeState}
            headline={intro.headline}
            disclosure={intro.disclosure}
            containerRef={containerRef}
            zoom={editor.zoom}
            panRef={editor.panRef}
            installFailed={installFailed}
            installPending={installPending}
            onChoice={handleConsentChoice}
            onClose={handleIntroClose}
            escapeSuppressed={
              isSettingsOpen ||
              isChangelogOpen ||
              isHooksInfoOpen ||
              showMigrationNotice ||
              editor.isEditMode
            }
          />
        )}
      </div>
      <MusicColumn music={music} transport={transport} />
    </div>
  );
}

export default App;
