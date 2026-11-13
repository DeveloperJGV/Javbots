/**
 * "Meses sin intereses" (MSI) as each source states them. Only what the data says: no bank and no minimum amount
 * unless the source names them, and nothing for stores that do not give it per product.
 */
import { MSI_BANKS, MSI_MONTHS_MAX } from './constants.js';
import { normalize } from './relevance.js';
import type { Installments } from './types.js';

const validMonths = (n: number): number | undefined =>
  Number.isInteger(n) && n > 1 && n <= MSI_MONTHS_MAX ? n : undefined;

/** Amazon's result card: "$369.50 x 4 meses sin intereses" (no bank). */
const AMAZON_MSI_RE = /x\s*(\d{1,2})\s*meses\s+sin\s+intereses/i;

export function amazonInstallments(card: string): Installments | undefined {
  const m = AMAZON_MSI_RE.exec(card);
  const months = m ? validMonths(Number(m[1])) : undefined;
  return months ? { months } : undefined;
}

/**
 * VTEX `commertialOffer.Installments`: one row per card and number of payments. MSI = the most payments with
 * InterestRate 0 (more than one). The rows name card brands (Visa, Amex), not banks, so no bank is given.
 */
export function vtexInstallments(rows: unknown): Installments | undefined {
  if (!Array.isArray(rows)) return undefined;
  let best: number | undefined;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (r.InterestRate !== 0 || typeof r.NumberOfInstallments !== 'number') continue;
    const months = validMonths(r.NumberOfInstallments);
    if (months && (best === undefined || months > best)) best = months;
  }
  return best ? { months: best } : undefined;
}

/** Mercado Libre search result `installments`: { quantity, amount, rate }. MSI when rate is 0. */
export function mercadolibreInstallments(raw: unknown): Installments | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.rate !== 0 || typeof r.quantity !== 'number') return undefined;
  const months = validMonths(r.quantity);
  return months ? { months } : undefined;
}

/** "12 MSI", "12msi", "12 meses sin intereses", "MSI" alone. */
const TITLE_MSI_RE =
  /(?:(\d{1,2})\s*(?:msi\b|meses\s+sin\s+intereses))|\bmsi\b|meses\s+sin\s+intereses/i;

/** A community deal's title: months when it says them, the bank only when it names one of MSI_BANKS. */
export function titleInstallments(title: string): Installments | undefined {
  const m = TITLE_MSI_RE.exec(title);
  if (!m) return undefined;
  const out: Installments = {};
  const months = m[1] ? validMonths(Number(m[1])) : undefined;
  if (months) out.months = months;
  const words = ` ${normalize(title)} `;
  // Longest names first: "Costco Citibanamex" before "Citibanamex", "Hey Banco" before "Banco"
  const bank = [...MSI_BANKS]
    .sort((a, b) => b.length - a.length)
    .find((b) => words.includes(` ${normalize(b)} `));
  if (bank) out.bank = bank;
  return out;
}
