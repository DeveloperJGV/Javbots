import type { DayNightMode } from '../../../../core/src/messages.js';
import type { Character, FurnitureInstance, Pet, TileType as TileTypeVal } from '../types.js';
import { TILE_SIZE, TileType } from '../types.js';
import type { Ambient } from './dayNight.js';
import type { LightSource } from './lighting.js';
import {
  collectBeamLights,
  collectLights,
  collectPetLights,
  computeLightmap,
  currentAmbient,
  lightBounds,
  moonlightFor,
} from './lighting.js';
import type { TeleportBeam } from './particles.js';

/** Canvas side of the lighting: caches the lightmap and draws it scaled up.
 *  Pets move every frame, so their glows never rebuild the whole map: the
 *  still lights go into a cached base, and only a patch around each pet is
 *  recomputed and pasted over a copy of it. */

let lightCanvas: HTMLCanvasElement | null = null;
let lightKey = '';
let petCanvas: HTMLCanvasElement | null = null;
let petKey = '';

function lightsKey(lights: LightSource[]): string {
  return lights
    .map(
      (s) =>
        `${Math.round(s.x)},${Math.round(s.y)},${s.radius},${s.intensity.toFixed(2)},${s.color.join('.')}`,
    )
    .join(';');
}

function lightmapKey(
  ambient: Ambient,
  lights: LightSource[],
  tileMap: TileTypeVal[][],
  cols: number,
  rows: number,
): string {
  const l = lightsKey(lights);
  return `${cols}x${rows}|${ambient.color.join(',')}|${ambient.alpha.toFixed(3)}|${ambient.lights.toFixed(3)}|${l}|${tileMapSignature(tileMap)}`;
}

const signatureCache = new WeakMap<TileTypeVal[][], string>();

function tileMapSignature(tileMap: TileTypeVal[][]): string {
  let sig = signatureCache.get(tileMap);
  if (sig === undefined) {
    sig = tileMap.map((row) => row.map((t) => (t === TileType.VOID ? 0 : 1)).join('')).join('/');
    signatureCache.set(tileMap, sig);
  }
  return sig;
}

/** Pixels in a void tile stay clear, except the 16px a wall sprite rises
 *  above its own tile into the row above. */
function voidTester(tileMap: TileTypeVal[][], cols: number, rows: number) {
  return (x: number, y: number): boolean => {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || col >= cols) return true;
    const below = row + 1 >= 0 && row + 1 < rows ? tileMap[row + 1][col] : undefined;
    if (row < 0 || row >= rows) return below !== TileType.WALL;
    if (tileMap[row][col] !== TileType.VOID) return false;
    return below !== TileType.WALL;
  };
}

export function renderLighting(
  ctx: CanvasRenderingContext2D,
  mode: DayNightMode,
  characters: Iterable<Character>,
  furniture: FurnitureInstance[],
  tileMap: TileTypeVal[][],
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  pets: Pet[] = [],
  beams: TeleportBeam[] = [],
): void {
  const ambient = currentAmbient(mode);
  if (ambient.alpha <= 0 && ambient.lights <= 0) return;

  const lights = [
    ...collectLights(characters, furniture, moonlightFor(ambient)),
    ...collectBeamLights(beams),
  ];
  const width = cols * TILE_SIZE;
  // One extra tile row on top for the walls that rise above row 0
  const height = (rows + 1) * TILE_SIZE;
  const originY = -TILE_SIZE;
  const isVoid = voidTester(tileMap, cols, rows);
  const key = lightmapKey(ambient, lights, tileMap, cols, rows);
  const baseChanged = !lightCanvas || key !== lightKey;
  if (baseChanged) {
    const data = computeLightmap(width, height, originY, ambient, lights, isVoid);
    lightCanvas ??= document.createElement('canvas');
    lightCanvas.width = width;
    lightCanvas.height = height;
    const lctx = lightCanvas.getContext('2d')!;
    lctx.putImageData(new ImageData(data, width, height), 0, 0);
    lightKey = key;
  }

  let source = lightCanvas!;
  const petLights = ambient.lights > 0 ? collectPetLights(pets) : [];
  if (petLights.length > 0) {
    const pk = lightsKey(petLights);
    if (baseChanged || !petCanvas || pk !== petKey) {
      petCanvas ??= document.createElement('canvas');
      if (petCanvas.width !== width || petCanvas.height !== height) {
        petCanvas.width = width;
        petCanvas.height = height;
      }
      const pctx = petCanvas.getContext('2d')!;
      pctx.clearRect(0, 0, width, height);
      pctx.drawImage(lightCanvas!, 0, 0);
      const all = [...lights, ...petLights];
      for (const pl of petLights) {
        // Recompute just the patch this glow reaches, with every light in it
        const [bx0, by0, bx1, by1] = lightBounds(pl);
        const x0 = Math.max(0, Math.floor(bx0));
        const y0 = Math.max(originY, Math.floor(by0));
        const x1 = Math.min(width, Math.ceil(bx1) + 1);
        const y1 = Math.min(originY + height, Math.ceil(by1) + 1);
        if (x1 <= x0 || y1 <= y0) continue;
        const pw = x1 - x0;
        const ph = y1 - y0;
        const data = computeLightmap(pw, ph, y0, ambient, all, isVoid, x0);
        pctx.putImageData(new ImageData(data, pw, ph), x0, y0 - originY);
      }
      petKey = pk;
    }
    source = petCanvas;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, offsetX, offsetY + originY * zoom, width * zoom, height * zoom);
  ctx.restore();
}
