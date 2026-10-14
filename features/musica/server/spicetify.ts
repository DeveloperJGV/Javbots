import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  EXTENSION_FILE,
  EXTENSION_TOKEN_PLACEHOLDER,
  EXTENSION_URL_PLACEHOLDER,
  SPICETIFY_BIN,
  SPICETIFY_TIMEOUT_MS,
} from './constants.js';

/** Runs the spicetify CLI; injectable for tests. Resolves with stdout, rejects on failure. */
export type SpicetifyRunner = (args: string[]) => Promise<string>;

export const runSpicetify: SpicetifyRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      SPICETIFY_BIN,
      args,
      { timeout: SPICETIFY_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim()));
        else resolve(stdout);
      },
    );
  });

/** Spicetify's userdata folder (where `config-xpui.ini` and user `Extensions/` live), or null if not installed. */
export async function spicetifyUserdata(run: SpicetifyRunner): Promise<string | null> {
  try {
    const out = (await run(['path', 'userdata'])).trim().split(/\r?\n/).pop()?.trim();
    return out && fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/** Extensions enabled in config-xpui.ini (`extensions = a.js|b.js`). */
export function enabledExtensions(userdata: string): string[] {
  try {
    const ini = fs.readFileSync(path.join(userdata, 'config-xpui.ini'), 'utf-8');
    const line = ini.split(/\r?\n/).find((l) => /^\s*extensions\s*=/.test(l));
    return (line?.split('=')[1] ?? '')
      .split('|')
      .map((e) => e.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function isExtensionInstalled(userdata: string): boolean {
  return (
    fs.existsSync(path.join(userdata, 'Extensions', EXTENSION_FILE)) &&
    enabledExtensions(userdata).includes(EXTENSION_FILE)
  );
}

/** The extension source with the server URL and the music token filled in. */
export function renderExtension(template: string, serverUrl: string, token: string): string {
  return template
    .split(EXTENSION_URL_PLACEHOLDER)
    .join(serverUrl)
    .split(EXTENSION_TOKEN_PLACEHOLDER)
    .join(token);
}

/**
 * Write the extension into Spicetify's userdata `Extensions/`, enable it and
 * apply (Spotify restarts). Only touches our own file and the extensions list.
 */
export async function installExtension(opts: {
  run: SpicetifyRunner;
  templatePath: string;
  serverUrl: string;
  token: string;
}): Promise<{ ok: boolean; message: string }> {
  const userdata = await spicetifyUserdata(opts.run);
  if (!userdata) {
    return { ok: false, message: 'No encontré Spicetify. Instálalo primero (spicetify.app).' };
  }
  let template: string;
  try {
    template = fs.readFileSync(opts.templatePath, 'utf-8');
  } catch {
    return { ok: false, message: 'Falta el archivo de la extensión en la instalación de Javbots.' };
  }
  try {
    const dir = path.join(userdata, 'Extensions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, EXTENSION_FILE),
      renderExtension(template, opts.serverUrl, opts.token),
    );
    if (!enabledExtensions(userdata).includes(EXTENSION_FILE)) {
      await opts.run(['config', 'extensions', EXTENSION_FILE]);
    }
    await opts.run(['apply']);
  } catch (err) {
    return { ok: false, message: `Spicetify falló: ${(err as Error).message}` };
  }
  return { ok: true, message: 'Listo: Spotify se reinició con la extensión de Javbots.' };
}
