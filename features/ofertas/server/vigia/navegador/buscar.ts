/** Where Edge (first) or Chrome usually live on Windows, macOS and Linux. Nothing is run here: it only looks. */
import * as fs from 'fs';
import * as path from 'path';

export interface FindOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Tests pass a double. */
  exists?: (file: string) => boolean;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Every place looked at, in order: Edge before Chrome. */
export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'win32') {
    const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(
      (r): r is string => typeof r === 'string' && r.length > 0,
    );
    const at = (...parts: string[]) => roots.map((r) => path.win32.join(r, ...parts));
    return [
      ...at('Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ...at('Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
  }
  return [
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/opt/microsoft/msedge/msedge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

/** The first browser found, or undefined. */
export function findBrowser(opts: FindOptions = {}): string | undefined {
  const exists = opts.exists ?? isFile;
  return browserCandidates(opts.platform, opts.env).find((file) => exists(file));
}
