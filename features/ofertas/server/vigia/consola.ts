/**
 * The watch as a console program (for a small always-on machine), with nothing outside Node:
 *
 *   node ofertas-vigia.cjs [--home <carpeta>]           checks on its schedule until Ctrl+C
 *   node ofertas-vigia.cjs --una-vez                      one round of every saved search, then exits
 *   node ofertas-vigia.cjs --buscar "audifonos bluetooth" one live search, printed, then exits
 *
 * Searches, settings and keys live in <home>/.pixel-agents/ofertas.json (the same file the office uses).
 */
import * as os from 'os';

import { LOG_PREFIX } from './constants.js';
import { consoleNotifier, ntfyNotifier } from './notifiers.js';
import { clock, money } from './rules.js';
import { createSources, storeLinks } from './sources/index.js';
import { ofertasPath, readKeys, readNotifierConfig } from './storage.js';
import type { Notifier, SearchOutcome, Vigia } from './types.js';
import { createVigia } from './vigia.js';

interface Args {
  home: string;
  once: boolean;
  search?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { home: os.homedir(), once: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home' && argv[i + 1]) {
      args.home = argv[++i]!;
    } else if (a === '--una-vez') {
      args.once = true;
    } else if (a === '--buscar' && argv[i + 1]) {
      args.search = argv[++i]!;
    }
  }
  return args;
}

const out = (line = '') => console.log(line);

function printSearch(r: SearchOutcome): void {
  out(`${LOG_PREFIX} ${clock(Date.now())}  «${r.query}»: ${r.groups.length} productos`);
  for (const g of r.groups.slice(0, 15)) {
    const best = g.offers[0]!;
    const more = g.offers.length > 1 ? ` (+${g.offers.length - 1} tiendas)` : '';
    out(`  ${money(best.price).padStart(10)}  ${best.store.padEnd(16)} ${g.title}${more}`);
    out(`              ${best.url}`);
  }
  for (const d of r.deals.slice(0, 5)) {
    const price = d.price !== undefined ? money(d.price) : '';
    out(`  Comunidad ${Math.round(d.temperature)}°  ${price}  ${d.title}`);
  }
  out('Fuentes:');
  for (const s of r.sources) {
    out(`  ${s.name.padEnd(16)} ${s.state.padEnd(8)} ${s.count ?? 0} ${s.detail ?? ''}`.trimEnd());
  }
  if (r.links.length > 0) {
    out('Para ver a mano:');
    for (const l of r.links) {
      out(`  ${l.name}: ${l.url}`);
    }
  }
}

function printRound(vigia: Vigia): void {
  const st = vigia.state();
  out(`${LOG_PREFIX} ${clock(Date.now())}  Ronda terminada: ${st.watches.length} búsquedas`);
  for (const w of st.watches) {
    const next = w.nextCheckAt ? ` · siguiente ${clock(Date.parse(w.nextCheckAt))}` : '';
    const what = w.best ? `${money(w.best.price)} en ${w.best.store}` : (w.error ?? 'sin revisar');
    const note = w.note ? ` · ${w.note}` : '';
    out(`  ${w.query}: ${what}${note}${next}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const home = args.home;
  const notifiers: Notifier[] = [consoleNotifier()];
  const ntfy = readNotifierConfig(home).ntfy;
  const push = ntfyNotifier({ topic: ntfy?.topic, server: ntfy?.server });
  if (push) {
    notifiers.push(push);
  }
  const vigia = createVigia({
    home,
    sources: createSources({ keys: () => readKeys(home) }),
    links: storeLinks,
    notifiers,
    timers: !args.once && !args.search,
  });

  if (args.search) {
    printSearch(await vigia.search(args.search));
    return;
  }
  if (args.once) {
    await vigia.check();
    printRound(vigia);
    return;
  }

  out(`${LOG_PREFIX} ${clock(Date.now())}  Vigía de ofertas en marcha (${ofertasPath(home)})`);
  if (push) {
    out(`${LOG_PREFIX} Avisos también por ntfy`);
  }
  let wasChecking = false;
  vigia.onChange(() => {
    const { checking } = vigia.state();
    if (wasChecking && !checking) {
      printRound(vigia);
    }
    wasChecking = checking;
  });
  vigia.start();
  // The watch's timer does not hold the process: this one does, until Ctrl+C.
  const keepAlive = setInterval(() => undefined, 1 << 30);
  const quit = () => {
    vigia.stop();
    clearInterval(keepAlive);
    out(`${LOG_PREFIX} ${clock(Date.now())}  Vigía detenido`);
  };
  process.once('SIGINT', quit);
  process.once('SIGTERM', quit);
}

main().catch((err: unknown) => {
  console.error(`${LOG_PREFIX} Error:`, err);
  process.exitCode = 1;
});
