const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD, in local time. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "Servicio: X · hoy, martes 3 de noviembre, 10:00" (or "todo el día"). */
export function scheduleSummary(
  d: { title: string; date: string; time?: string },
  today: string,
): string {
  const [y, m, day] = d.date.split('-').map(Number);
  const when = new Date(y, m - 1, day);
  const name = `${DAYS[when.getDay()]} ${day} de ${MONTHS[m - 1]}`;
  const prefix = d.date === today ? 'hoy, ' : '';
  return `${d.title} · ${prefix}${name}, ${d.time ?? 'todo el día'}`;
}
