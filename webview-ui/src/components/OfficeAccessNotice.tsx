import { useSyncExternalStore } from 'react';

import { createOfficeAccessStore } from '../officeAccess.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';

// Created with the module (App imports it at startup), before the server's answers arrive.
const officeAccess = createOfficeAccessStore(transport);

/**
 * Standalone: the server answers every connection with `officeAccess`. Without the owner's token the office
 * still renders but private panels (GitHub, agenda, garden, directory, connections, usage) get nothing, which
 * looked like a broken office. Say so. Renders nothing in VS Code, while unknown, and while privileged.
 */
export function OfficeAccessNotice() {
  const privileged = useSyncExternalStore(officeAccess.subscribe, officeAccess.get);
  if (!isBrowserRuntime || privileged !== false) return null;

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pixel-panel py-6 px-12 flex items-center gap-8 text-sm max-w-[90%]">
      <span className="w-8 h-8 rounded-full inline-block shrink-0 bg-status-permission pixel-pulse" />
      <span>
        Esta pestaña no tiene la llave de la oficina: GitHub, agenda, jardín y los demás paneles no
        reciben datos. Ábrela de nuevo desde el acceso directo Javbots.
      </span>
    </div>
  );
}
