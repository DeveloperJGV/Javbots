/**
 * Finds the private packs at build time (privado/<pack>/webview.tsx; none in the public build) and registers them.
 * Imported once from main.tsx, before the app renders.
 */
import { registerPack, type WebviewPack } from './registry.js';

const modules = import.meta.glob<{ default: WebviewPack }>('../../../privado/*/webview.tsx', {
  eager: true,
});

for (const [file, mod] of Object.entries(modules)) {
  if (mod.default?.name) registerPack(mod.default);
  else console.warn(`[Packs] ${file} no exporta un paquete (export default { name, ... })`);
}
