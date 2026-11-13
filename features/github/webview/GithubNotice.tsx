import { useSyncExternalStore } from 'react';

import { githubStore } from './githubStore.js';

/**
 * One notice when this office's gh login gives no data (features/github: githubNotice): what's missing and the exact
 * command to fix it. It leaves by itself when the login works again; closed, it comes back only if it changes.
 */
export function GithubNotice() {
  const { notice, dismissed } = useSyncExternalStore(githubStore.subscribe, githubStore.get);
  if (!notice || notice.text === dismissed) return null;
  return (
    <div
      role="status"
      className="absolute top-56 left-1/2 -translate-x-1/2 z-20 pixel-panel py-6 px-12 flex items-start gap-8 text-sm max-w-[90%]"
    >
      <span className="w-8 h-8 mt-4 rounded-full inline-block shrink-0 bg-status-permission" />
      <span className="flex flex-col gap-2">
        <span>{notice.text}</span>
        {notice.command && (
          <code className="select-all text-accent-bright break-all">{notice.command}</code>
        )}
      </span>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => githubStore.dismissNotice()}
        className="text-sm text-text-muted bg-transparent border-0 cursor-pointer hover:text-text"
      >
        ×
      </button>
    </div>
  );
}
