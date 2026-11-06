import { spawn } from 'child_process';

import { notifyMac } from './notifyMac.js';

/**
 * PowerShell's own AppUserModelID: Windows only shows a toast from an app it knows, and powershell.exe is always
 * registered. The toast then reads "Windows PowerShell" as its sender.
 */
const WINDOWS_TOAST_APP_ID =
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe';

/**
 * The fixed script that shows a Windows toast. The title and message ride in environment variables, never in the
 * script text, and are XML-escaped inside it: they can come from outside services and are untrusted.
 */
const WINDOWS_TOAST_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
  '$t = [Security.SecurityElement]::Escape($env:JAVBOTS_TOAST_TITLE)',
  '$m = [Security.SecurityElement]::Escape($env:JAVBOTS_TOAST_MESSAGE)',
  '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
  '$xml.LoadXml("<toast><visual><binding template=""ToastGeneric""><text>$t</text><text>$m</text></binding></visual></toast>")',
  '$toast = New-Object Windows.UI.Notifications.ToastNotification $xml',
  `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("${WINDOWS_TOAST_APP_ID}").Show($toast)`,
].join('; ');

/** The powershell argv and environment for a toast (exported for tests). */
export function windowsToastCommand(
  title: string,
  message: string,
): { args: string[]; env: Record<string, string> } {
  // -EncodedCommand (UTF-16LE base64) keeps the script's quotes away from Windows command-line parsing.
  const encoded = Buffer.from(WINDOWS_TOAST_SCRIPT, 'utf16le').toString('base64');
  return {
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    env: { JAVBOTS_TOAST_TITLE: title, JAVBOTS_TOAST_MESSAGE: message },
  };
}

function notifyWindows(title: string, message: string): void {
  try {
    const { args, env } = windowsToastCommand(title, message);
    const child = spawn('powershell.exe', args, {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* notifications are best effort */
  }
}

/**
 * A desktop notification for features that want to tell the user something while the office is in the background:
 * Notification Center on macOS, a toast on Windows, nothing elsewhere. Never throws.
 */
export function notifyDesktop(title: string, message: string): void {
  if (process.platform === 'darwin') notifyMac(title, message);
  else if (process.platform === 'win32') notifyWindows(title, message);
}
