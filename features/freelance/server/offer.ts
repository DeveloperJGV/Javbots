import * as fs from 'fs';
import * as path from 'path';

import type { FreelanceOfferSpec } from '../../../core/src/messages.js';
import {
  FREELANCE_DEFAULT_MODEL,
  LOG_PREFIX,
  MAX_OFFER_ITEM_CHARS,
  MAX_OFFER_ITEMS,
  MAX_OFFER_TEXT,
} from './constants.js';
import { FREELANCE_DEFAULT_OFFER, type FreelanceOffer } from './defaults.js';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
/** Control, zero-width and bidi-override characters: they can reorder or hide what the brief shows. */
const UNSAFE_CHARS_RE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g;
const line = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(UNSAFE_CHARS_RE, ' ').trim().slice(0, max) : '';
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => line(x, MAX_OFFER_ITEM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_OFFER_ITEMS);

/** The offer from freelance.json (Spanish keys) → checked; null when it says nothing at all. */
export function offerFromFile(raw: unknown): FreelanceOffer | null {
  const r = obj(raw);
  const offer: FreelanceOffer = {
    titulo: line(r.titulo, MAX_OFFER_TEXT),
    servicios: list(r.servicios),
    tecnologias: list(r.tecnologias),
    tarifa: line(r.tarifa, MAX_OFFER_TEXT),
    disponibilidad: line(r.disponibilidad, MAX_OFFER_TEXT),
    desde: line(r.desde, MAX_OFFER_TEXT),
    idiomas: list(r.idiomas),
    noQuiero: list(r.noQuiero),
  };
  return offer.titulo || offer.servicios.length ? offer : null;
}

/** The panel's offer (English keys) → the file's. */
export function offerFromWire(spec: unknown): FreelanceOffer | null {
  const s = obj(spec);
  return offerFromFile({
    titulo: s.title,
    servicios: s.services,
    tecnologias: s.technologies,
    tarifa: s.rate,
    disponibilidad: s.availability,
    desde: s.basedIn,
    idiomas: s.languages,
    noQuiero: s.notWanted,
  });
}

export const offerToWire = (o: FreelanceOffer): FreelanceOfferSpec => ({
  title: o.titulo,
  services: [...o.servicios],
  technologies: [...o.tecnologias],
  rate: o.tarifa,
  availability: o.disponibilidad,
  basedIn: o.desde,
  languages: [...o.idiomas],
  notWanted: [...o.noQuiero],
});

/** An offer saved before "desde" existed has none: it still counts as the example when the rest is the example. */
const sameOffer = (a: FreelanceOffer, b: FreelanceOffer): boolean =>
  JSON.stringify(offerToWire({ ...a, desde: a.desde || b.desde })) ===
  JSON.stringify(offerToWire(b));

/**
 * The room's own part of ~/.pixel-agents/freelance.json, next to "criterios" (features/busquedas/server/criteria.ts):
 *   { "oferta": { "titulo": "…", "servicios": ["…"], "desde": "…", … }, "modelo": "sonnet", "criterios": [ … ] }
 * Read on every call (the owner may edit it by hand); writes keep every other key.
 */
export function createFreelanceConfig(
  file: string,
  defaultOffer: FreelanceOffer = FREELANCE_DEFAULT_OFFER,
) {
  function readFile(): Raw {
    try {
      return obj(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
      return {};
    }
  }

  return {
    /** The owner's offer, or the factory example (isExample) until he writes a different one. */
    readOffer(): { offer: FreelanceOffer; isExample: boolean } {
      const offer = offerFromFile(readFile().oferta);
      if (!offer) return { offer: defaultOffer, isExample: true };
      return { offer, isExample: sameOffer(offer, defaultOffer) };
    },
    /** Checks and writes; false when nothing valid came. */
    saveOffer(spec: unknown): boolean {
      const offer = offerFromWire(spec);
      if (!offer) return false;
      let other: Raw = {};
      try {
        other = obj(JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch {
        // new file (or unreadable: the criteria store treats it the same way)
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...other, oferta: offer }, null, 2) + '\n');
      fs.renameSync(tmp, file);
      return true;
    },
    /** "modelo": the Claude Code model of the search agent; absent = sonnet, "" = the machine's default. */
    readModel(): string {
      const m = readFile().modelo;
      return typeof m === 'string' ? m.trim().slice(0, 64) : FREELANCE_DEFAULT_MODEL;
    },
  };
}

export type FreelanceConfig = ReturnType<typeof createFreelanceConfig>;
