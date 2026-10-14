import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LOG_PREFIX, MUSIC_CONFIG_FILE } from './constants.js';

/** ~/.pixel-agents/music.json */
export interface MusicConfig {
  /** Show the music column and animate the turntable. */
  enabled: boolean;
  /** Music-only bearer token: it can post the current track and nothing else. */
  token: string;
}

function configPath(): string {
  return path.join(os.homedir(), '.pixel-agents', MUSIC_CONFIG_FILE);
}

/** Read the feature config; creates (and saves) a token the first time. */
export function readMusicConfig(): MusicConfig {
  let raw: Partial<MusicConfig> = {};
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as Partial<MusicConfig>;
  } catch {
    // missing or unreadable: defaults below
  }
  const config: MusicConfig = {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    token:
      typeof raw.token === 'string' && raw.token.length >= 16 ? raw.token : crypto.randomUUID(),
  };
  if (config.token !== raw.token) writeMusicConfig(config);
  return config;
}

/** Atomic write (tmp + rename), private to the user. Failures are logged, never thrown. */
export function writeMusicConfig(config: MusicConfig): void {
  const file = configPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`${LOG_PREFIX} No se pudo guardar ${MUSIC_CONFIG_FILE}:`, err);
  }
}
