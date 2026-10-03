import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  folderNameFromCwd,
  folderNameFromProjectDir,
  folderNameFromTranscript,
} from '../src/folderName.js';

describe('folderName', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-folder-name-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTranscript(lines: string[]): string {
    const file = path.join(tmpDir, 'session.jsonl');
    fs.writeFileSync(file, lines.join('\n'));
    return file;
  }

  it('keeps dashes from the real folder in a Windows cwd', () => {
    expect(folderNameFromCwd('C:\\dev\\proyectos\\mi-proyecto')).toBe('mi-proyecto');
  });

  it('handles POSIX cwds and empty input', () => {
    expect(folderNameFromCwd('/home/me/my-project')).toBe('my-project');
    expect(folderNameFromCwd('')).toBeUndefined();
    expect(folderNameFromCwd(undefined)).toBeUndefined();
  });

  it('reads the cwd from the first transcript record that carries one', () => {
    const file = writeTranscript([
      JSON.stringify({ type: 'file-history-snapshot' }),
      '{"cwd": broken json',
      JSON.stringify({ type: 'user', cwd: 'C:\\dev\\proyectos\\mi-proyecto' }),
      JSON.stringify({ type: 'user', cwd: 'C:\\elsewhere' }),
    ]);
    expect(folderNameFromTranscript(file)).toBe('mi-proyecto');
  });

  it('returns undefined for a missing transcript or one without cwd', () => {
    expect(folderNameFromTranscript(path.join(tmpDir, 'missing.jsonl'))).toBeUndefined();
    expect(folderNameFromTranscript(writeTranscript([JSON.stringify({ type: 'x' })]))).toBe(
      undefined,
    );
  });

  it('falls back to the last segment of the project dir hash', () => {
    expect(folderNameFromProjectDir('C--dev-proyectos-mi-proyecto')).toBe('proyecto');
    expect(folderNameFromProjectDir('-home-me-app')).toBe('app');
  });
});
