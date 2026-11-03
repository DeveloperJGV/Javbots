const DAY_MS = 86_400_000;

/** "2027-02-26" or an ISO date-time → that calendar day at local midnight. */
function dayOf(start: string): Date {
  const [y, m, d] = start.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from today to the concert's day (0 = today, negative = it already passed). */
export function daysUntil(start: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dayOf(start).getTime() - today.getTime()) / DAY_MS);
}

export function daysLeftText(days: number): string {
  if (days < 0) return 'ya pasó';
  if (days === 0) return '¡hoy!';
  if (days === 1) return '¡mañana!';
  return `faltan ${days} días`;
}

/** "vie 26 feb 2027, 20:30" (time only when the event has one). */
export function dateText(start: string, allDay: boolean): string {
  const day = dayOf(start).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (allDay || start.length <= 10) return day;
  // Ticketmaster's local time has no offset; Google's carries one: show what the string says either way.
  const time = start.slice(11, 16);
  return `${day}, ${time}`;
}

/** The tickets glow when the next concert is this close. */
export const CONCERT_SOON_DAYS = 14;
