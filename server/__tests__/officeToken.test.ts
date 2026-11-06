import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadOrCreateOfficeToken } from '../src/officeToken.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('loadOrCreateOfficeToken', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-office-token-'));
    filePath = path.join(dir, '.pixel-agents', 'office-token.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates and saves a token when there is none', () => {
    const token = loadOrCreateOfficeToken({ filePath });
    expect(token).toMatch(UUID);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { token: string };
    expect(saved.token).toBe(token);
  });

  it('keeps the same token across restarts', () => {
    const first = loadOrCreateOfficeToken({ filePath });
    expect(loadOrCreateOfficeToken({ filePath })).toBe(first);
  });

  it('mints and saves a new one when asked (--nueva-llave)', () => {
    const first = loadOrCreateOfficeToken({ filePath });
    const second = loadOrCreateOfficeToken({ filePath, fresh: true });
    expect(second).not.toBe(first);
    expect(loadOrCreateOfficeToken({ filePath })).toBe(second);
  });

  it.each([
    ['unparseable', '{nope'],
    ['empty token', '{"token":""}'],
    ['not a uuid', '{"token":"abc"}'],
    ['wrong type', '{"token":42}'],
  ])('replaces a broken file (%s)', (_label, content) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    const token = loadOrCreateOfficeToken({ filePath });
    expect(token).toMatch(UUID);
    expect(loadOrCreateOfficeToken({ filePath })).toBe(token);
  });
});
