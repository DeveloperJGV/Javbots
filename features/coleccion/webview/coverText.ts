import type { ColeccionCoverProgress, ColeccionCoverState } from '../../../core/src/messages.js';
import { type CoverArt, defaultCondition, runSearches } from '../core/cover.js';
import type { Game } from '../core/types.js';
import type { ColeccionState } from './coleccionStore.js';
import { platformName } from './coleccionText.js';
import { COVER_SEARCH_URL } from './constants.js';

/** Where a cover came from, in words. */
export function sourceName(source: string | undefined): string {
  if (source === 'libretro') return 'libretro-thumbnails';
  if (source === 'igdb') return 'IGDB';
  if (source === 'subida') return 'Subida a mano';
  return 'otra fuente';
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "16 nov 2026" from an ISO time ("" when it isn't one). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : '';
}

/** The small print under a cover: "Portada: libretro-thumbnails · 16 nov 2026". */
export function coverCaption(cover: CoverArt): string {
  const when = shortDate(cover.at);
  const from = cover.source === 'subida' ? 'subida a mano' : sourceName(cover.source);
  return `Portada: ${from}${when ? ` · ${when}` : ''}`;
}

/** Why a search found nothing, in words, for one game. */
export function reasonText(
  reason: string | undefined,
  game: Pick<Game, 'title' | 'platform'>,
  needsKey?: boolean,
): string {
  const p = platformName(game.platform);
  const key = needsKey ? ' Con la llave de IGDB también se buscaría ahí.' : '';
  switch (reason) {
    case 'sin-cobertura':
      return `Ni libretro ni IGDB tienen portadas de ${p}.`;
    case 'pocas':
      return `libretro casi no tiene ${p}.${key}`;
    case 'sin-llave':
      return `libretro no tiene ${p}, y falta la llave de IGDB (o no funcionó).`;
    case 'sin-respuesta':
      return 'La fuente no contestó: vuelve a intentar en un rato.';
    case 'sin-coincidencia':
      return `No hubo coincidencia con «${game.title}».${key}`;
    case 'cambio':
      return 'Cambiaste el nombre o la consola: la portada de antes ya no era de este juego. Búscala de nuevo.';
    default:
      return 'No se encontró.';
  }
}

/** The same reasons, short, for the run's summary ("3 · no hubo coincidencia"). */
export function reasonShort(reason: string): string {
  switch (reason) {
    case 'sin-cobertura':
      return 'ninguna fuente tiene esa consola';
    case 'pocas':
      return 'libretro casi no tiene esa consola';
    case 'sin-llave':
      return 'falta la llave de IGDB';
    case 'sin-respuesta':
      return 'la fuente no contestó: vuelve a intentar';
    case 'sin-coincidencia':
      return 'no hubo coincidencia';
    case 'cambio':
      return 'cambió el nombre o la consola';
    default:
      return 'otro motivo';
  }
}

/** What a game's last search says, in one line (empty while there is nothing to say). */
export function searchLine(state: ColeccionCoverState | undefined, game: Game): string {
  if (!state) return '';
  switch (state.state) {
    case 'buscando':
      return 'Buscando portada…';
    case 'encontrada':
      return `Encontrada en ${sourceName(state.source)}${state.label ? `: ${state.label}` : ''}.`;
    case 'elige':
      return 'Elige una:';
    case 'nada':
      if (state.reason === 'cambio') return reasonText('cambio', game);
      return `${game.coverArt ? 'No encontré otras.' : 'No encontrada.'} ${reasonText(state.reason, game, state.needsKey)}`;
  }
}

/** What the case says of a «Ninguna» the person gave. */
export const NONE_TEXT =
  'Dijiste «Ninguna»: «Buscar las que faltan» ya no la busca. «Buscar otra vez» vuelve a intentarlo.';

/** "Con caja" / "Suelto" / "Sellado" for the case, saying when it is the console's default. */
export function conditionNote(game: Pick<Game, 'condition' | 'platform'>): string {
  if (!game.condition) {
    const d = defaultCondition(game.platform);
    return `${d === 'suelto' ? 'Suelto' : 'Con caja'}, de fábrica para esta consola`;
  }
  if (game.condition === 'sellado') return 'Sellado, con caja';
  return game.condition === 'suelto' ? 'Suelto' : 'Con caja';
}

/** The image search the person opens by hand: "<title> <console> box art". */
export function searchYourselfUrl(game: Pick<Game, 'title' | 'platform'>): string {
  return `${COVER_SEARCH_URL}${encodeURIComponent(`${game.title} ${platformName(game.platform)} box art`)}`;
}

/** Why an upload can't go, before sending it (null: it can). */
export function uploadProblem(
  file: { type: string; size: number },
  types: readonly string[],
  maxBytes: number,
): string | null {
  if (!types.includes(file.type)) return 'Solo PNG, JPG o WEBP.';
  if (file.size > maxBytes) return `Pesa más de ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  if (file.size === 0) return 'El archivo está vacío.';
  return null;
}

/** What the server's answer to an upload means. */
export function uploadErrorText(status: number): string {
  if (status === 401) return 'Esta página no tiene la llave de la oficina.';
  if (status === 404) return 'No encontré ese juego.';
  if (status === 413) return 'La imagen pesa demasiado (4 MB como mucho).';
  if (status === 415) return 'Eso no es una imagen PNG, JPG o WEBP.';
  return 'No se pudo subir la imagen.';
}

/**
 * Games «Buscar las que faltan» would look for, by the server's own rule (core/cover.ts runSearches): owned,
 * without a cover, and not settled (a choice waiting, «Ninguna», or already known not to be there).
 */
export function missingCovers(
  games: readonly Game[],
  covers: readonly ColeccionCoverState[] = [],
  hasKey = false,
): number {
  const last = new Map(covers.map((c) => [c.id, c]));
  return games.filter((g) => runSearches(g, last.get(g.id), hasKey)).length;
}

/**
 * The next game waiting for the person to choose its cover, in shelf order, after `currentId` (from the start when
 * it is not one of them); the ones closed with «Ninguna» are skipped, and so is `openId` (the case open now: «the
 * next» is never the one already in front). Undefined when none other is waiting.
 */
export function nextToChoose(
  order: readonly string[],
  covers: readonly ColeccionCoverState[],
  currentId?: string,
  dismissed: Readonly<Record<string, string>> = {},
  openId?: string,
): string | undefined {
  const waiting = new Set(
    covers.filter((c) => c.state === 'elige' && dismissed[c.id] !== c.stamp).map((c) => c.id),
  );
  const list = order.filter((id) => waiting.has(id) && id !== openId);
  if (list.length === 0) return undefined;
  const at = currentId ? order.indexOf(currentId) : -1;
  return list.find((id) => order.indexOf(id) > at && id !== currentId) ?? list[0];
}

/** "12 de 40 · 8 encontradas · 2 por elegir · 2 no" (the run's line). */
export function runLine(run: ColeccionCoverProgress): string {
  const parts = [`${run.done} de ${run.total}`];
  parts.push(`${run.found} ${run.found === 1 ? 'encontrada' : 'encontradas'}`);
  if (run.choose) parts.push(`${run.choose} por elegir`);
  if (run.notFound) parts.push(`${run.notFound} no`);
  if (run.failed) parts.push(`${run.failed} sin respuesta`);
  return parts.join(' · ');
}

/** What the run left alone, in words ("" when nothing). */
export function skippedLine(run: Pick<ColeccionCoverProgress, 'skipped'>): string {
  if (!run.skipped) return '';
  return `${run.skipped === 1 ? 'Se saltó 1' : `Se saltaron ${run.skipped}`} ya vistos (por elegir, «Ninguna» o que no están).`;
}

/** The run's little box over the shelves shows now: open (the list leaves room under it), folded, or not at all. */
export function floatingRun(state: ColeccionState): 'open' | 'min' | null {
  const run = state.status?.coverRun;
  if (!run || state.view.kind === 'covers') return null;
  const finished = !run.running && !!run.finishedAt;
  if (!run.running && !finished) return null;
  if (finished && state.dismissedRun === run.finishedAt) return null;
  return state.runMinimized ? 'min' : 'open';
}
