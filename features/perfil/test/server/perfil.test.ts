import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parsePerfil, perfilPath, readPerfil } from '../../server/perfilData.js';
import { createPerfilFeature } from '../../server/perfilFeature.js';

const SAMPLE = {
  code: 'ABCD-X',
  name: 'Ejemplo',
  role: 'Rol',
  strategy: 'Estrategia',
  traits: [
    { letter: 'A', name: 'Uno', percent: 60 },
    { letter: 'B', name: 'Dos', percent: 55.6 },
  ],
  facts: ['Un dato'],
  source: 'Un test',
  date: '2026-01-02',
};

describe('perfil (server)', () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-perfil-'));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const write = (data: unknown) => {
    fs.mkdirSync(path.dirname(perfilPath(home)), { recursive: true });
    fs.writeFileSync(perfilPath(home), typeof data === 'string' ? data : JSON.stringify(data));
  };

  it('reads a profile and rounds the percentages', () => {
    write(SAMPLE);
    expect(readPerfil(home)).toEqual({
      ...SAMPLE,
      traits: [SAMPLE.traits[0], { ...SAMPLE.traits[1], percent: 56 }],
    });
  });

  it('is null without a file, with broken JSON, or without code, name or a valid trait', () => {
    expect(readPerfil(home)).toBeNull();
    write('{nope');
    expect(readPerfil(home)).toBeNull();
    expect(parsePerfil({ ...SAMPLE, code: '' })).toBeNull();
    expect(parsePerfil({ ...SAMPLE, name: 3 })).toBeNull();
    expect(
      parsePerfil({ ...SAMPLE, traits: [{ letter: 'A', name: 'x', percent: 140 }] }),
    ).toBeNull();
    expect(parsePerfil([SAMPLE])).toBeNull();
  });

  it('drops bad traits and unknown fields, and leaves out empty optional ones', () => {
    const p = parsePerfil({
      code: 'X',
      name: 'Y',
      traits: [
        { letter: 'A', name: 'ok', percent: 10 },
        { letter: '', name: 'no', percent: 5 },
      ],
      facts: ['', 7],
      email: 'secreto@example.com',
    });
    expect(p).toEqual({ code: 'X', name: 'Y', traits: [{ letter: 'A', name: 'ok', percent: 10 }] });
  });

  it('answers webviewReady only to a page with the token, re-reading the file each time', () => {
    const feature = createPerfilFeature({ home });
    const sent: unknown[] = [];
    const page = (privileged: boolean) => ({
      privileged,
      send: (m: Record<string, unknown>) => sent.push(m),
    });

    expect(feature.handleClientMessage!({ type: 'webviewReady' }, page(true))).toBe(false);
    expect(sent).toEqual([{ type: 'perfilStatus' }]);

    write(SAMPLE);
    feature.handleClientMessage!({ type: 'webviewReady' }, page(false));
    expect(sent).toHaveLength(1); // nothing personal to a page without the token
    feature.handleClientMessage!({ type: 'webviewReady' }, page(true));
    expect(sent[1]).toMatchObject({ type: 'perfilStatus', profile: { code: 'ABCD-X' } });
  });
});
