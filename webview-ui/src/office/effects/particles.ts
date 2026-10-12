import {
  CONFETTI_BURST_COUNT,
  CONFETTI_BURST_SPEED_PX_PER_SEC,
  CONFETTI_COLORS,
  CONFETTI_GRAVITY_PX_PER_SEC2,
  CONFETTI_LIFE_SEC,
  CONFETTI_RAIN_FALL_PX_PER_SEC,
  DUST_COLORS,
  DUST_LIFE_SEC,
  DUST_SPAWN_SEC,
  FIRE_TRAIL_COLORS,
  FIRE_TRAIL_GAP_PX,
  FIRE_TRAIL_LENGTH_PX,
  FIRE_TRAIL_LIFE_SEC,
  FLUX_SPARK_COLORS,
  FLUX_SPARK_COUNT,
  FLUX_SPARK_LIFE_SEC,
  FLUX_SPARK_SPEED_PX_PER_SEC,
  MAX_PARTICLES,
  PAPER_CHANCE,
  PAPER_COLORS,
  PORTAL_BLUE_SPARKS,
  PORTAL_ORANGE_SPARKS,
  PORTAL_SPARK_LIFE_SEC,
  PORTAL_SPARK_SPAWN_SEC,
  SPARK_COLORS,
  SPARK_COUNT,
  SPARK_GRAVITY_PX_PER_SEC2,
  SPARK_LIFE_SEC,
  SPARK_SPEED_PX_PER_SEC,
  STEAM_COLOR,
  STEAM_LIFE_SEC,
  STEAM_RISE_PX_PER_SEC,
  STEAM_SPAWN_SEC,
  TEAR_COLORS,
  TEAR_COUNT,
  TEAR_LIFE_SEC,
  TELEPORT_BEAM_COLORS,
  TELEPORT_BEAM_COUNT,
  TELEPORT_BEAM_DURATION_SEC,
  TELEPORT_BEAM_HALF_WIDTH_PX,
  TELEPORT_BEAM_HEIGHT_PX,
  TELEPORT_BEAM_HOLD_FRACTION,
  TELEPORT_BEAM_LIFE_SEC,
  TELEPORT_BEAM_RISE_PX_PER_SEC,
  TELEPORT_BEAM_SPAWN_SEC,
} from '../../constants.js';
import type { FurnitureInstance } from '../types.js';

/**
 * Tiny pixel particles: steam over coffee mugs, sparks when an agent finishes
 * its turn, dust motes and the odd paper scrap drifting off bookshelves and
 * whiteboards. Positions are in sprite px (map space); each particle draws as
 * whole sprite pixels, and fades in steps rather than smoothly. Drawing
 * lives in particleRender.ts so this module stays DOM-free (and testable).
 */

/** `confetti` (party mode, Fase 5.5) glows like sparks and flutters like paper. */
export type ParticleKind = 'steam' | 'spark' | 'dust' | 'paper' | 'confetti';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Vertical acceleration (gravity for sparks). */
  ay: number;
  age: number;
  life: number;
  color: string;
  /** Width in sprite px (paper scraps are 2 wide). */
  w: number;
  /** Side-to-side wobble phase. */
  phase: number;
}

/** Where furniture emits from, in sprite px from its top-left. */
const STEAM_SOURCES: Record<string, { x: number; y: number }> = {
  COFFEE: { x: 12, y: 0 },
  COFFEE_MAKER: { x: 7, y: 14 },
};
const DUST_SOURCES = new Set(['BOOKSHELF', 'DOUBLE_BOOKSHELF', 'WHITEBOARD']);
/** Portals shed sparkles off their rim: oval center and radii in sprite px, and their colors. */
const SPARKLE_SOURCES: Record<
  string,
  { cx: number; cy: number; rx: number; ry: number; colors: readonly string[] }
> = {
  PORTAL_BLUE: { cx: 8, cy: 17, rx: 6, ry: 13, colors: PORTAL_BLUE_SPARKS },
  PORTAL_ORANGE: { cx: 8, cy: 17, rx: 6, ry: 13, colors: PORTAL_ORANGE_SPARKS },
};

function baseType(type: string | undefined): string {
  if (!type) return '';
  const colon = type.indexOf(':');
  return colon < 0 ? type : type.slice(0, colon);
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

/** A teleporter beam in progress: the steady column at (x, y), the base of the capsule glass. */
export interface TeleportBeam {
  x: number;
  y: number;
  age: number;
  spawnTimer: number;
}

/** Strength of a beam's column: full while it holds, then down in pixel-art steps, 0 when done. */
export function beamStrength(age: number): number {
  const hold = TELEPORT_BEAM_DURATION_SEC * TELEPORT_BEAM_HOLD_FRACTION;
  if (age >= TELEPORT_BEAM_DURATION_SEC) return 0;
  if (age < hold) return 1;
  const left = 1 - (age - hold) / (TELEPORT_BEAM_DURATION_SEC - hold);
  return left > 0.5 ? 0.66 : 0.33;
}

/** Opacity steps a particle fades through (pixel art: no smooth fades). */
export function steppedAlpha(age: number, life: number): number {
  const left = 1 - age / life;
  if (left > 0.66) return 1;
  if (left > 0.33) return 0.66;
  return 0.33;
}

export class ParticleSystem {
  particles: Particle[] = [];
  beams: TeleportBeam[] = [];
  private steamTimers = new Map<string, number>();
  private sparkleTimers = new Map<string, number>();
  private dustTimer = DUST_SPAWN_SEC;
  private rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  private add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  /** A burst of sparks above a character's head. */
  burstSparks(x: number, y: number): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      // Fan upward: −160°…−20°
      const angle = -Math.PI * (0.11 + this.rand() * 0.78);
      const speed = SPARK_SPEED_PX_PER_SEC * (0.5 + this.rand() * 0.6);
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ay: SPARK_GRAVITY_PX_PER_SEC2,
        age: 0,
        life: SPARK_LIFE_SEC * (0.7 + this.rand() * 0.5),
        color: pick(SPARK_COLORS, this.rand),
        w: 1,
        phase: 0,
      });
    }
  }

  /** 88 mph (fork, Fase 3): flux-capacitor sparks all around (x, y) and two
   *  fire trails left on the floor, burning out from the far end. Uses the
   *  spark kind so it glows over the night tint. */
  burst88mph(x: number, y: number): void {
    for (let i = 0; i < FLUX_SPARK_COUNT; i++) {
      const angle = (i / FLUX_SPARK_COUNT) * Math.PI * 2 + this.rand() * 0.3;
      const speed = FLUX_SPARK_SPEED_PX_PER_SEC * (0.6 + this.rand() * 0.6);
      this.add({
        kind: 'spark',
        x,
        y: y - 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6,
        ay: 0,
        age: 0,
        life: FLUX_SPARK_LIFE_SEC * (0.7 + this.rand() * 0.5),
        color: pick(FLUX_SPARK_COLORS, this.rand),
        w: 1,
        phase: 0,
      });
    }
    for (let i = 0; i < FIRE_TRAIL_LENGTH_PX; i++) {
      for (const dy of [-FIRE_TRAIL_GAP_PX / 2, FIRE_TRAIL_GAP_PX / 2]) {
        this.add({
          kind: 'spark',
          x: x + 4 + i,
          y: y + dy,
          vx: 0,
          vy: 0,
          ay: 0,
          age: 0,
          // The end nearest the agent burns longest
          life: FIRE_TRAIL_LIFE_SEC * (1 - (i / FIRE_TRAIL_LENGTH_PX) * 0.6),
          color: pick(FIRE_TRAIL_COLORS, this.rand),
          w: 1,
          phase: 0,
        });
      }
    }
  }

  /** Teleport beam (Mega Man): a steady column of light standing on (x, y), the base of
   *  the capsule glass, for TELEPORT_BEAM_DURATION_SEC, with sparks rising in it. A new
   *  beam on the same capsule restarts it instead of stacking. */
  burstTeleport(x: number, y: number): void {
    this.beams = this.beams.filter((b) => b.x !== x || b.y !== y);
    this.beams.push({ x, y, age: 0, spawnTimer: TELEPORT_BEAM_SPAWN_SEC });
    for (let i = 0; i < TELEPORT_BEAM_COUNT; i++) this.addBeamSpark(x, y);
  }

  private addBeamSpark(x: number, y: number): void {
    this.add({
      kind: 'spark',
      x: x + Math.round((this.rand() * 2 - 1) * TELEPORT_BEAM_HALF_WIDTH_PX),
      y: y - this.rand() * TELEPORT_BEAM_HEIGHT_PX,
      vx: 0,
      vy: -TELEPORT_BEAM_RISE_PX_PER_SEC * (0.6 + this.rand() * 0.8),
      ay: 0,
      age: 0,
      life: TELEPORT_BEAM_LIFE_SEC * (0.5 + this.rand() * 0.5),
      color: pick(TELEPORT_BEAM_COLORS, this.rand),
      w: 1,
      phase: 0,
    });
  }

  /** A handful of confetti thrown up from (x, y): a finished turn's small cheer. */
  burstConfetti(x: number, y: number, count = CONFETTI_BURST_COUNT): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.15 + this.rand() * 0.7);
      const speed = CONFETTI_BURST_SPEED_PX_PER_SEC * (0.5 + this.rand() * 0.7);
      this.add({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ay: CONFETTI_GRAVITY_PX_PER_SEC2,
        age: 0,
        life: CONFETTI_LIFE_SEC * (0.7 + this.rand() * 0.5),
        color: pick(CONFETTI_COLORS, this.rand),
        w: this.rand() < 0.4 ? 2 : 1,
        phase: this.rand() * Math.PI * 2,
      });
    }
  }

  /** One piece of party confetti falling from the top of a w×h dance floor to its bottom. */
  rainConfetti(x: number, y: number, w: number, h: number): void {
    const vy = CONFETTI_RAIN_FALL_PX_PER_SEC * (0.7 + this.rand() * 0.6);
    this.add({
      kind: 'confetti',
      x: x + this.rand() * w,
      y: y - this.rand() * 4,
      vx: (this.rand() - 0.5) * 4,
      vy,
      ay: 0,
      age: 0,
      life: (h / vy) * (0.75 + this.rand() * 0.25),
      color: pick(CONFETTI_COLORS, this.rand),
      w: this.rand() < 0.4 ? 2 : 1,
      phase: this.rand() * Math.PI * 2,
    });
  }

  /** Tears (The Binding of Isaac): drops arcing out of both eyes when a tool fails. */
  burstTears(x: number, y: number): void {
    for (let i = 0; i < TEAR_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.add({
        kind: 'spark',
        x: x + side * 2,
        y,
        vx: side * (8 + this.rand() * 10),
        vy: -(6 + this.rand() * 8),
        ay: SPARK_GRAVITY_PX_PER_SEC2,
        age: 0,
        life: TEAR_LIFE_SEC * (0.7 + this.rand() * 0.5),
        color: pick(TEAR_COLORS, this.rand),
        w: 1,
        phase: 0,
      });
    }
  }

  update(dt: number, furniture: FurnitureInstance[], ambientEnabled: boolean): void {
    // Age and move
    let write = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.particles[write++] = p;
    }
    this.particles.length = write;

    // Teleporter beams: keep the column standing and sparks rising in it
    for (const b of this.beams) {
      b.age += dt;
      b.spawnTimer -= dt;
      while (b.spawnTimer <= 0 && b.age < TELEPORT_BEAM_DURATION_SEC) {
        b.spawnTimer += TELEPORT_BEAM_SPAWN_SEC;
        this.addBeamSpark(b.x, b.y);
      }
    }
    this.beams = this.beams.filter((b) => b.age < TELEPORT_BEAM_DURATION_SEC);

    if (!ambientEnabled) return;

    // Steam
    const seen = new Set<string>();
    for (const f of furniture) {
      const src = STEAM_SOURCES[baseType(f.type)];
      if (!src) continue;
      const key = `${f.x},${f.y}`;
      seen.add(key);
      const t = (this.steamTimers.get(key) ?? this.rand() * STEAM_SPAWN_SEC) - dt;
      if (t > 0) {
        this.steamTimers.set(key, t);
        continue;
      }
      this.steamTimers.set(key, STEAM_SPAWN_SEC * (0.7 + this.rand() * 0.6));
      this.add({
        kind: 'steam',
        x: f.x + src.x + Math.floor(this.rand() * 3) - 1,
        y: f.y + src.y - 1,
        vx: 0,
        vy: -STEAM_RISE_PX_PER_SEC * (0.8 + this.rand() * 0.4),
        ay: 0,
        age: 0,
        life: STEAM_LIFE_SEC * (0.8 + this.rand() * 0.4),
        color: STEAM_COLOR,
        w: 1,
        phase: this.rand() * Math.PI * 2,
      });
    }
    for (const key of this.steamTimers.keys()) {
      if (!seen.has(key)) this.steamTimers.delete(key);
    }

    // Portal sparkles: a speck off a random point of the rim, drifting outward
    const lit = new Set<string>();
    for (const f of furniture) {
      const src = SPARKLE_SOURCES[baseType(f.type)];
      if (!src) continue;
      const key = `${f.x},${f.y}`;
      lit.add(key);
      const t = (this.sparkleTimers.get(key) ?? this.rand() * PORTAL_SPARK_SPAWN_SEC) - dt;
      if (t > 0) {
        this.sparkleTimers.set(key, t);
        continue;
      }
      this.sparkleTimers.set(key, PORTAL_SPARK_SPAWN_SEC * (0.6 + this.rand() * 0.8));
      const a = this.rand() * Math.PI * 2;
      this.add({
        kind: 'spark',
        x: f.x + src.cx + Math.cos(a) * src.rx,
        y: f.y + src.cy + Math.sin(a) * src.ry,
        vx: Math.cos(a) * 4,
        vy: Math.sin(a) * 4,
        ay: 0,
        age: 0,
        life: PORTAL_SPARK_LIFE_SEC * (0.6 + this.rand() * 0.6),
        color: pick(src.colors, this.rand),
        w: 1,
        phase: 0,
      });
    }
    for (const key of this.sparkleTimers.keys()) {
      if (!lit.has(key)) this.sparkleTimers.delete(key);
    }

    // Dust and paper
    this.dustTimer -= dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = DUST_SPAWN_SEC * (0.6 + this.rand() * 0.8);
      const sources = furniture.filter((f) => DUST_SOURCES.has(baseType(f.type)));
      if (sources.length > 0) {
        const f = pick(sources, this.rand);
        const w = f.sprite[0]?.length ?? 16;
        const h = f.sprite.length;
        const paper = this.rand() < PAPER_CHANCE;
        this.add({
          kind: paper ? 'paper' : 'dust',
          x: f.x + this.rand() * w,
          y: f.y + h * (0.3 + this.rand() * 0.5),
          vx: (this.rand() - 0.5) * 2,
          vy: paper ? 9 : 1.5,
          ay: 0,
          age: 0,
          life: paper ? 2.2 : DUST_LIFE_SEC * (0.6 + this.rand() * 0.6),
          color: paper ? pick(PAPER_COLORS, this.rand) : pick(DUST_COLORS, this.rand),
          w: paper ? 2 : 1,
          phase: this.rand() * Math.PI * 2,
        });
      }
    }
  }
}
