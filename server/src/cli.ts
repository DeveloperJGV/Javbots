#!/usr/bin/env node

/**
 * Standalone CLI entry point: `npx pixel-agents`
 *
 * Starts the Fastify server in standalone mode with SPA serving and WebSocket.
 * Loads all assets (PNGs -> SpriteData) on startup and caches in memory.
 * Each connecting WebSocket client receives the full state on webviewReady.
 */

import * as path from 'path';

import { createConcertsFeature } from '../../features/conciertos/server/concertsFeature.js';
import { createConnectionsFeature } from '../../features/conexiones/server/connectionsFeature.js';
import { createGithubFeature } from '../../features/github/server/githubFeature.js';
import { createHerdrFeature } from '../../features/herdr/server/herdrFeature.js';
import { createMusicFeature } from '../../features/musica/server/musicFeature.js';
import { runUsageCommand } from '../../features/usage/server/usageCommand.js';
import { createUsageFeature } from '../../features/usage/server/usageFeature.js';
import { AgentRuntime } from './agentRuntime.js';
import { AgentStateStore } from './agentStateStore.js';
import {
  buildAssetCache,
  loadAllCharacters,
  loadAllFurniture,
  loadAllPets,
} from './assetReload.js';
import type { AssetCache, ReloadAssetsSideEffect } from './clientMessageHandler.js';
import {
  getHooksConsent,
  getHooksEnabled,
  grantHooksConsent,
  readConfig,
} from './configPersistence.js';
import { MAX_PORT, MIN_PORT } from './constants.js';
import { FileStateAdapter } from './fileStateAdapter.js';
import { setOffices } from './officeRegistry.js';
import { loadPacks } from './packLoader.js';
import { PACK_SERVERS } from './packs.generated.js';
import {
  claudeHooksEnabled,
  claudeProvider,
  copyHookScript,
  hookProviderById,
  hookProviders,
  isClaudeProfileProvider,
} from './providers/index.js';
import { PixelAgentsServer } from './server.js';
import type { ServerFeature } from './serverFeature.js';

// ── Argument parsing ──────────────────────────────────────────

export interface CliArgs {
  /** Unset -> ephemeral (OS-assigned) port, so multiple standalone instances
   *  can run at once without a collision. --port picks a fixed one. */
  port?: number;
  host: string;
}

/** Thrown by parseArgs on an invalid --port. Kept separate from process.exit so
 *  the parsing logic stays a pure, unit-testable function -- main() is the only
 *  place that turns a bad argument into an exit code. */
export class CliArgsError extends Error {}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        throw new CliArgsError(
          `Missing value for ${argv[i]}: expected an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
        throw new CliArgsError(
          `Invalid --port "${raw}": must be an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      args.port = parsed;
      i++;
    } else if (argv[i] === '--host' && argv[i + 1]) {
      args.host = argv[i + 1];
      i++;
    } else if (argv[i] === '--help') {
      console.log(`Usage: pixel-agents [options]

Options:
  --port, -p <number>   Port to listen on (default: OS-assigned ephemeral port)
  --host <string>       Host to bind to (default: 127.0.0.1)
  --help                Show this help message`);
      process.exit(0);
    }
  }
  return args;
}

// ── Hooks consent ─────────────────────────────────────────────
// First-run consent is asked IN THE APP, not here: the server sends a
// hooksConsentRequest to privileged (tokened) connections during the
// webviewReady handshake (clientMessageHandler.ts), and the browser renders
// the dialog — the same UX the VS Code webview shows. The CLI itself never
// prompts; a headless run just starts without hooks until consent is granted
// through the UI. The one exception that needs no dialog is the silent-grant
// migration below (our hooks already installed by a pre-consent version).

/**
 * Copy the bundled hook script into ~/.pixel-agents/hooks/, reporting failure.
 *
 * Callers run this BEFORE installing the settings.json entries and abort when
 * it returns false: an entry whose command points at a missing script makes
 * Claude Code spawn a dead `node` process for every event, which is strictly
 * worse than no hooks at all.
 */
function copyHookScriptOrReport(packageRoot: string, context = ''): boolean {
  if (copyHookScript(packageRoot)) return true;
  console.error(`[Pixel Agents] Hooks NOT installed${context}: hook script missing.`);
  return false;
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // dist/ contains both the CLI bundle and the assets/ + webview/ directories
  const distRoot = __dirname;
  const packageRoot = path.dirname(distRoot);
  const staticDir = path.join(distRoot, 'webview');

  // ── Load assets on startup (same pipeline as VS Code extension) ──
  // External asset directories are merged at startup too, so directories added
  // in a previous session survive a restart. buildAssetCache is the shared
  // loader used by both the standalone server and the VS Code adapter.
  // Private packs (privado/<name>/, copied to dist/packs/): extra offices, their layouts and art.
  const packs = loadPacks(distRoot);
  setOffices(packs.offices, packs.mainOffice);
  const assetDirs = (): string[] => [...packs.assetDirs, ...readConfig().externalAssetDirectories];
  console.log('[Pixel Agents] Loading assets...');
  const assetCache: AssetCache = await buildAssetCache(distRoot, assetDirs());
  assetCache.officeLayouts = packs.officeLayouts;
  const charCount = assetCache.characters?.characters.length ?? 0;
  const petCount = assetCache.pets?.pets.length ?? 0;
  const furnitureCount = assetCache.furniture?.catalog.length ?? 0;
  console.log(
    `[Pixel Agents] Assets loaded: ${charCount} characters, ${petCount} pets, ${furnitureCount} furniture items`,
  );

  // ── Store + adapter (shared settings + standalone-scoped agents/seats) ──
  const store = new AgentStateStore();
  const adapter = new FileStateAdapter({ namespace: 'standalone' });
  store.setAdapter(adapter);

  // ── Create server ──
  const server = new PixelAgentsServer();

  try {
    // Create runtime first (before server.start, so we can pass it in)
    const runtime = new AgentRuntime(store, claudeProvider);

    // Wire hook events: HTTP POST -> runtime -> hookEventHandler -> agents
    // Optional feature: each character named after its herdr terminal tab (features/herdr).
    const herdr = createHerdrFeature({ agents: () => store.entries() });

    server.onHookEvent((providerId, event) => {
      herdr.noteHookEvent(event);
      runtime.handleHookEvent(providerId, event);
    });

    // onSetHooksEnabled side effect: install/uninstall the named provider's
    // hooks when the user toggles in the UI (or answers the consent ask).
    // Captures config from the outer scope after server.start().
    let currentConfig: { port: number; token: string } | null = null;
    const onSetHooksEnabled = async (providerId: string, enabled: boolean): Promise<void> => {
      if (!currentConfig) return;
      const provider = hookProviderById(providerId);
      if (!provider) return; // unknown id: nothing to install into
      if (enabled) {
        // An explicit toggle in the UI IS the consent to modify the
        // provider's settings file. The bundled claude-hook.js script belongs
        // to the Claude provider alone; another provider's install must
        // neither copy it nor be blocked by it.
        grantHooksConsent(provider.id);
        if (
          isClaudeProfileProvider(provider) &&
          !copyHookScriptOrReport(packageRoot, ' (user toggle)')
        ) {
          return;
        }
        try {
          await provider.installHooks(
            `http://127.0.0.1:${currentConfig.port}`,
            currentConfig.token,
          );
        } catch (err) {
          console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        console.log('[Pixel Agents] Hooks installed (user toggle)');
      } else {
        try {
          await provider.uninstallHooks();
          console.log('[Pixel Agents] Hooks uninstalled (user toggle)');
        } catch (err) {
          console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    // onReloadAssets side effect: re-run the shared loaders (bundled + external
    // dirs) after an external-asset-directory change, then re-broadcast the
    // updated sprites to the requesting client. Mutates the assetCache object in
    // place so already-open sockets (which captured the same reference) and
    // future webviewReady handshakes both observe the new assets. Only
    // characters/pets/furniture can come from external dirs, so only those three
    // are reloaded and re-sent (mirrors the VS Code reload path).
    const onReloadAssets: ReloadAssetsSideEffect = async (send): Promise<void> => {
      const externalDirs = assetDirs();
      const [characters, pets, furniture] = await Promise.all([
        loadAllCharacters(distRoot, externalDirs),
        loadAllPets(distRoot, externalDirs),
        loadAllFurniture(distRoot, externalDirs),
      ]);
      assetCache.characters = characters;
      assetCache.pets = pets;
      assetCache.furniture = furniture;
      if (characters) {
        send({ type: 'characterSpritesLoaded', characters: characters.characters });
      }
      if (pets) {
        send({
          type: 'petSpritesLoaded',
          pets: pets.pets,
          petNames: pets.manifests.map((m) => m.name),
          petLightColors: pets.manifests.map((m) => m.lightColor ?? ''),
        });
      }
      if (furniture) {
        send({
          type: 'furnitureAssetsLoaded',
          catalog: furniture.catalog,
          sprites: Object.fromEntries(furniture.sprites),
        });
      }
      console.log('[Pixel Agents] Assets reloaded (external directory change)');
    };

    // Optional feature: music from Spotify via a Spicetify extension (features/musica).
    const music = createMusicFeature({
      templatePath: path.join(distRoot, 'musica', 'spicetify', 'javbots-musica.js'),
      serverUrl: () => (currentConfig ? `http://127.0.0.1:${currentConfig.port}` : null),
    });

    const features: ServerFeature[] = [
      music,
      createUsageFeature({ command: () => runUsageCommand() }),
      herdr,
      createGithubFeature(),
      // Optional feature: upcoming concerts from Google Calendar + Ticketmaster (features/conciertos).
      createConcertsFeature({
        officeToken: () => currentConfig?.token ?? null,
        serverUrl: () => (currentConfig ? `http://127.0.0.1:${currentConfig.port}` : null),
        topArtists: () => music.topArtists(),
      }),
    ];
    // Private packs (privado/<pack>/server.ts, found by scripts/generate-packs.mjs): their own features.
    const publicFeatures = [...features];
    for (const pack of PACK_SERVERS) {
      try {
        features.push(
          ...pack.create({
            serverUrl: () => (currentConfig ? `http://127.0.0.1:${currentConfig.port}` : null),
            officeToken: () => currentConfig?.token ?? null,
            packDir: path.join(distRoot, 'packs', pack.name),
            features: publicFeatures,
          }),
        );
      } catch (err) {
        console.error(`[Packs] ${pack.name} no arrancó:`, err);
      }
    }
    // Optional feature: the board of outside connections, as every other feature reports them (features/conexiones).
    features.push(createConnectionsFeature({ features: () => features }));

    const config = await server.start({
      store,
      runtime,
      embedded: false,
      host: args.host,
      port: args.port,
      staticDir,
      assetCache,
      onSetHooksEnabled,
      onReloadAssets,
      features,
    });
    currentConfig = { port: config.port, token: config.token };

    // Sync runtime refs with persisted settings BEFORE first scan tick. The
    // runtime's single hooksEnabled ref gates the Claude scanners: on only while
    // every Claude profile wants hooks (claudeHooksEnabled).
    runtime.hooksEnabled.current = claudeHooksEnabled(getHooksEnabled);
    runtime.watchAllSessions.current = adapter.getSetting('pixel-agents.watchAllSessions', false);

    // Install hooks on startup, per Claude Code profile (claudeProfiles.ts), where
    // the persisted setting says so — each gated on its own one-time consent to
    // modify that profile's settings.json.
    let hookScriptReady: boolean | null = null;
    for (const provider of hookProviders()) {
      const where = provider.displayName;
      if (!getHooksEnabled(provider.id)) {
        // Without this line, a persisted hooks-off makes startup skip the entire
        // consent/install flow with zero output — indistinguishable from a bug.
        console.log(
          `[Pixel Agents] Hooks disabled for ${where} — enable "Instant Detection (Hooks)" in the UI settings to install them.`,
        );
        continue;
      }
      let consent = getHooksConsent(provider.id) === 'granted';
      if (!consent && (await provider.areHooksInstalled())) {
        // Our hooks are already installed and already firing — a pre-consent
        // version put them there. Grant and continue with NO prompt: the
        // install below is the 14 -> 12 migration, and it only ever REDUCES
        // scope (it drops UserPromptSubmit and TaskCreated, the two events that
        // forwarded prompt text and were consumed by nothing). Asking would buy
        // this user no protection they do not already have, so they are not
        // asked. A fresh install still is, in full — in the browser UI, when a
        // tokened client connects (clientMessageHandler's webviewReady).
        grantHooksConsent(provider.id);
        consent = true;
      }
      if (!consent) {
        console.log(
          `[Pixel Agents] Hooks not installed for ${where}: modifying its settings.json needs one-time approval — open the URL below to review and approve it.`,
        );
        continue;
      }
      hookScriptReady ??= copyHookScriptOrReport(packageRoot);
      if (!hookScriptReady) continue;
      try {
        await provider.installHooks(`http://127.0.0.1:${config.port}`, config.token);
        console.log(`[Pixel Agents] Hooks installed for ${where}`);
      } catch (err) {
        console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Start scanning for external sessions (Claude running in user's terminal),
    // in this folder's project dir of every Claude profile that has one.
    const cwd = process.cwd();
    const dirs = claudeProvider.getSessionDirs?.(cwd) ?? [];
    if (dirs[0]) {
      for (const projectDir of dirs) {
        console.log(`[Pixel Agents] Scanning project dir: ${projectDir}`);
        runtime.startProjectScan(projectDir);
      }
      runtime.startExternalScanning(dirs[0]);
      runtime.startStaleCheck();
    }

    // The URL the operator opens has to be REACHABLE (a wildcard bind address
    // is a bind target, not an address you can browse to — `--host 0.0.0.0`
    // used to print a dead `http://0.0.0.0:PORT`) and has to carry the token,
    // which is what makes the session it loads privileged enough to approve a
    // hook install (see standaloneTokenValid in httpServer.ts). Under `--host
    // 0.0.0.0` the office stays readable from the LAN at this machine's own
    // address; only the consent-bearing toggle needs the token.
    const displayHost =
      args.host === '0.0.0.0' || args.host === '::' || args.host === '' ? '127.0.0.1' : args.host;
    console.log(
      `\n  Pixel Agents server running at http://${displayHost}:${config.port}/?token=${config.token}\n`,
    );

    // ── Graceful shutdown ──
    function shutdown(): void {
      console.log('\nShutting down...');
      runtime.dispose();
      for (const feature of features) feature.dispose?.();
      server.stop();
      process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only auto-run when this file is executed directly (`node dist/cli.js`), not
// when it's imported for its exports (e.g. `parseArgs` in tests) -- importing
// it unconditionally used to start a real server and install real Claude
// hooks as a side effect of module load.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
