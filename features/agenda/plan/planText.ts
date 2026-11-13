import type { AgendaPlanDay } from '../../../core/src/messages.js';

/** "15 min", "1 h", "1 h 15". */
export function minutesText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${String(rest).padStart(2, '0')}` : `${m / 60} h`;
}

/** How many blocks ("ratos") a day's minutes are. */
export function blockCount(minutes: number, blockMinutes: number): number {
  return blockMinutes > 0 ? Math.round(minutes / blockMinutes) : 0;
}

/** "3 ratos" / "1 rato". */
export function blocksText(minutes: number, blockMinutes: number): string {
  const n = blockCount(minutes, blockMinutes);
  return `${n} ${n === 1 ? 'rato' : 'ratos'}`;
}

/** "3 ratos · 1 h 30" (empty for a day with nothing planned). */
export function dayTotalText(day: AgendaPlanDay, blockMinutes: number): string {
  if (!day.blocks.length) return '';
  return `${blocksText(day.minutes, blockMinutes)} · ${minutesText(day.minutes)}`;
}

/** "A, B y C". */
function listText(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** The morning summary: "Hoy toca: 3 ratos (1 h 30): A, B y C". Empty when nothing is planned. */
export function morningText(day: AgendaPlanDay, blockMinutes: number): string {
  if (!day.blocks.length) return '';
  const titles = day.blocks.map((b) => b.title);
  const total = `${blocksText(day.minutes, blockMinutes)} (${minutesText(day.minutes)})`;
  return `Hoy toca: ${total}: ${listText([...new Set(titles)])}`;
}

/** "En 10 min: Regar el pasto (10 min)". */
export function reminderText(title: string, minutes: number, inMinutes: number): string {
  return `En ${inMinutes} min: ${title} (${minutesText(minutes)})`;
}
