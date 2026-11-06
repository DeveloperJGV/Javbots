import { OFFICE_TOKEN_STORAGE_KEY, OFFICE_TOKEN_URL_PARAM } from './constants.js';
import { isBrowserRuntime } from './runtime.js';

/** The bits of `window` the token needs (a fake one in tests). */
export interface TokenPage {
  location: { href: string };
  history: { state: unknown; replaceState(data: unknown, unused: string, url: string): void };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

/**
 * The owner's office token (standalone). The shortcut opens the page with `?token=`; it is remembered in this
 * browser and taken off the address bar right away, so it isn't on screen or in the history, and F5 still works.
 * A token in the URL always wins over the remembered one (a fresh shortcut open fixes a stale tab).
 */
export function takeOfficeToken(page: TokenPage): string | null {
  const url = new URL(page.location.href);
  const fromUrl = url.searchParams.get(OFFICE_TOKEN_URL_PARAM);
  if (fromUrl) {
    try {
      page.localStorage.setItem(OFFICE_TOKEN_STORAGE_KEY, fromUrl);
    } catch {
      return fromUrl; // storage blocked: leave it in the address bar, or F5 would lose it
    }
    url.searchParams.delete(OFFICE_TOKEN_URL_PARAM);
    page.history.replaceState(page.history.state, '', url.pathname + url.search + url.hash);
    return fromUrl;
  }
  try {
    return page.localStorage.getItem(OFFICE_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

// VS Code and Node tests have no page to take it from.
const token = isBrowserRuntime && typeof window !== 'undefined' ? takeOfficeToken(window) : null;

/** The office token this page holds, or null (VS Code, or a browser that never got it). */
export const officeToken = (): string | null => token;
