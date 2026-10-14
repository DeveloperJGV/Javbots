import {
  COVER_ID_PATTERN,
  COVER_URL_PREFIX,
  MAX_TEXT_LENGTH,
  SPOTIFY_IMAGE_URL,
} from './constants.js';

/** What the Spicetify extension posts (see features/musica/spicetify/javbots-musica.js). */
export interface TrackReport {
  title: string;
  artist: string;
  album?: string;
  /** Normalized `https://i.scdn.co/image/<id>`, or undefined when absent or not Spotify's CDN. */
  coverUrl?: string;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  /** Spotify Connect device when it is not this computer (e.g. an Echo Dot). */
  device?: string;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function millis(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Spotify gives covers as `spotify:image:<id>` (or already as the CDN URL).
 * Only ids that look like Spotify's hex ids map to a URL: anything else is
 * dropped, so a report can never make the server download from elsewhere.
 */
export function coverUrlFrom(image: unknown): string | undefined {
  if (typeof image !== 'string') return undefined;
  let id: string | undefined;
  if (image.startsWith('spotify:image:')) id = image.slice('spotify:image:'.length);
  else id = SPOTIFY_IMAGE_URL.exec(image)?.[1];
  return id && COVER_ID_PATTERN.test(id) ? COVER_URL_PREFIX + id : undefined;
}

/**
 * Validate a report body. `{ track: null }` (or no track) means nothing is
 * playing → returns null. Malformed bodies → undefined (rejected).
 */
export function parseTrackReport(body: unknown): TrackReport | null | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const track = (body as { track?: unknown }).track;
  if (track === null || track === undefined) return null;
  if (typeof track !== 'object') return undefined;
  const t = track as Record<string, unknown>;
  const title = text(t.title);
  if (!title) return undefined;
  const durationMs = millis(t.durationMs);
  return {
    title,
    artist: text(t.artist) ?? '',
    album: text(t.album),
    coverUrl: coverUrlFrom(t.image),
    isPaused: t.isPaused === true,
    positionMs: Math.min(millis(t.positionMs), durationMs || Infinity),
    durationMs,
    device: text(t.device),
  };
}
