import { type RefObject, useEffect, useState } from 'react';

import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { type CoverArt, sizeAllowed } from '../core/cover.js';
import { cropFor, pixelate } from '../core/pixelate.js';
import {
  COVER_CANDIDATE_PATH,
  COVER_DRAW_MAX_SIDE,
  COVER_PATH,
  NEAR_VIEW_MARGIN,
  PIXEL_CACHE_MAX,
  PIXEL_JOBS,
} from './constants.js';
import { COVER_STYLE_PARAM, type CoverStyle, coverStyleKey, parseCoverStyle } from './pieces.js';
import { drawSize, type JobResult, PixelCache, retryWait } from './pixelCache.js';

/** The cover image of a game (office token required; `v` changes with every new cover). */
export function coverUrl(id: string, at: string, token: string | null): string {
  const q = new URLSearchParams();
  if (token) q.set('token', token);
  q.set('v', at);
  return `${COVER_PATH}${encodeURIComponent(id)}?${q}`;
}

/** Where an uploaded cover goes (POST, the body is the image; the token goes in the Authorization header). */
export function uploadUrl(id: string): string {
  return `${COVER_PATH}${encodeURIComponent(id)}`;
}

/** The headers of an upload: the image type and the office token as a Bearer (never in the address). */
export function uploadHeaders(type: string, token: string | null): Record<string, string> {
  return token
    ? { 'Content-Type': type, Authorization: `Bearer ${token}` }
    : { 'Content-Type': type };
}

/** Thumbnail n of a game's "elige una" (`v` = the search's stamp, so a new search never shows the old one). */
export function candidateUrl(id: string, n: number, stamp: string, token: string | null): string {
  const q = new URLSearchParams();
  if (token) q.set('token', token);
  q.set('v', stamp);
  return `${COVER_CANDIDATE_PATH}${encodeURIComponent(id)}/${n}?${q}`;
}

/** The look of the pixelated covers: `?portadas=24x8` in the address, or the default. Read once per page. */
let style: CoverStyle | null = null;
export function coverStyle(): CoverStyle {
  if (!style) style = parseCoverStyle(typeof window === 'undefined' ? '' : window.location.search);
  return style;
}
export { COVER_STYLE_PARAM };

/** Finished pixel art only (small canvases), a few made at a time; the downloaded images are never kept. */
const cache = new PixelCache<HTMLCanvasElement>({
  max: PIXEL_CACHE_MAX,
  concurrency: PIXEL_JOBS,
  yieldTo: () => new Promise((r) => setTimeout(r, 0)),
});
/** The newest cover date of each game, to forget the art of older ones. */
const newest = new Map<string, string>();

function keepOnly(id: string, at: string): void {
  if (newest.get(id) === at) return;
  newest.set(id, at);
  cache.forget((k) => k.startsWith(`${id}|`) && !k.startsWith(`${id}|${at}|`));
}

/** Loads a cover; resolves with the image, or null when it could not be fetched or decoded. */
function loadImage(id: string, at: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = coverUrl(id, at, officeToken());
  });
}

/** What a piece asks for: art size, colors and how, and which part of the cover (y anchor of the crop). */
export interface PixelSpec {
  w: number;
  h: number;
  style: CoverStyle;
  anchorY: number;
}

const keyOf = (id: string, at: string, s: PixelSpec) =>
  `${id}|${at}|${s.w}x${s.h}|${coverStyleKey(s.style)}|${s.anchorY}`;

/** The pixel art if it is ready (undefined: not made yet; null: the cover is unusable). */
export function peekPixels(cover: CoverArt | undefined, id: string, s: PixelSpec) {
  return cover ? cache.peek(keyOf(id, cover.at, s)) : null;
}

/** Downloads, draws (already reduced) and pixelates one cover; the big image is let go right after. */
async function makePixels(
  id: string,
  cover: CoverArt,
  s: PixelSpec,
): Promise<JobResult<HTMLCanvasElement>> {
  const img = await loadImage(id, cover.at);
  // Not fetched (the office may not have it yet, or it did not answer): try again later
  if (!img) return undefined;
  try {
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    if (!sizeAllowed(natural)) return null;
    const size = drawSize(natural.width, natural.height, COVER_DRAW_MAX_SIDE);
    const src = document.createElement('canvas');
    src.width = size.width;
    src.height = size.height;
    const sc = src.getContext('2d');
    if (!sc) return null;
    sc.drawImage(img, 0, 0, size.width, size.height);
    const data = sc.getImageData(0, 0, size.width, size.height);
    const px = pixelate(data, {
      width: s.w,
      height: s.h,
      colors: s.style.colors,
      mode: s.style.mode,
      crop: cropFor(size.width, size.height, s.w / s.h, s.anchorY),
    });
    const out = document.createElement('canvas');
    out.width = px.width;
    out.height = px.height;
    out
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
    // Only the small result stays
    src.width = 0;
    src.height = 0;
    return out;
  } catch {
    return null;
  } finally {
    img.src = '';
  }
}

/** The cover pixelated to w×h art pixels (cached by game, cover date and spec). Undefined: try again later. */
export function coverPixels(
  id: string,
  cover: CoverArt,
  s: PixelSpec,
): Promise<JobResult<HTMLCanvasElement>> {
  keepOnly(id, cover.at);
  return cache.request(keyOf(id, cover.at, s), () => makePixels(id, cover, s));
}

/**
 * True once the element comes near the visible part of the list (or right away where there is no
 * IntersectionObserver). It stays true: the art made for it is kept, small.
 */
export function useNearView(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(
    () => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined',
  );
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const root = el.closest('.col-shelves');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root, rootMargin: NEAR_VIEW_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

/**
 * A game's cover as pixel art for one piece, or null while it loads (or when it has none). Art already made shows
 * at once; a piece far from view (`fetch` false) asks for nothing new. The same cover is never pixelated twice, so the shelf does not flicker
 * when the office sends the collection again; a cover that could not be fetched is tried again a few times.
 */
export function usePixelCover(
  id: string,
  cover: CoverArt | undefined,
  spec: PixelSpec | null,
  /** False: a piece far from view only shows what is already made, and asks for nothing. */
  fetch = true,
): HTMLCanvasElement | null {
  const ready = spec ? peekPixels(cover, id, spec) : null;
  const [loaded, setLoaded] = useState<{ key: string; canvas: HTMLCanvasElement | null } | null>(
    null,
  );
  const [attempt, setAttempt] = useState({ key: '', n: 0 });
  const key = cover && spec ? keyOf(id, cover.at, spec) : '';
  const tries = attempt.key === key ? attempt.n : 0;
  useEffect(() => {
    if (!cover || !spec || !fetch || ready !== undefined) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void coverPixels(id, cover, spec).then((canvas) => {
      if (!live) return;
      if (canvas !== undefined) {
        setLoaded({ key, canvas });
        return;
      }
      const wait = retryWait(tries);
      if (wait !== null) timer = setTimeout(() => setAttempt({ key, n: tries + 1 }), wait);
    });
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // The key says everything the spec and the cover mean
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, tries, fetch]);
  if (!key) return null;
  if (ready !== undefined) return ready;
  return loaded?.key === key ? loaded.canvas : null;
}
