import type { DayNightMode } from '../../../../core/src/messages.js';
import type { Character, FurnitureInstance, TileType as TileTypeVal } from '../types.js';
import { TILE_SIZE, TileType } from '../types.js';
import type { Ambient } from './dayNight.js';
import type { LightSource } from './lighting.js';
import { collectLights, computeLightmap, currentAmbient, moonlightFor } from './lighting.js';

/** Canvas side of the lighting: caches the lightmap and draws it scaled up. */

let lightCanvas: HTMLCanvasElement | null = null;
let lightKey = '';

function lightmapKey(
  ambient: Ambient,
  lights: LightSource[],
  tileMap: TileTypeVal[][],
  cols: number,
  rows: number,
): string {
  const l = lights
    .map((s) => `${Math.round(s.x)},${Math.round(s.y)},${s.radius},${s.intensity.toFixed(2)}`)
    .join(';');
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
): void {
  const ambient = currentAmbient(mode);
  if (ambient.alpha <= 0 && ambient.lights <= 0) return;

  const lights = collectLights(characters, furniture, moonlightFor(ambient));
  const width = cols * TILE_SIZE;
  // One extra tile row on top for the walls that rise above row 0
  const height = (rows + 1) * TILE_SIZE;
  const originY = -TILE_SIZE;
  const key = lightmapKey(ambient, lights, tileMap, cols, rows);
  if (!lightCanvas || key !== lightKey) {
    const data = computeLightmap(
      width,
      height,
      originY,
      ambient,
      lights,
      voidTester(tileMap, cols, rows),
    );
    lightCanvas ??= document.createElement('canvas');
    lightCanvas.width = width;
    lightCanvas.height = height;
    const lctx = lightCanvas.getContext('2d')!;
    lctx.putImageData(new ImageData(data, width, height), 0, 0);
    lightKey = key;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lightCanvas, offsetX, offsetY + originY * zoom, width * zoom, height * zoom);
  ctx.restore();
}
