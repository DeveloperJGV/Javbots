import { describe, expect, it } from 'vitest';

import { appleString } from '../src/notifyMac.js';

describe('macOS notifications', () => {
  it('quotes untrusted text as one AppleScript string', () => {
    expect(appleString('Crash "x" en iOS')).toBe('"Crash \\"x\\" en iOS"');
    expect(appleString('a\\" & do shell script "rm')).toBe('"a\\\\\\" & do shell script \\"rm"');
  });
});
