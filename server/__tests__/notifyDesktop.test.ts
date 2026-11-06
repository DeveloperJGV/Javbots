import { describe, expect, it } from 'vitest';

import { windowsToastCommand } from '../src/notifyDesktop.js';

describe('Windows toast', () => {
  it('keeps the untrusted text out of the script (it rides in the environment)', () => {
    const title = 'Crash "x" $(rm -rf) <b>';
    const message = "a'; Remove-Item C:\ -Recurse; '";
    const { args, env } = windowsToastCommand(title, message);
    expect(env).toEqual({ JAVBOTS_TOAST_TITLE: title, JAVBOTS_TOAST_MESSAGE: message });
    const script = Buffer.from(args[args.length - 1], 'base64').toString('utf16le');
    expect(script).not.toContain('rm -rf');
    expect(script).not.toContain('Remove-Item');
    expect(script).toContain('[Security.SecurityElement]::Escape($env:JAVBOTS_TOAST_TITLE)');
    expect(args.slice(0, -1)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
    ]);
  });
});
