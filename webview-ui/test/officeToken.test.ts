import { describe, expect, it } from 'vitest';

import { OFFICE_TOKEN_STORAGE_KEY } from '../src/constants.js';
import type { TokenPage } from '../src/officeToken.js';
import { takeOfficeToken } from '../src/officeToken.js';

function fakePage(href: string, stored: Record<string, string> = {}, storageBlocked = false) {
  const page = {
    location: { href },
    history: {
      state: null as unknown,
      replaceState(_data: unknown, _unused: string, url: string) {
        page.location.href = new URL(url, page.location.href).href;
      },
    },
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error('blocked');
        return stored[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        if (storageBlocked) throw new Error('blocked');
        stored[key] = value;
      },
    },
  } satisfies TokenPage;
  return { page, stored };
}

describe('takeOfficeToken', () => {
  it('takes the token off the address bar, keeps the other parameters and remembers it', () => {
    const { page, stored } = fakePage('http://127.0.0.1:3100/?oficina=x&token=abc&piso=1#h');
    expect(takeOfficeToken(page)).toBe('abc');
    expect(page.location.href).toBe('http://127.0.0.1:3100/?oficina=x&piso=1#h');
    expect(stored[OFFICE_TOKEN_STORAGE_KEY]).toBe('abc');
  });

  it('uses the remembered token after F5 (no token in the URL)', () => {
    const { page } = fakePage('http://127.0.0.1:3100/', { [OFFICE_TOKEN_STORAGE_KEY]: 'abc' });
    expect(takeOfficeToken(page)).toBe('abc');
  });

  it('prefers the URL token over a stale remembered one', () => {
    const { page, stored } = fakePage('http://127.0.0.1:3100/?token=new', {
      [OFFICE_TOKEN_STORAGE_KEY]: 'old',
    });
    expect(takeOfficeToken(page)).toBe('new');
    expect(stored[OFFICE_TOKEN_STORAGE_KEY]).toBe('new');
  });

  it('leaves the token in the URL when the browser blocks storage', () => {
    const { page } = fakePage('http://127.0.0.1:3100/?token=abc', {}, true);
    expect(takeOfficeToken(page)).toBe('abc');
    expect(page.location.href).toBe('http://127.0.0.1:3100/?token=abc');
  });

  it('returns null with no token anywhere', () => {
    expect(takeOfficeToken(fakePage('http://127.0.0.1:3100/').page)).toBeNull();
  });
});
