import { spawn } from 'child_process';

/** AppleScript string literal (backslashes and quotes escaped): titles from outside services are untrusted text. */
export function appleString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A macOS notification (no-op elsewhere), for features that want to tell the user something while the office is in
 * the background. `osascript` gets its argv directly (no shell). Never throws.
 */
export function notifyMac(title: string, message: string): void {
  if (process.platform !== 'darwin') return;
  try {
    const child = spawn(
      'osascript',
      ['-e', `display notification ${appleString(message)} with title ${appleString(title)}`],
      { stdio: 'ignore' },
    );
    child.on('error', () => {});
    child.unref();
  } catch {
    /* notifications are best effort */
  }
}
