import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InvestigacionPrecio } from '../../server/asistente/trabajos.js';
import { ofertasPath, readData } from '../../server/vigia/storage.js';
import type { Offer, PricePoint, Source, SourceAnswer } from '../../server/vigia/types.js';
import { judge } from '../../server/vigia/verdict.js';
import { assistantFacts, createVigia } from '../../server/vigia/vigia.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Local noon on 2026-11-20 (independent of the machine's time zone). */
const NOW = new Date(2026, 10, 20, 12, 0).getTime();

const offer = (store: string, price: number, o: Partial<Offer> = {}): Offer => ({
  sourceId: store.toLowerCase(),
  store,
  id: `${store}-${price}`,
  title: 'Bocina Marca X200 negra',
  price,
  official: true,
  url: `https://${store.toLowerCase()}.example/p`,
  ...o,
});

function daily(days: number, price: number): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = days; i >= 1; i--) {
    out.push({ at: new Date(NOW - i * DAY).toISOString(), price, storePrice: price });
  }
  return out;
}

const precio = (o: Partial<InvestigacionPrecio> = {}): InvestigacionPrecio => ({
  precioTipico: 1000,
  minimoVisto: 850,
  nota: 'Precio normal alrededor de $1,000.',
  confianza: 'media',
  fuentes: [{ titulo: 'Tienda A', url: 'https://tienda-a.example/p/1' }],
  revisado: new Date(NOW - HOUR).toISOString(),
  ...o,
});

describe('ofertas asistente: its price as one more fact of the verdict', () => {
  it('alone it decides, and the reason marks it "(asistente)"', () => {
    expect(judge({ offer: offer('A', 900), assistant: { typical: 1000 }, nowMs: NOW })).toEqual({
      kind: 'good',
      reason: '10 % abajo del precio típico que encontró el asistente ($1,000) (asistente)',
    });
    expect(judge({ offer: offer('A', 1100), assistant: { typical: 1000 }, nowMs: NOW }).kind).toBe(
      'expensive',
    );
    expect(judge({ offer: offer('A', 1020), assistant: { typical: 1000 }, nowMs: NOW })).toEqual({
      kind: 'normal',
      reason: 'Cerca del precio típico que encontró el asistente ($1,000) (asistente)',
    });
  });

  it('without a typical price, the lowest it saw counts', () => {
    const v = judge({ offer: offer('A', 850), assistant: { low: 850 }, nowMs: NOW });
    expect(v.kind).toBe('good');
    expect(v.reason).toContain('Igual al mínimo que encontró el asistente ($850) (asistente)');
    expect(judge({ offer: offer('A', 1000), assistant: { low: 850 }, nowMs: NOW }).kind).toBe(
      'normal',
    );
  });

  it('weighs less than what the office saw: its own history wins a disagreement', () => {
    // Own history: the lowest in 34 days (good). The assistant says it is 20 % over its typical price (expensive).
    const v = judge({
      offer: offer('A', 880),
      history: daily(34, 1000),
      assistant: { typical: 730 },
      nowMs: NOW,
    });
    expect(v.kind).toBe('good');
    expect(v.reason).toContain('El más bajo en 34 días');
    expect(v.reason).toContain('(asistente)');
  });

  it('breaks a tie between two facts of the office', () => {
    const base = {
      offer: offer('A', 880),
      history: daily(34, 1000),
      reference: { price: 800, at: new Date(2026, 10, 9).toISOString() },
      nowMs: NOW,
    };
    expect(judge(base).kind).toBe('normal');
    expect(judge({ ...base, assistant: { typical: 1000 } }).kind).toBe('good');
  });

  it('an answer older than 30 days, or without numbers, does not count', () => {
    expect(assistantFacts({ precio: precio() }, NOW)).toEqual({ typical: 1000, low: 850 });
    expect(
      assistantFacts({ precio: precio({ revisado: new Date(NOW - 31 * DAY).toISOString() }) }, NOW),
    ).toBeUndefined();
    expect(
      assistantFacts({ precio: precio({ precioTipico: undefined, minimoVisto: undefined }) }, NOW),
    ).toBeUndefined();
    expect(assistantFacts(undefined, NOW)).toBeUndefined();
  });
});

describe('ofertas asistente: kept on the watched search', () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-ofertas-asis-'));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  const source = (offers: Offer[]): Source => ({
    id: 'a',
    name: 'Tienda A',
    fragile: false,
    access: 'prueba',
    ready: () => true,
    searchUrl: () => 'https://a.example',
    search: async (): Promise<SourceAnswer> => ({ offers, deals: [] }),
  });

  it('saves the answer with its date, re-judges at once, reads it back and keeps the settings key', async () => {
    // Reading the file back uses the real clock: an answer dated in the future would be thrown away
    const answer = precio({ revisado: new Date(Date.now() - HOUR).toISOString() });
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ asistente: { modelo: 'sonnet' } }));
    const title = 'Bocina Marca X200 negra';
    const v = createVigia({
      home,
      sources: [source([offer('Tienda A', 900, { title, sourceId: 'a' })])],
      now: () => NOW,
      random: () => 0.5,
      timers: false,
    });
    const w = v.saveWatch({ query: 'bocina marca x200' });
    await v.check(w.id);
    expect(v.state().watches[0]!.verdict!.kind).toBe('unknown');

    expect(v.setAssistant(w.id, { precio: answer })).toBe(true);
    let got = v.state().watches[0]!;
    expect(got.asistente!.precio!.precioTipico).toBe(1000);
    expect(got.verdict).toMatchObject({ kind: 'good' });
    expect(got.verdict!.reason).toContain('(asistente)');
    expect(v.setAssistant('no-existe', { precio: precio() })).toBe(false);

    // Similars add to it; the price stays
    v.setAssistant(w.id, {
      similares: {
        similares: [
          {
            tipo: 'compa',
            nombre: 'Marca Z Modelo 9',
            porque: 'Casi igual.',
            consulta: 'marca z modelo 9',
            fuentes: [],
          },
        ],
        revisado: new Date(Date.now()).toISOString(),
      },
    });
    got = v.state().watches[0]!;
    expect(got.asistente!.precio).toBeDefined();
    expect(got.asistente!.similares!.similares[0]!.nombre).toBe('Marca Z Modelo 9');

    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(disk.asistente).toEqual({ modelo: 'sonnet' });
    expect(disk.busquedas[0].asistente.precio.revisado).toBe(answer.revisado);

    const back = readData(home).watches[0]!;
    expect(back.asistente!.precio!.revisado).toBe(answer.revisado);
    expect(back.asistente!.similares!.similares).toHaveLength(1);

    // The next check keeps counting it
    await v.check(w.id);
    expect(v.state().watches[0]!.verdict!.reason).toContain('(asistente)');

    // Another product (the query changed): the old answer goes away
    v.saveWatch({ id: w.id, query: 'otra cosa' });
    expect(v.state().watches[0]!.asistente).toBeUndefined();
  });

  it('drops answers older than 30 days and junk from the file', () => {
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const old = new Date(Date.now() - 31 * DAY).toISOString();
    const fresh = new Date(Date.now() - DAY).toISOString();
    fs.writeFileSync(
      file,
      JSON.stringify({
        busquedas: [
          { id: 'w1', query: 'uno', asistente: { precio: precio({ revisado: old }) } },
          {
            id: 'w2',
            query: 'dos',
            asistente: {
              precio: {
                ...precio({ revisado: fresh }),
                fuentes: [{ titulo: 'x', url: 'javascript:alert(1)' }],
                extra: 'fuera',
              },
            },
          },
          {
            id: 'w3',
            query: 'tres',
            asistente: { similares: { similares: 'nada', revisado: fresh } },
          },
        ],
      }),
    );
    const watches = readData(home).watches;
    expect(watches[0]!.asistente).toBeUndefined();
    // Sources that are not http(s) are dropped, and with them the numbers they backed
    expect(watches[1]!.asistente!.precio).toMatchObject({ fuentes: [], confianza: 'baja' });
    expect(watches[1]!.asistente!.precio!.precioTipico).toBeUndefined();
    expect(watches[1]!.asistente!.precio).not.toHaveProperty('extra');
    expect(watches[2]!.asistente).toBeUndefined();
  });
});
