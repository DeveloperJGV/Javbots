// Bundles the price watch console program into one file: dist/ofertas-vigia.cjs (Node 18+, nothing else needed).
//   node features/ofertas/scripts/build-vigia.mjs
//   node dist/ofertas-vigia.cjs --una-vez
import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outfile = path.join(root, 'dist', 'ofertas-vigia.cjs');

await esbuild.build({
  entryPoints: [path.join(root, 'features/ofertas/server/vigia/consola.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
console.log(`Listo: ${path.relative(root, outfile)}`);
