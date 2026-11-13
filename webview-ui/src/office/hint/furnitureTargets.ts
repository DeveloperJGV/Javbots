import { agendaStore } from '../../../../features/agenda/webview/agendaStore.js';
import { bodegaStore } from '../../../../features/bodega/webview/bodegaStore.js';
import { concertsStore } from '../../../../features/conciertos/webview/concertsStore.js';
import { connectionsStore } from '../../../../features/conexiones/webview/connectionsStore.js';
import { decksStore } from '../../../../features/decks/webview/decksStore.js';
import { directorioStore } from '../../../../features/directorio/webview/directorioStore.js';
import { githubStore } from '../../../../features/github/webview/githubStore.js';
import { JARDIN_PANEL_SECTION } from '../../../../features/jardin/webview/constants.js';
import { jardinStore, plantOfFurniture } from '../../../../features/jardin/webview/jardinStore.js';
import { musicStore } from '../../../../features/musica/webview/musicStore.js';
// Playlist of the day (features/musica)
import { playlistStore } from '../../../../features/musica/webview/playlists/playlistStore.js';
import { ofertasStore } from '../../../../features/ofertas/webview/ofertasStore.js';
import { perfilStore } from '../../../../features/perfil/webview/perfilStore.js';
import { pomodoroStore } from '../../../../features/pomodoro/webview/pomodoroStore.js';
import { usageStore } from '../../../../features/usage/webview/usageStore.js';
import { packClick, packHint, packHover } from '../../packs/registry.js';
import type { OfficeState } from '../engine/officeState.js';
import { HINT_LABELS } from './constants.js';

/** A piece of furniture a click does something with. */
export interface FurnitureTarget {
  /** What the hover sign says; null = no sign (a pack that gave none, Isaac's secret). */
  hint: string | null;
  /** Whether the pointer turns into a hand over it (false only for the secret). */
  hand: boolean;
  /** What the click does. */
  open: () => void;
}

/** What the office itself (not a feature store) does on a click. */
export interface FurnitureTargetActions {
  /** The activity whiteboard's panel. */
  openBoard: () => void;
  /** Isaac started his dance (its music). */
  onIsaacDance: () => void;
}

const target = (hint: string | null, open: () => void): FurnitureTarget => ({
  hint,
  hand: true,
  open,
});

/**
 * The piece under a world point that a click opens something from, with its hover sign: the one path for the hand,
 * the sign and the click (OfficeCanvas), so the three can never disagree. Characters, pets and the owner are checked
 * before this by the caller. The order is the click priority when pieces overlap.
 */
export function furnitureTargetAt(
  os: OfficeState,
  worldX: number,
  worldY: number,
  actions: FurnitureTargetActions,
): FurnitureTarget | null {
  // Music player (features/musica): its menu (style, show / hide the music column).
  const playerUid = os.musicPlayerUidAt(worldX, worldY);
  if (playerUid)
    return target(HINT_LABELS.musicPlayer, () => musicStore.openJukeboxPicker(playerUid));

  // Playlist of the day (features/musica): the press and the neon open the builder, the bin its contents.
  const playlistPiece = os.playlistPieceAt(worldX, worldY);
  if (playlistPiece) {
    const bin = playlistPiece === 'bin';
    return target(bin ? HINT_LABELS.playlistBin : HINT_LABELS.playlist, () =>
      playlistStore.open(bin ? 'bote' : 'armar'),
    );
  }

  // Storage shelf (features/bodega): the stored furniture.
  if (os.isBodegaAt(worldX, worldY)) return target(HINT_LABELS.bodega, () => bodegaStore.open());

  // Concert tickets (features/conciertos): the upcoming concerts.
  if (os.isConcertTicketsAt(worldX, worldY))
    return target(HINT_LABELS.concerts, () => concertsStore.open());

  // Agenda room (features/agenda): today and this week, from the console.
  if (os.isAgendaAt(worldX, worldY)) return target(HINT_LABELS.agenda, () => agendaStore.open());

  // Roof garden (features/jardin): the control screen, the shed, or a plant's own furniture.
  const jardin = os.jardinFurnitureAt(worldX, worldY);
  if (jardin !== null) return target(jardinHint(jardin), () => jardinStore.openFor(jardin));

  // Personality screen of the freelance room (features/perfil).
  if (os.isPerfilAt(worldX, worldY)) return target(HINT_LABELS.perfil, () => perfilStore.open());

  // Pomodoro corner of the roof (features/pomodoro): the tomato timer.
  if (os.isPomodoroAt(worldX, worldY))
    return target(HINT_LABELS.pomodoro, () => pomodoroStore.open());

  // Deals kiosk (features/ofertas): search, watch and alerts.
  if (os.isOfertasAt(worldX, worldY)) return target(HINT_LABELS.ofertas, () => ofertasStore.open());

  // Deck boxes shelf (features/decks).
  if (os.isDecksAt(worldX, worldY)) return target(HINT_LABELS.decks, () => decksStore.open());

  // Directorio room (features/directorio): the front desk.
  if (os.isDirectorioAt(worldX, worldY))
    return target(HINT_LABELS.directorio, () => directorioStore.open());

  // Private packs (packs/registry.ts): their own furniture, with their own sign if they give one.
  if (packHover(worldX, worldY, os))
    return target(packHint(worldX, worldY, os), () => {
      packClick(worldX, worldY, os);
    });

  // Connections rack (features/conexiones): which outside services the office talks to.
  if (os.isConnectionsRackAt(worldX, worldY))
    return target(HINT_LABELS.connections, () => connectionsStore.open());

  // Usage meter (features/usage): the plan limits and cost per agent.
  if (os.isUsageMeterAt(worldX, worldY))
    return target(HINT_LABELS.usage, () => usageStore.setDetailOpen(true));

  // GitHub room (features/github): the detail, with the cabinet's repository first.
  const github = os.githubAt(worldX, worldY);
  if (github) return target(github.label, () => githubStore.open(github.repo));

  // Activity whiteboard.
  if (os.isBoardAt(worldX, worldY)) return target(HINT_LABELS.board, actions.openBoard);

  // Easter egg: Isaac dances after enough clicks in a row (no hand, no sign: it is a secret).
  if (os.isIsaacAt(worldX, worldY))
    return {
      hint: null,
      hand: false,
      open: () => {
        if (os.pokeIsaac() === 'dance') actions.onIsaacDance();
      },
    };

  return null;
}

/** The garden's sign: the control screen, the shed, or "Jardín: <plant name>" for a plant's furniture. */
function jardinHint(type: string): string {
  const base = type.split(':')[0];
  const section = JARDIN_PANEL_SECTION[base];
  if (section === 'hoy') return HINT_LABELS.jardinToday;
  if (section === 'inventario') return HINT_LABELS.jardinSupplies;
  const status = jardinStore.get().status;
  const id = plantOfFurniture(type, status);
  const name = status?.plants.find((p) => p.id === id)?.name;
  return name ? `${HINT_LABELS.jardinPlantPrefix}${name}` : HINT_LABELS.jardinToday;
}
