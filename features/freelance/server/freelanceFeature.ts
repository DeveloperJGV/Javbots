import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  ConnectionInfo,
  FreelanceStatus,
  SearchRoomStatus,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { createCriteriaStore } from '../../busquedas/server/criteria.js';
import { type AgentLauncher, createHerdrLauncher } from '../../busquedas/server/herdrLauncher.js';
import { createSearchRoom } from '../../busquedas/server/searchRoom.js';
import { freelanceBrief } from './brief.js';
import {
  CLAUDE_CONNECTION,
  CONNECTION_FEATURE,
  FREELANCE_CONFIG_FILE,
  FREELANCE_DIR,
  FREELANCE_KINDS,
  FREELANCE_MIN_RECOMMENDED,
  FREELANCE_ROOM,
  FREELANCE_TAB_LABEL,
  HERDR_CONNECTION,
} from './constants.js';
import { FREELANCE_DEFAULT_CRITERIA } from './defaults.js';
import { createFreelanceConfig, offerToWire } from './offer.js';

export interface FreelanceFeatureOptions {
  /**
   * Opens the search agent. Default: herdr, starting Claude Code with freelance.json's "modelo". `false` = none (the
   * panel only copies the brief).
   */
  launcher?: AgentLauncher | false;
  /** The room's skill (features/freelance/skill/SKILL.md, copied to dist/freelance/skill/). */
  skillFile: string;
  /** ~/.pixel-agents by default. */
  home?: string;
  now?: () => number;
  pollMs?: number;
}

/**
 * The Freelance room (features/freelance), the "hacker den" of the personal floor: the owner keeps what he offers
 * (services, technologies, rate…), writes what he is looking for ("proyectos de apps Android, remoto, 500 USD o más"),
 * and a Claude Code agent reads public job pages with his offer and criteria and leaves what it found in a file; the
 * panel shows it sorted, with Postulé / Descartado. On features/busquedas, like the Directorio. Privileged pages only.
 */
export function createFreelanceFeature(opts: FreelanceFeatureOptions): ServerFeature & {
  room: ReturnType<typeof createSearchRoom>;
  connections(): ConnectionInfo[];
} {
  const home = opts.home ?? path.join(os.homedir(), '.pixel-agents');
  const configFile = path.join(home, FREELANCE_CONFIG_FILE);
  const config = createFreelanceConfig(configFile);
  const clients = new Set<FeatureClient>();
  let checkedAt: number | undefined;
  const now = opts.now ?? Date.now;

  const launcher =
    opts.launcher === false
      ? undefined
      : (opts.launcher ?? createHerdrLauncher(undefined, undefined, { model: config.readModel }));

  const readSkill = (): string => {
    try {
      return fs.readFileSync(opts.skillFile, 'utf8');
    } catch {
      return '(No encontré la skill de Freelance: usa la oferta y los criterios de arriba.)';
    }
  };

  const room = createSearchRoom({
    room: FREELANCE_ROOM,
    label: FREELANCE_TAB_LABEL,
    dir: path.join(home, FREELANCE_DIR),
    criteria: createCriteriaStore(configFile, FREELANCE_DEFAULT_CRITERIA),
    kinds: FREELANCE_KINDS,
    minRecommended: FREELANCE_MIN_RECOMMENDED,
    brief: (req, set, paths) => freelanceBrief(req, set, paths, config.readOffer(), readSkill()),
    launcher,
    now: opts.now,
    pollMs: opts.pollMs,
  });

  function roomStatus(): SearchRoomStatus {
    return { type: 'searchRoomStatus', ...room.statusParts(), saving: false };
  }
  function offerStatus(): FreelanceStatus {
    const { offer, isExample } = config.readOffer();
    return {
      type: 'freelanceStatus',
      offer: offerToWire(offer),
      offerIsExample: isExample,
      model: config.readModel(),
    };
  }
  const sendAll = (msg: SearchRoomStatus | FreelanceStatus) => {
    for (const c of clients) c.send(msg as unknown as Record<string, unknown>);
  };
  const offRoom = room.onChange(() => sendAll(roomStatus()));

  async function refreshLauncher(): Promise<void> {
    await room.refreshLauncher();
    checkedAt = now();
  }

  return {
    name: FREELANCE_ROOM,
    room,

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      if (!client.privileged) return false;
      if (msg.type === 'webviewReady') {
        client.send(roomStatus() as unknown as Record<string, unknown>);
        client.send(offerStatus() as unknown as Record<string, unknown>);
        void refreshLauncher();
        return false; // the core handler still runs
      }
      if (msg.type === 'saveFreelanceOffer') {
        if (config.saveOffer(msg.offer)) sendAll(offerStatus());
        return true;
      }
      if (msg.room !== FREELANCE_ROOM) return false;
      if (msg.type === 'launchSearchAgent') void refreshLauncher();
      return room.handleMessage(msg);
    },

    /** For the connections board (features/conexiones): herdr opens the agent, Claude Code searches. */
    connections(): ConnectionInfo[] {
      const { launcher: state } = room.statusParts();
      const model = config.readModel();
      const asked = checkedAt !== undefined;
      const herdr: ConnectionInfo = {
        ...HERDR_CONNECTION,
        feature: CONNECTION_FEATURE,
        state: !launcher ? 'off' : state.available ? 'ok' : asked ? 'warn' : 'off',
        detail: !launcher
          ? 'Esta oficina no abre terminales: se copia el encargo'
          : state.available
            ? 'Listo para abrir la pestaña "Freelance"'
            : asked
              ? (state.detail ?? 'herdr no respondió')
              : 'Aún no se ha preguntado',
      };
      if (state.available && checkedAt) herdr.lastUsedAt = new Date(checkedAt).toISOString();
      const claude: ConnectionInfo = {
        ...CLAUDE_CONNECTION,
        feature: CONNECTION_FEATURE,
        state: launcher && state.available ? 'ok' : 'off',
        detail: `Modelo: ${model || 'el de fábrica de la máquina'}`,
      };
      return [herdr, claude];
    },

    dispose() {
      offRoom();
      room.dispose();
    },
  };
}
