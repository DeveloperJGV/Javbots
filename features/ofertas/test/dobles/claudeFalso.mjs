#!/usr/bin/env node
// A fake `claude -p` for the assistant's tests: never touches the network. FALSO_MODO picks the behavior and
// FALSO_LOG (optional) gets what it was called with: arguments, the prompt read from stdin, cwd and env names.
import * as fs from 'fs';

const mode = process.env.FALSO_MODO ?? 'precio';

const PRECIO = {
  precioTipico: 1899,
  minimoVisto: 1599,
  maximoVisto: 2299,
  nota: 'Precio normal alrededor de $1,899 en dos tiendas.',
  confianza: 'alta',
  fuentes: [
    { titulo: 'Tienda A', url: 'https://tienda-a.example/p/1', fecha: '2026-10-01', precio: 1899 },
    { titulo: 'Tienda B', url: 'https://tienda-b.example/p/2', fecha: null, precio: 1599 },
  ],
};

const SIMILARES = {
  similares: [
    {
      tipo: 'alternativa',
      nombre: 'Marca Y Modelo 3',
      porque: 'Mismo uso, un poco más barata.',
      precioAprox: 1500,
      consulta: 'marca y modelo 3',
      fuentes: [{ titulo: 'Tienda A', url: 'https://tienda-a.example/y3' }],
    },
    {
      tipo: 'compa',
      nombre: 'Marca Z Modelo 9',
      porque: 'Casi igual en potencia y tamaño.',
      precioAprox: 1800,
      consulta: 'marca z modelo 9',
      fuentes: [{ titulo: 'Tienda B', url: 'https://tienda-b.example/z9' }],
    },
    {
      tipo: 'alternativa',
      nombre: 'Marca W Modelo 1',
      porque: 'Más sencilla.',
      precioAprox: null,
      consulta: 'marca w modelo 1',
      fuentes: [],
    },
  ],
};

const envelope = (extra) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1234,
    num_turns: 4,
    result: '',
    session_id: '00000000-0000-0000-0000-000000000000',
    total_cost_usd: 0.0123,
    ...extra,
  });

// `claude auth status --json`: the check made before every run. FALSO_AUTH picks the login it reports and
// FALSO_LOG_AUTH (optional) gets the environment names it saw.
if (process.argv[2] === 'auth') {
  if (process.env.FALSO_LOG_AUTH) {
    fs.writeFileSync(process.env.FALSO_LOG_AUTH, JSON.stringify(Object.keys(process.env)));
  }
  // Like the real CLI: an API key in the environment wins over the subscription login
  const keyInEnv = Object.keys(process.env).some((k) => k.toUpperCase() === 'ANTHROPIC_API_KEY');
  const auth = process.env.FALSO_AUTH ?? 'suscripcion';
  const status = (o) => process.stdout.write(JSON.stringify({ apiProvider: 'firstParty', ...o }));
  if (auth === 'viejo') process.stdout.write('error: unknown command auth');
  else if (auth === 'sin-sesion') status({ loggedIn: false, authMethod: 'none' });
  else if (auth === 'llave' || keyInEnv) status({ loggedIn: true, authMethod: 'api_key' });
  else if (auth === 'nube')
    status({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' });
  else if (auth === 'cuelga') setInterval(() => {}, 1000);
  else status({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'pro' });
} else {
  main();
}

function main() {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (stdin += d));
  process.stdin.on('end', () => {
    if (process.env.FALSO_LOG) {
      fs.writeFileSync(
        process.env.FALSO_LOG,
        JSON.stringify({
          argv: process.argv.slice(2),
          stdin,
          cwd: process.cwd(),
          cwdEntries: fs.readdirSync(process.cwd()),
          envNames: Object.keys(process.env),
        }),
      );
    }
    const custom = process.env.FALSO_SALIDA ? JSON.parse(process.env.FALSO_SALIDA) : undefined;
    switch (mode) {
      case 'precio':
        process.stdout.write(envelope({ structured_output: custom ?? PRECIO }));
        break;
      case 'similares':
        process.stdout.write(envelope({ structured_output: custom ?? SIMILARES }));
        break;
      case 'texto':
        // An older CLI: no structured_output, the JSON inside the plain result.
        process.stdout.write(
          envelope({ result: `Aquí está:\n${JSON.stringify(custom ?? PRECIO)}\nListo.` }),
        );
        break;
      case 'sin-json':
        process.stdout.write(envelope({ result: 'No encontré nada, lo siento.' }));
        break;
      case 'basura':
        process.stdout.write('esto no es json {');
        break;
      case 'enorme':
        process.stdout.write('x'.repeat(3 * 1024 * 1024));
        break;
      case 'error':
        process.stdout.write(
          envelope({ subtype: 'error_during_execution', is_error: true, result: 'Not logged in' }),
        );
        process.exitCode = 1;
        break;
      case 'truena':
        process.stderr.write('algo se rompió\n');
        process.exitCode = 2;
        break;
      case 'cuelga':
        setInterval(() => {}, 1000);
        break;
      default:
        process.stderr.write(`modo desconocido: ${mode}\n`);
        process.exitCode = 3;
    }
  });
}
