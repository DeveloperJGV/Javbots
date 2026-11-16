/**
 * The console program's options, read before anything else: --help (or -h, or /?, anywhere in the arguments, or an
 * option it does not know) prints this text and exits without opening ofertas.json, so looking at the help never
 * reads or writes anyone's data.
 */
import * as os from 'os';

export interface ConsoleArgs {
  home: string;
  once: boolean;
  search?: string;
  /** Print the help and exit, touching nothing. */
  help: boolean;
  /** Options it does not know (they print the help too, with exit code 2). */
  unknown: string[];
}

export const HELP_TEXT = `Vigía de ofertas (consola)

Uso:
  node ofertas-vigia.cjs                         revisa las búsquedas guardadas cada cierto tiempo, hasta Ctrl+C
  node ofertas-vigia.cjs --una-vez               una ronda de todas las búsquedas guardadas y sale
  node ofertas-vigia.cjs --buscar "texto"        busca al momento, imprime y sale (no guarda precios ni avisos)
  node ofertas-vigia.cjs --home <carpeta>        usa <carpeta>/.pixel-agents/ofertas.json en vez de la del usuario
  node ofertas-vigia.cjs --help | -h             esta ayuda (no lee ni escribe ofertas.json)

Ojo: solo --help y --buscar no escriben. --una-vez y la vigilancia sin opciones ESCRIBEN en ofertas.json
(guardan precios) y mandan avisos. --buscar sí lee ofertas.json: si está dañado lo aparta como ofertas.json.roto.
Una opción desconocida, o --home / --buscar sin valor (o con un valor que empieza con "-"), imprime esta ayuda y
sale con código 2. Para probar sin tocar datos reales, usa --home con una carpeta de prueba.`;

const HELP_FLAGS: readonly string[] = ['--help', '-h', '/?'];

/** A value may not look like an option: "--home --help" must not take "--help" as the folder. */
const takesValue = (v: string | undefined): v is string =>
  v !== undefined && v !== '' && !v.startsWith('-');

export function parseArgs(
  argv: readonly string[],
  defaultHome: string = os.homedir(),
): ConsoleArgs {
  const args: ConsoleArgs = { home: defaultHome, once: false, help: false, unknown: [] };
  // The help wins wherever it is, even where a value was expected ("--buscar --help")
  if (argv.some((a) => HELP_FLAGS.includes(a))) {
    args.help = true;
    return args;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === '--home' && takesValue(next)) {
      args.home = next;
      i++;
    } else if (a === '--una-vez') {
      args.once = true;
    } else if (a === '--buscar' && takesValue(next)) {
      args.search = next;
      i++;
    } else {
      // An unknown option, or --home / --buscar without a usable value
      args.unknown.push(a);
    }
  }
  return args;
}
