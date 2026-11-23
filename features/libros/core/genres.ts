import { fold } from '../../coleccion/core/shelves.js';

/**
 * The usual genres of a house library, in the order their shelves stand: novels first, then the rest of fiction,
 * then non-fiction, then what is for kids and the kitchen. A genre written by hand that is not here gets its own
 * shelf after these (alphabetical), and books with no genre go last.
 */
export const GENRES: readonly string[] = [
  'Novela',
  'Cuento',
  'Poesía',
  'Teatro',
  'Ciencia ficción',
  'Fantasía',
  'Terror',
  'Policiaca',
  'Histórica',
  'Romance',
  'Cómic y manga',
  'Infantil y juvenil',
  'Biografía',
  'Ensayo',
  'Historia',
  'Ciencia',
  'Filosofía',
  'Psicología',
  'Negocios',
  'Tecnología',
  'Arte y diseño',
  'Viajes',
  'Cocina',
  'Religión',
  'Referencia',
];

/** Where a genre's shelf goes: its place in GENRES, or after all of them. */
export function genreOrder(genre: string): number {
  const key = fold(genre);
  const i = GENRES.findIndex((g) => fold(g) === key);
  return i >= 0 ? i : GENRES.length;
}

/** The genre as the list writes it ("ciencia ficcion" → "Ciencia ficción"), or as it came. */
export function canonicalGenre(genre: string): string {
  const key = fold(genre);
  if (!key) return '';
  return GENRES.find((g) => fold(g) === key) ?? genre;
}

/** Languages offered as chips (anything else can be written). */
export const LANGUAGES: readonly string[] = [
  'Español',
  'Inglés',
  'Francés',
  'Portugués',
  'Italiano',
  'Alemán',
  'Japonés',
];
