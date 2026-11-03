/**
 * Provider registry: re-exports all bundled providers.
 *
 * Adding a new CLI provider:
 *   1. Create `server/src/providers/hook/<cli>/<cli>.ts` implementing HookProvider.
 *      (File-based and stream-based provider types will land when the first such
 *       provider ships.)
 *   2. Add an export line below.
 *
 * The adapter (VS Code extension, standalone CLI, etc.) imports from here rather
 * than reaching into each provider directory directly.
 */

import type { HookProvider } from '../../../core/src/provider.js';
import {
  claudeProfileProviders,
  claudeProvider,
  isClaudeProfileProvider,
} from './hook/claude/claude.js';

export { claudeProvider, isClaudeProfileProvider };
export { copyHookScript } from './hook/claude/claudeHookInstaller.js';

/** Every hook provider, in registration order: one per Claude Code profile in use (claudeProfiles.ts), so the list
 *  is re-read on each call and a newly created profile shows up without a restart. The consent gate loops over this
 *  at the webviewReady handshake (one ask per provider that needs one) and `hooksConsentResponse` resolves its
 *  provider id against it. */
export function hookProviders(): readonly HookProvider[] {
  return claudeProfileProviders();
}

/** Resolve a wire-supplied provider id, or undefined for an unknown one —
 *  the caller writes nothing on undefined (fail-closed, like a junk choice). */
export function hookProviderById(id: unknown): HookProvider | undefined {
  return typeof id === 'string' ? hookProviders().find((p) => p.id === id) : undefined;
}

/** The runtime's single hooks ref, which gates the Claude transcript scanners: on only while EVERY Claude profile
 *  wants hooks, because a profile left without them still needs the scanners to find its new sessions. */
export function claudeHooksEnabled(getHooksEnabled: (providerId: string) => boolean): boolean {
  return hookProviders()
    .filter(isClaudeProfileProvider)
    .every((p) => getHooksEnabled(p.id));
}
