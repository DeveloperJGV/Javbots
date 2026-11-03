import { describe, expect, it } from 'vitest';

import { GITHUB_HOSTS, safeHttpsUrl } from '../../core/src/safeLinks.js';

const HOSTS = ['example.app', ...GITHUB_HOSTS];

describe('safe links', () => {
  it('keeps https links on the right service (and its subdomains)', () => {
    expect(safeHttpsUrl('https://example.app/equipo/issue/A-1', HOSTS)).toBe(
      'https://example.app/equipo/issue/A-1',
    );
    expect(safeHttpsUrl('https://org.example.app/issues/1/', HOSTS)).toBeDefined();
    expect(safeHttpsUrl('https://github.com/alguien/repo/pull/4', HOSTS)).toBeDefined();
  });

  it('drops everything else', () => {
    for (const bad of [
      'javascript:alert(1)',
      'http://example.app/x',
      'https://example.app.evil.com/x',
      'https://evilexample.app/x',
      'https://evil.example/example.app/',
      'https://user:pw@github.com/x',
      'no es una liga',
      42,
    ])
      expect(safeHttpsUrl(bad, HOSTS)).toBeUndefined();
    expect(safeHttpsUrl('https://example.app/x', GITHUB_HOSTS)).toBeUndefined();
  });
});
