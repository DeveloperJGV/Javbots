import type { MusicLyricLine } from '../../../core/src/messages.js';
import {
  LOG_PREFIX,
  LRCLIB_MAX_DURATION_GAP_SEC,
  LRCLIB_SEARCH_URL,
  LRCLIB_URL,
  LRCLIB_USER_AGENT,
  LYRICS_FETCH_TIMEOUT_MS,
  LYRICS_MAX_LINE_LENGTH,
  LYRICS_MAX_LINES,
  LYRICS_MIN_TEXT_LENGTH,
} from './constants.js';

export interface Lyrics {
  synced: boolean;
  source: 'spotify' | 'lrclib';
  lines: MusicLyricLine[];
}

/** Which song a piece of lyrics belongs to (reports and lyrics arrive separately). */
export function songKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`;
}

/**
 * Clean a list of lines: clipped text, sane times, capped count. Returns
 * undefined when what is left is too little to be real lyrics (community
 * sources sometimes hold placeholders like "probe").
 */
export function cleanLines(raw: unknown, synced: boolean): MusicLyricLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lines: MusicLyricLine[] = [];
  for (const item of raw.slice(0, LYRICS_MAX_LINES)) {
    if (!item || typeof item !== 'object') continue;
    const { text, timeMs } = item as { text?: unknown; timeMs?: unknown };
    if (typeof text !== 'string') continue;
    const line: MusicLyricLine = { text: text.trim().slice(0, LYRICS_MAX_LINE_LENGTH) };
    if (synced) {
      const t = typeof timeMs === 'number' ? timeMs : Number(timeMs);
      if (!Number.isFinite(t) || t < 0) continue;
      line.timeMs = Math.round(t);
    }
    lines.push(line);
  }
  if (synced) lines.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
  const textLength = lines.reduce((n, l) => n + l.text.replace(/[♪\s]/g, '').length, 0);
  return textLength >= LYRICS_MIN_TEXT_LENGTH ? lines : undefined;
}

/** `[mm:ss.xx] text` lines (LRC) → timed lines. Lines without a time are skipped. */
export function parseLrc(lrc: string): { text: string; timeMs: number }[] {
  const out: { text: string; timeMs: number }[] = [];
  for (const row of lrc.split(/\r?\n/)) {
    const m = /^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(row);
    if (!m) continue;
    out.push({ timeMs: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text: m[3].trim() });
  }
  return out;
}

type Fetcher = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

interface LrclibRecord {
  instrumental?: boolean;
  duration?: number;
  syncedLyrics?: unknown;
  plainLyrics?: unknown;
}

/** One LRCLIB record → lyrics (synced if it has them, else plain), or undefined if it holds nothing usable. */
function fromRecord(record: LrclibRecord): Lyrics | undefined {
  if (record.instrumental) return undefined;
  if (typeof record.syncedLyrics === 'string') {
    const lines = cleanLines(parseLrc(record.syncedLyrics), true);
    if (lines) return { synced: true, source: 'lrclib', lines };
  }
  if (typeof record.plainLyrics === 'string') {
    const lines = cleanLines(
      record.plainLyrics.split(/\r?\n/).map((text) => ({ text })),
      false,
    );
    if (lines) return { synced: false, source: 'lrclib', lines };
  }
  return undefined;
}

/**
 * Best search result: usable lyrics, a duration close to the song's (when both are known), synced before plain,
 * then the closest duration.
 */
export function pickSearchResult(records: LrclibRecord[], durationMs: number): Lyrics | undefined {
  const seconds = durationMs / 1000;
  const scored = records
    .map((r) => ({
      lyrics: fromRecord(r),
      gap: seconds > 0 && r.duration ? Math.abs(r.duration - seconds) : 0,
    }))
    .filter(
      (c): c is { lyrics: Lyrics; gap: number } =>
        Boolean(c.lyrics) && c.gap <= LRCLIB_MAX_DURATION_GAP_SEC,
    )
    .sort((a, b) => Number(b.lyrics.synced) - Number(a.lyrics.synced) || a.gap - b.gap);
  return scored[0]?.lyrics;
}

/**
 * Look the song up in LRCLIB (free, community-made). The exact lookup wants title, artist, album and duration to
 * match LRCLIB's record, and Spotify's album often differs (single vs. album, remasters): when it misses, search by
 * title and artist and keep the closest match.
 */
export async function fetchLrclib(
  song: { title: string; artist: string; album?: string; durationMs: number },
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Lyrics | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LYRICS_FETCH_TIMEOUT_MS);
  const get = (url: string) =>
    fetcher(url, { signal: controller.signal, headers: { 'User-Agent': LRCLIB_USER_AGENT } });
  try {
    const exact = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
    if (song.album) exact.set('album_name', song.album);
    if (song.durationMs > 0) exact.set('duration', String(Math.round(song.durationMs / 1000)));
    const res = await get(`${LRCLIB_URL}?${exact.toString()}`);
    if (res.ok) {
      const found = fromRecord((await res.json()) as LrclibRecord);
      if (found) return found;
    }
    const search = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
    const results = await get(`${LRCLIB_SEARCH_URL}?${search.toString()}`);
    if (!results.ok) return undefined;
    const records = (await results.json()) as unknown;
    return Array.isArray(records)
      ? pickSearchResult(records as LrclibRecord[], song.durationMs)
      : undefined;
  } catch (err) {
    console.warn(`${LOG_PREFIX} LRCLIB no respondió:`, (err as Error).message);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
