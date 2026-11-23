import { ISBN_MAX } from './constants.js';

/** An ISBN as kept: digits only (and a final X), hyphens and spaces were only how it was printed. */
export function cleanIsbn(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toUpperCase()
    .replace(/[^0-9X]/g, '')
    .replace(/X(?=.)/g, '')
    .slice(0, ISBN_MAX);
}

/** ISBN-10 check: the digits weighted 10 to 1 add up to a multiple of 11 (the last may be X = 10). */
function valid10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

/** ISBN-13 check: digits weighted 1, 3, 1, 3… add up to a multiple of 10. */
function valid13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/** Whether a cleaned ISBN is a real one (10 or 13 digits with the right check digit). */
export function isbnValid(isbn: string): boolean {
  return isbn.length === 10 ? valid10(isbn) : isbn.length === 13 ? valid13(isbn) : false;
}

/** The ISBN-13 of a valid ISBN (an ISBN-10 gets 978 in front and a new check digit); null when it is not valid. */
export function isbn13(isbn: string): string | null {
  if (!isbnValid(isbn)) return null;
  if (isbn.length === 13) return isbn;
  const body = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** How an ISBN is shown: its hyphens depend on ranges this does not know, so only the prefix apart (978 …). */
export function isbnText(isbn: string): string {
  return isbn.length === 13 ? `${isbn.slice(0, 3)} ${isbn.slice(3)}` : isbn;
}
