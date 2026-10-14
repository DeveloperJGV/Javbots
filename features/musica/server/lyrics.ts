import type { MusicLyricLine } from '../../../core/src/messages.js';
import {
  LOG_PREFIX,
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

/** Look the song up in LRCLIB (free, community-made): synced lyrics if it has them, else plain. */
export async function fetchLrclib(
  song: { title: string; artist: string; album?: string; durationMs: number },
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Lyrics | undefined> {
  const params = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
  if (song.album) params.set('album_name', song.album);
  if (song.durationMs > 0) params.set('duration', String(Math.round(song.durationMs / 1000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LYRICS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(`${LRCLIB_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': LRCLIB_USER_AGENT },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      instrumental?: boolean;
      syncedLyrics?: unknown;
      plainLyrics?: unknown;
    };
    if (body.instrumental) return undefined;
    if (typeof body.syncedLyrics === 'string') {
      const lines = cleanLines(parseLrc(body.syncedLyrics), true);
      if (lines) return { synced: true, source: 'lrclib', lines };
    }
    if (typeof body.plainLyrics === 'string') {
      const lines = cleanLines(
        body.plainLyrics.split(/\r?\n/).map((text) => ({ text })),
        false,
      );
      if (lines) return { synced: false, source: 'lrclib', lines };
    }
    return undefined;
  } catch (err) {
    console.warn(`${LOG_PREFIX} LRCLIB no respondió:`, (err as Error).message);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
