import * as fs from 'fs';
import * as path from 'path';

/** Bytes read from the head of a transcript when looking for its `cwd`. */
const CWD_SCAN_MAX_BYTES = 64 * 1024;

/** Last segment of a working directory, for either path flavour. */
export function folderNameFromCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const name = cwd.includes('\\') ? path.win32.basename(cwd) : path.posix.basename(cwd);
  return name || undefined;
}

/**
 * The real folder name of a session, read from the `cwd` its transcript records.
 * The project-dir hash can't give this back: `C:\dev\proyectos\mi-proyecto` hashes to
 * `C--dev-proyectos-mi-proyecto`, so splitting on `-` yields `proyecto`.
 */
export function folderNameFromTranscript(transcriptPath: string): string | undefined {
  let head: string;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const buf = Buffer.alloc(CWD_SCAN_MAX_BYTES);
      const bytes = fs.readSync(fd, buf, 0, CWD_SCAN_MAX_BYTES, 0);
      head = buf.toString('utf-8', 0, bytes);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
  for (const line of head.split('\n')) {
    if (!line.includes('"cwd"')) continue;
    try {
      const record = JSON.parse(line) as { cwd?: unknown };
      if (typeof record.cwd === 'string') return folderNameFromCwd(record.cwd);
    } catch {
      // Partial last line or malformed record: keep looking.
    }
  }
  return undefined;
}

/** Fallback when no cwd is known: last `-` segment of the Claude project dir hash. */
export function folderNameFromProjectDir(dirName: string): string {
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}
