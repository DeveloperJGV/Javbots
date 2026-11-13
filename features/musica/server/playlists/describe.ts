import {
  PLAYLIST_MINUTES,
  PLAYLIST_REQUEST_MAX,
  PLAYLIST_REQUEST_NAME_MAX,
  PLAYLIST_REQUEST_NAME_WORDS,
} from '../constants.js';

/**
 * "Dime qué quieres": what a typed description asks for, read by rules (no AI). Pure: the caller does the
 * searching. Everything is compared without case or accents.
 */

/** What the rules understood from the text. */
export interface Description {
  /** The text as typed (trimmed, collapsed). */
  text: string;
  /** 30, 60 or 120 when the text says a length. */
  minutes?: number;
  /** Year ranges ("de los 80" → 1980-1989, "2005" → 2005-2005); empty = any. */
  years: Array<[number, number]>;
  /** "Solo lo mío", "mis me gusta", "de mis listas": only the owner's own songs. */
  onlyMine: boolean;
  /** "Mis me gusta": the liked songs are part of the material. */
  liked: boolean;
  /** "Para descubrir", "nueva": songs the owner doesn't have. */
  discover: boolean;
  /** Spotify genres for the `genre:` search filter ("rock en español" → "rock en espanol"). */
  genres: string[];
  /** The words left to search with (no stop words, nothing already understood). */
  keywords: string[];
}

/** Lower case, no accents, only letters, digits and single spaces. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ&'\s-]/g, ' ')
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does `name` appear in `text` as whole words (both folded)? */
export function containsWords(text: string, name: string): boolean {
  const n = fold(name);
  if (n.length < 2) return false;
  return ` ${fold(text)} `.includes(` ${n} `);
}

/** Spanish (and common) words → Spotify genre. Longest phrases first so "rock en español" wins over "rock". */
const GENRES: ReadonlyArray<[string, string]> = [
  ['rock en espanol', 'rock en espanol'],
  ['rock nacional', 'rock nacional'],
  ['rock alternativo', 'alternative rock'],
  ['pop latino', 'latin pop'],
  ['pop en espanol', 'latin pop'],
  ['hip hop', 'hip hop'],
  ['lo fi', 'lo-fi'],
  ['lofi', 'lo-fi'],
  ['k pop', 'k-pop'],
  ['kpop', 'k-pop'],
  ['r&b', 'r&b'],
  ['rock', 'rock'],
  ['pop', 'pop'],
  ['jazz', 'jazz'],
  ['blues', 'blues'],
  ['metal', 'metal'],
  ['punk', 'punk'],
  ['reggaeton', 'reggaeton'],
  ['regueton', 'reggaeton'],
  ['reggae', 'reggae'],
  ['cumbia', 'cumbia'],
  ['cumbias', 'cumbia'],
  ['salsa', 'salsa'],
  ['bachata', 'bachata'],
  ['merengue', 'merengue'],
  ['banda', 'banda'],
  ['norteno', 'norteno'],
  ['nortenas', 'norteno'],
  ['ranchera', 'ranchera'],
  ['rancheras', 'ranchera'],
  ['mariachi', 'mariachi'],
  ['corridos', 'corrido'],
  ['bolero', 'bolero'],
  ['boleros', 'bolero'],
  ['trova', 'trova'],
  ['ska', 'ska'],
  ['funk', 'funk'],
  ['soul', 'soul'],
  ['rap', 'rap'],
  ['electronica', 'electronic'],
  ['house', 'house'],
  ['techno', 'techno'],
  ['indie', 'indie'],
  ['folk', 'folk'],
  ['country', 'country'],
  ['clasica', 'classical'],
  ['disco', 'disco'],
  ['grunge', 'grunge'],
  ['grupera', 'grupera'],
];

/** Words that say nothing to a search. */
const STOP = new Set(
  (
    'a al algo algunas algunos asi aunque bien buena buenas bueno buenos cancion canciones como con cosa cosas cual ' +
    'de del desde donde durante e el ella en entre era es esa ese eso esta este esto estos estas ha hay hace hacer ' +
    'haz hazme la las le lo los me mi mis muy mas musica ni no nos o otra otro para pero playlist lista listas poco ' +
    'pon ponme por porque puro pura que quiero quisiera rola rolas se sea si sin sobre solo son su sus tambien te ' +
    'tipo todo toda todas todos tu tus un una uno unos unas y ya yo dame algo onda estilo rato ratito minutos minuto ' +
    'min hora horas media'
  ).split(' '),
);

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  noventa: 90,
};

/** Spoken decades. */
const DECADE_WORDS: Readonly<Record<string, number>> = {
  cincuentas: 1950,
  sesentas: 1960,
  setentas: 1970,
  ochentas: 1980,
  noventas: 1990,
  dosmiles: 2000,
};

/** Snap to 30 min / 1 h / 2 h (a tie goes to the longer one). */
export function snapMinutes(minutes: number): number {
  let best = PLAYLIST_MINUTES[0];
  for (const m of PLAYLIST_MINUTES) if (Math.abs(m - minutes) <= Math.abs(best - minutes)) best = m;
  return best;
}

/** Two digits after "los" / "años" or before "s": 60-99 → 1900s, 00-29 → 2000s. */
function decadeOf(twoOrFour: string): number | undefined {
  const n = Number(twoOrFour);
  if (!Number.isInteger(n)) return undefined;
  if (twoOrFour.length === 4) return n >= 1900 && n <= 2099 ? n - (n % 10) : undefined;
  if (twoOrFour.length !== 2 || n % 10 !== 0) return undefined;
  return n >= 50 ? 1900 + n : 2000 + n;
}

export function parseDescription(raw: string): Description {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, PLAYLIST_REQUEST_MAX);
  let rest = ` ${fold(text)} `;
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (let m = re.exec(rest); m; m = re.exec(rest)) {
      fn(m);
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    }
  };

  // ── Length ──
  let minutes: number | undefined;
  const num = (w: string) => NUMBER_WORDS[w] ?? Number(w);
  take(/ (una|1) hora y media /, () => (minutes = 90));
  take(/ media hora /, () => (minutes = 30));
  take(
    / (\d+|un|una|uno|dos|tres|cuatro) (h|hr|hrs|hora|horas) /,
    (m) => (minutes = num(m[1]) * 60),
  );
  take(/ (\d+)(h|hr|hrs) /, (m) => (minutes = Number(m[1]) * 60));
  take(
    / (\d+|treinta|cuarenta|cincuenta|sesenta|noventa) ?(min|mins|minutos|minuto) /,
    (m) => (minutes = num(m[1])),
  );
  take(/ (una|la) hora /, () => (minutes = 60));
  if (minutes !== undefined && Number.isFinite(minutes) && minutes > 0)
    minutes = snapMinutes(minutes);
  else minutes = undefined;

  // ── Years ──
  const years: Array<[number, number]> = [];
  const addDecade = (d: number | undefined) => {
    if (d !== undefined && !years.some(([a]) => a === d)) years.push([d, d + 9]);
  };
  take(/ (?:del|de|entre) (\d{4}) (?:al|a|y) (\d{4}) /, (m) => {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1900 && b >= a && b <= 2099) years.push([a, b]);
  });
  take(/ (\d{4}) (\d{4}) /, (m) => {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1900 && b >= a && b <= 2099) years.push([a, b]);
  });
  take(/ (?:los|años|anos|decada de los|decada del) (\d{2}|\d{4})s? /, (m) =>
    addDecade(decadeOf(m[1])),
  );
  take(/ (\d{2}|\d{4}) ?s /, (m) => addDecade(decadeOf(m[1])));
  take(/ (cincuentas|sesentas|setentas|ochentas|noventas|dosmiles) /, (m) =>
    addDecade(DECADE_WORDS[m[1]]),
  );
  take(/ (19[5-9]\d|20[0-2]\d) /, (m) => {
    const y = Number(m[1]);
    years.push([y, y]);
  });

  // ── Whose ──
  let onlyMine = false;
  let liked = false;
  let discover = false;
  take(/ (?:mis )?me gustas? /, () => {
    liked = true;
    onlyMine = true;
  });
  take(
    / (?:solo |puro )?(?:lo mio|mis canciones|de mis listas|que ya conozco|que conozco) /,
    () => (onlyMine = true),
  );
  take(
    / (?:para descubrir|descubrir|nuevas|nuevos|nueva|nuevo|que no conozca|que no conozco|novedades|diferente|diferentes) /,
    () => (discover = true),
  );
  if (discover) onlyMine = false;

  // ── Genres ──
  const genres: string[] = [];
  for (const [word, genre] of GENRES) {
    take(new RegExp(` ${word.replace(/[&]/g, '\\&')} `), () => {
      if (!genres.includes(genre)) genres.push(genre);
    });
  }

  const keywords = [
    ...new Set(rest.split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))),
  ];
  return {
    text,
    ...(minutes !== undefined ? { minutes } : {}),
    years,
    onlyMine,
    liked,
    discover,
    genres,
    keywords,
  };
}

/** Is the year inside the asked ranges (any year when none was asked; unknown years are out then)? */
export function inYears(year: number | undefined, years: Array<[number, number]>): boolean {
  if (years.length === 0) return true;
  if (year === undefined) return false;
  return years.some(([a, b]) => year >= a && year <= b);
}

/** The free text for a /search query: keywords plus filters (`genre:"rock" year:1990-1999`). */
export function searchQuery(
  d: Description,
  opts: { keywords?: boolean; genre?: boolean; year?: boolean } = {},
): string {
  const parts: string[] = [];
  if (opts.keywords !== false) parts.push(...d.keywords);
  if (opts.genre !== false && d.genres.length > 0) parts.push(`genre:"${d.genres[0]}"`);
  if (opts.year !== false && d.years.length > 0) {
    const from = Math.min(...d.years.map(([a]) => a));
    const to = Math.max(...d.years.map(([, b]) => b));
    parts.push(from === to ? `year:${from}` : `year:${from}-${to}`);
  }
  return parts.join(' ').trim();
}

/** Words to look for in playlist names: the keywords and the genre words as typed. */
export function nameWords(d: Description): string[] {
  return [...d.keywords, ...d.genres.map((g) => fold(g))];
}

/** How well a playlist name (and description) matches: words of `words` it contains. */
export function nameScore(name: string, words: string[]): number {
  const folded = ` ${fold(name)} `;
  return words.filter((w) => folded.includes(` ${w} `) || folded.includes(` ${w}s `)).length;
}

/** The first words of the description, for the playlist's name (about 30 characters, whole words). */
export function requestTitle(text: string): string {
  const all = text
    .replace(/[.,;:!?¡¿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  const words: string[] = [];
  for (const w of all.slice(0, PLAYLIST_REQUEST_NAME_WORDS)) {
    if (words.length > 0 && [...words, w].join(' ').length > PLAYLIST_REQUEST_NAME_MAX) break;
    words.push(w);
  }
  // Never end on a loose "de los", "para", "y"…
  while (words.length > 1 && STOP.has(fold(words[words.length - 1]))) words.pop();
  return words.join(' ').slice(0, PLAYLIST_REQUEST_NAME_MAX) || 'A mi gusto';
}

/** "de 6 listas públicas parecidas, 2 listas tuyas y 9 canciones tuyas". */
export function originText(parts: {
  publicLists: number;
  ownLists: number;
  searched: number;
  artists: string[];
  mine: number;
}): string {
  const out: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (parts.publicLists > 0)
    out.push(plural(parts.publicLists, 'lista pública parecida', 'listas públicas parecidas'));
  if (parts.ownLists > 0) out.push(plural(parts.ownLists, 'lista tuya', 'listas tuyas'));
  if (parts.artists.length > 0) out.push(`discos de ${joinSpanish(parts.artists)}`);
  if (parts.searched > 0)
    out.push(
      plural(
        parts.searched,
        'canción que casa con lo que pediste',
        'canciones que casan con lo que pediste',
      ),
    );
  if (parts.mine > 0) out.push(plural(parts.mine, 'canción tuya', 'canciones tuyas'));
  return out.length ? `De ${joinSpanish(out)}` : '';
}

export function joinSpanish(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
