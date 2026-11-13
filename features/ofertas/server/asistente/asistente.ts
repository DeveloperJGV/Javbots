/**
 * Optional extra of Ofertas: when Claude Code is installed on this machine, a small model can research a product on
 * the web the way a person would. The price search by rules works without it; this only adds a second opinion.
 *
 *   const asistente = createAsistente();
 *   if (asistente.available()) {
 *     const r = await asistente.investigarPrecio('Bocina Marca X Modelo 200', { precioActual: 1899 });
 *     if (r.ok) show(r.data); else explain(r.reason);
 *   }
 */
import { PRODUCT_MAX, STORE_MAX } from './constants.js';
import {
  INVESTIGAR_SCHEMA,
  investigarPrompt,
  SIMILARES_SCHEMA,
  similaresPrompt,
} from './plantillas.js';
import { createRunner, type RunnerInfo, type RunnerOptions, type RunResult } from './runner.js';
import { price, text } from './sanitize.js';
import {
  type BusquedaSimilares,
  type InvestigacionPrecio,
  parseInvestigacion,
  parseSimilares,
} from './trabajos.js';

export type { AsistenteConfig } from './config.js';
export type { FalloAsistente, RunMeta, RunnerInfo, RunResult } from './runner.js';
export type {
  BusquedaSimilares,
  Confianza,
  Fuente,
  InvestigacionPrecio,
  Similar,
  TipoSimilar,
} from './trabajos.js';

export interface AsistenteOptions extends RunnerOptions {
  now?: () => Date;
}

export interface Asistente {
  /** The CLI is installed and the assistant is not turned off: the panel shows the buttons. */
  available(): boolean;
  /** For the settings: whether the CLI was found, whether it is turned on and the model. */
  info(): RunnerInfo;
  busy(): boolean;
  /** Stops the run in progress (it answers `cancelled`). */
  cancel(): boolean;
  investigarPrecio(
    producto: string,
    opts?: { precioActual?: number; tienda?: string },
    signal?: AbortSignal,
  ): Promise<RunResult<InvestigacionPrecio>>;
  buscarSimilares(
    producto: string,
    opts?: { presupuesto?: number },
    signal?: AbortSignal,
  ): Promise<RunResult<BusquedaSimilares>>;
}

const MISSING_PRODUCT = { ok: false, reason: 'failed', detail: 'Falta el producto' } as const;

export function createAsistente(opts: AsistenteOptions = {}): Asistente {
  const runner = createRunner(opts);
  const now = opts.now ?? (() => new Date());

  return {
    available: () => runner.available(),
    info: () => runner.info(),
    busy: () => runner.busy(),
    cancel: () => runner.cancel(),

    async investigarPrecio(producto, o = {}, signal) {
      const p = text(producto, PRODUCT_MAX);
      if (!p) {
        return MISSING_PRODUCT;
      }
      const precioActual = price(o.precioActual);
      const tienda = text(o.tienda, STORE_MAX);
      const at = now();
      return runner.run(
        {
          prompt: investigarPrompt(p, { precioActual, tienda }, at),
          schema: INVESTIGAR_SCHEMA,
          parse: (raw) => parseInvestigacion(raw, now(), precioActual),
        },
        signal,
      );
    },

    async buscarSimilares(producto, o = {}, signal) {
      const p = text(producto, PRODUCT_MAX);
      if (!p) {
        return MISSING_PRODUCT;
      }
      const presupuesto = price(o.presupuesto);
      const at = now();
      return runner.run(
        {
          prompt: similaresPrompt(p, { presupuesto }, at),
          schema: SIMILARES_SCHEMA,
          parse: (raw) => parseSimilares(raw, p, now(), presupuesto),
        },
        signal,
      );
    },
  };
}
