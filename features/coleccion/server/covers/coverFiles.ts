import * as fs from 'fs';
import * as path from 'path';

import {
  COVER_TYPES,
  type CoverType,
  imageSize,
  imageTypeOf,
  sizeAllowed,
} from '../../core/cover.js';
import { isGameId } from '../../core/game.js';
import { CANDIDATES_DIR, COVERS_DIR, IMAGE_MAX_BYTES, LISTINGS_DIR } from './constants.js';

/** A new cover written aside, not yet the game's (see CoverFiles.stage). */
export interface StagedCover {
  readonly id: string;
  readonly type: CoverType;
  readonly file: string;
}

export interface CoverFiles {
  readonly dir: string;
  readonly listingsDir: string;
  /**
   * Checks the bytes (type, weight, size from the header) and writes them aside: the cover the game has stays as it
   * was until `commit`. Throws ImageError (or a write error).
   */
  stage(id: string, bytes: Uint8Array): StagedCover;
  /** The staged image becomes <id>.<type>, and the other types go. Call it only once the collection says so. */
  commit(staged: StagedCover): void;
  /** Throws the staged image away (the collection could not be written). */
  discard(staged: StagedCover): void;
  /** The image of a game, when there is one of that type. */
  read(id: string, type: CoverType): Buffer | null;
  /** Deletes the game's cover in every type, and its cached candidates. */
  remove(id: string): void;
  saveCandidate(id: string, n: number, bytes: Uint8Array): CoverType;
  readCandidate(id: string, n: number): { bytes: Buffer; type: CoverType } | null;
  clearCandidates(id: string): void;
  /** Empties the candidates folder (at start: «elige una» lives in memory, its thumbnails do not outlive it). */
  clearAllCandidates(): void;
  /**
   * Deletes cover images of games that are no longer in the collection, and writes left halfway. Only
   * "<id>.<type>" and ".tmp" files of the covers folder itself; the listings folder is never touched. Returns how
   * many it deleted.
   */
  removeOrphans(keep: ReadonlySet<string>): number;
}

/** A thrown problem with the image itself (the HTTP route answers 415 or 413 with it). */
export class ImageError extends Error {
  constructor(
    readonly kind: 'tipo' | 'tamano' | 'vacia',
    message: string,
  ) {
    super(message);
    this.name = 'ImageError';
  }
}

/**
 * Throws ImageError when the bytes are not a PNG, JPEG or WEBP within the weight cap, or when its header does not
 * say a size a page can draw (read from the header, before anything decodes it: a 16000×16000 image would take
 * the browser tab down). Every image goes through here: uploads, downloads and candidates.
 */
export function checkImage(bytes: Uint8Array): CoverType {
  if (bytes.byteLength === 0) throw new ImageError('vacia', 'la imagen está vacía');
  if (bytes.byteLength > IMAGE_MAX_BYTES)
    throw new ImageError('tamano', `la imagen pasa de ${IMAGE_MAX_BYTES / 1024 / 1024} MB`);
  const type = imageTypeOf(bytes);
  if (!type) throw new ImageError('tipo', 'no es una imagen PNG, JPEG ni WEBP');
  const size = imageSize(bytes);
  if (!size) throw new ImageError('tipo', 'no se pudo leer el tamaño de la imagen');
  if (!sizeAllowed(size))
    throw new ImageError(
      'tamano',
      `la imagen mide ${size.width}×${size.height}: es demasiado grande`,
    );
  return type;
}

const COVER_NAME = /^([a-z0-9]{4,32})\.(png|jpg|webp)$/;

/** Cover images under <pixelDir>/coleccion/portadas/, named only by game id. */
export function createCoverFiles(pixelDir: string): CoverFiles {
  const dir = path.join(pixelDir, ...COVERS_DIR);
  const candidatesDir = path.join(dir, CANDIDATES_DIR);

  let staging = 0;

  function atomicWrite(file: string, bytes: Uint8Array): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.${++staging}.tmp`;
    try {
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
  }

  const coverFile = (id: string, type: CoverType) => {
    if (!isGameId(id)) throw new Error('id de juego no válido');
    return path.join(dir, `${id}.${type}`);
  };
  const candidateFile = (id: string, n: number, type: CoverType) => {
    if (!isGameId(id) || !Number.isInteger(n) || n < 0 || n > 9)
      throw new Error('candidata no válida');
    return path.join(candidatesDir, `${id}-${n}.${type}`);
  };

  const readIf = (file: string): Buffer | null => {
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  };

  return {
    dir,
    listingsDir: path.join(dir, LISTINGS_DIR),

    stage(id, bytes) {
      const type = checkImage(bytes);
      const final = coverFile(id, type);
      const file = `${final}.${process.pid}.${Date.now()}.${++staging}.tmp`;
      fs.mkdirSync(dir, { recursive: true });
      try {
        fs.writeFileSync(file, bytes);
      } catch (err) {
        fs.rmSync(file, { force: true });
        throw err;
      }
      return { id, type, file };
    },

    commit(staged) {
      fs.renameSync(staged.file, coverFile(staged.id, staged.type));
      for (const other of COVER_TYPES)
        if (other !== staged.type) fs.rmSync(coverFile(staged.id, other), { force: true });
    },

    discard(staged) {
      fs.rmSync(staged.file, { force: true });
    },

    read(id, type) {
      if (!isGameId(id)) return null;
      return readIf(coverFile(id, type));
    },

    remove(id) {
      if (!isGameId(id)) return;
      for (const type of COVER_TYPES) fs.rmSync(coverFile(id, type), { force: true });
      this.clearCandidates(id);
    },

    saveCandidate(id, n, bytes) {
      const type = checkImage(bytes);
      atomicWrite(candidateFile(id, n, type), bytes);
      return type;
    },

    readCandidate(id, n) {
      if (!isGameId(id)) return null;
      for (const type of COVER_TYPES) {
        const bytes = readIf(candidateFile(id, n, type));
        if (bytes) return { bytes, type };
      }
      return null;
    },

    clearCandidates(id) {
      if (!isGameId(id)) return;
      let names: string[];
      try {
        names = fs.readdirSync(candidatesDir);
      } catch {
        return;
      }
      for (const name of names)
        if (name.startsWith(`${id}-`)) fs.rmSync(path.join(candidatesDir, name), { force: true });
    },

    clearAllCandidates() {
      let names: string[];
      try {
        names = fs.readdirSync(candidatesDir);
      } catch {
        return;
      }
      for (const name of names) {
        try {
          if (fs.lstatSync(path.join(candidatesDir, name)).isFile())
            fs.rmSync(path.join(candidatesDir, name), { force: true });
        } catch {
          // Gone already, or not ours to delete
        }
      }
    },

    removeOrphans(keep) {
      let names: string[];
      try {
        names = fs.readdirSync(dir);
      } catch {
        return 0;
      }
      let removed = 0;
      for (const name of names) {
        const m = COVER_NAME.exec(name);
        const orphan = m ? !keep.has(m[1]) : name.endsWith('.tmp');
        if (!orphan) continue;
        try {
          if (!fs.lstatSync(path.join(dir, name)).isFile()) continue;
          fs.rmSync(path.join(dir, name), { force: true });
          removed++;
        } catch {
          // Gone already
        }
      }
      return removed;
    },
  };
}
