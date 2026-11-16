import * as fs from 'fs';
import * as path from 'path';

import {
  ACCESOS_MAX,
  ARG_MAX,
  ARGS_MAX,
  COMMAND_MAX,
  DESCRIPTION_MAX,
  FILE_MAX_BYTES,
  FOLDER_MAX,
  ID_PATTERN,
  LOCAL_HOSTS,
  NAME_MAX,
  URL_MAX,
} from './constants.js';

/** How a page is started: a program and its arguments, run from a folder (no shell). */
export interface AccesoStart {
  comando: string;
  argumentos: string[];
  carpeta: string;
}

/** One page of the owner's list, already checked. */
export interface Acceso {
  id: string;
  nombre: string;
  descripcion: string;
  url: string;
  iniciar?: AccesoStart;
}

export interface AccesosConfig {
  accesos: Acceso[];
  /** What could not be used, in words for the panel. */
  problems: string[];
}

// Control characters and the bidirectional overrides that can make a text read differently than it is stored
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** A text from the file, made safe to show: no control characters, one space between words, cut to `max`. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const flat = value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}

/**
 * The page's address if it is a page on this computer: http, localhost or 127.0.0.1, an explicit port, no user or
 * password. Anything else is null (the office never checks or links an outside address).
 */
export function localUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > URL_MAX || CONTROL_CHARS.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (!LOCAL_HOSTS.includes(url.hostname)) return null;
  if (!url.port) return null;
  if (url.username || url.password) return null;
  return url.href;
}

function readStart(
  raw: unknown,
  label: string,
  problems: string[],
  platform: NodeJS.Platform,
): AccesoStart | undefined {
  if (raw === undefined || raw === null) return undefined;
  const fail = (why: string) => {
    problems.push(`${label}: no se puede prender desde la oficina (${why}).`);
    return undefined;
  };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('"iniciar" no es un objeto');
  const r = raw as Record<string, unknown>;
  const comando = r.comando;
  if (
    typeof comando !== 'string' ||
    !comando.trim() ||
    comando.length > COMMAND_MAX ||
    CONTROL_CHARS.test(comando)
  )
    return fail('falta "comando"');
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(comando.trim()))
    return fail('"comando" tiene que ser un programa (.exe), no un .cmd ni un .bat');
  const args = r.argumentos ?? [];
  if (
    !Array.isArray(args) ||
    args.length > ARGS_MAX ||
    args.some((a) => typeof a !== 'string' || a.length > ARG_MAX || CONTROL_CHARS.test(a))
  )
    return fail('"argumentos" tiene que ser una lista de textos');
  const carpeta = r.carpeta;
  if (
    typeof carpeta !== 'string' ||
    carpeta.length > FOLDER_MAX ||
    CONTROL_CHARS.test(carpeta) ||
    !path.isAbsolute(carpeta)
  )
    return fail('"carpeta" tiene que ser una ruta completa');
  return { comando: comando.trim(), argumentos: args as string[], carpeta };
}

/** Reads the list out of the file's parsed JSON. What does not fit is left out and said in `problems`. */
export function parseAccesos(
  raw: unknown,
  platform: NodeJS.Platform = process.platform,
): AccesosConfig {
  const problems: string[] = [];
  const accesos: Acceso[] = [];
  const list =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).accesos
      : undefined;
  if (!Array.isArray(list)) {
    if (raw !== undefined)
      problems.push('El archivo no tiene una lista "accesos"; no se muestra ninguna página.');
    return { accesos, problems };
  }
  if (list.length > ACCESOS_MAX)
    problems.push(`Solo se leen las primeras ${ACCESOS_MAX} páginas de la lista.`);
  list.slice(0, ACCESOS_MAX).forEach((item, i) => {
    const label = `La página ${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`${label} no es un objeto y se dejó fuera.`);
      return;
    }
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!ID_PATTERN.test(id)) {
      problems.push(
        `${label} no tiene un "id" válido (minúsculas, números y guiones) y se dejó fuera.`,
      );
      return;
    }
    if (accesos.some((a) => a.id === id)) {
      problems.push(`El id "${id}" está repetido; se dejó solo el primero.`);
      return;
    }
    const url = localUrl(r.url);
    if (!url) {
      problems.push(
        `"${id}" se dejó fuera: su "url" tiene que ser http://localhost:<puerto>/ o http://127.0.0.1:<puerto>/.`,
      );
      return;
    }
    const nombre = cleanText(r.nombre, NAME_MAX) || id;
    const acceso: Acceso = {
      id,
      nombre,
      descripcion: cleanText(r.descripcion, DESCRIPTION_MAX),
      url,
    };
    const iniciar = readStart(r.iniciar, `"${nombre}"`, problems, platform);
    if (iniciar) acceso.iniciar = iniciar;
    accesos.push(acceso);
  });
  return { accesos, problems };
}

/** Reads ~/.pixel-agents/accesos.json. No file = an empty list, without a warning. */
export function readAccesosFile(file: string, platform?: NodeJS.Platform): AccesosConfig {
  let text: string;
  try {
    const stat = fs.statSync(file);
    if (stat.size > FILE_MAX_BYTES)
      return { accesos: [], problems: ['El archivo de accesos es demasiado grande; no se leyó.'] };
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { accesos: [], problems: [] };
    return { accesos: [], problems: ['No se pudo leer el archivo de accesos.'] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return {
      accesos: [],
      problems: ['El archivo de accesos no es JSON válido; revisa comas y comillas.'],
    };
  }
  return parseAccesos(raw, platform);
}
