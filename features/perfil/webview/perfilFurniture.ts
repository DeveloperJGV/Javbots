import type { PerfilProfile } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  PERFIL_BAR_COLOR,
  PERFIL_BARS,
  PERFIL_CACHE_MAX,
  PERFIL_CODE_MAX,
  PERFIL_CODE_POS,
  PERFIL_CURSOR,
  PERFIL_CURSOR_BLINK_SEC,
  PERFIL_CURSOR_IDLE,
  PERFIL_GLYPHS,
  PERFIL_TEXT_COLOR,
  PERFIL_TRACK_COLOR,
} from './constants.js';
import { isPerfilFurniture } from './perfilStore.js';

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();

/** Length in px of a bar for `percent` (0–100) on a track `width` px wide: at least 1 px for anything above 0. */
export function barLength(percent: number, width: number): number {
  const p = Math.max(0, Math.min(100, percent));
  return p === 0 ? 0 : Math.max(1, Math.round((p / 100) * width));
}

/**
 * The screen with the profile painted on it: the code on top (up to PERFIL_CODE_MAX letters), one bar per trait
 * (up to PERFIL_BARS.max) and a blinking cursor. Without a profile (no file, or a page without the token) it is an
 * empty terminal with just the cursor, so the public office shows nothing personal.
 */
export function perfilScreenSprite(
  sprite: SpriteData,
  profile: PerfilProfile | undefined,
  cursorOn: boolean,
): SpriteData {
  const code = (profile?.code ?? '').toUpperCase().slice(0, PERFIL_CODE_MAX);
  const bars = (profile?.traits ?? []).slice(0, PERFIL_BARS.max).map((t) => t.percent);
  const key = `${code}|${bars.join(',')}|${cursorOn ? 1 : 0}`;
  let variants = cache.get(sprite);
  if (!variants) {
    variants = new Map();
    cache.set(sprite, variants);
  }
  const hit = variants.get(key);
  if (hit) return hit;
  if (variants.size >= PERFIL_CACHE_MAX) variants.clear();

  const out = sprite.map((row) => row.slice());
  const set = (x: number, y: number, color: string) => {
    if (out[y]?.[x] !== undefined) out[y][x] = color;
  };

  [...code].forEach((ch, i) => {
    const glyph = PERFIL_GLYPHS[ch];
    glyph?.forEach((line, dy) => {
      for (let dx = 0; dx < line.length; dx++)
        if (line[dx] === '#')
          set(PERFIL_CODE_POS.x + i * 4 + dx, PERFIL_CODE_POS.y + dy, PERFIL_TEXT_COLOR);
    });
  });

  bars.forEach((percent, i) => {
    const y = PERFIL_BARS.y + i * PERFIL_BARS.step;
    const lit = barLength(percent, PERFIL_BARS.width);
    for (let dy = 0; dy < PERFIL_BARS.height; dy++)
      for (let dx = 0; dx < PERFIL_BARS.width; dx++)
        set(PERFIL_BARS.x + dx, y + dy, dx < lit ? PERFIL_BAR_COLOR : PERFIL_TRACK_COLOR);
  });

  if (cursorOn) {
    const c = profile ? PERFIL_CURSOR : PERFIL_CURSOR_IDLE;
    for (let dx = 0; dx < c.width; dx++) set(c.x + dx, c.y, PERFIL_TEXT_COLOR);
  }

  variants.set(key, out);
  return out;
}

/** Paint every personality screen of the layout (runs with the other ambient steps, each frame). */
export function applyPerfilFurniture(
  instances: FurnitureInstance[],
  profile: PerfilProfile | undefined,
  timeSec: number,
): FurnitureInstance[] {
  const cursorOn = Math.floor(timeSec / PERFIL_CURSOR_BLINK_SEC) % 2 === 0;
  return instances.map((f) =>
    isPerfilFurniture(f.type)
      ? { ...f, sprite: perfilScreenSprite(f.sprite, profile, cursorOn) }
      : f,
  );
}
