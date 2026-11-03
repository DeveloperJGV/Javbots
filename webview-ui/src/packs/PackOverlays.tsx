import type { RefObject } from 'react';
import { useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { officesStore } from '../offices.js';
import { activePacks } from './registry.js';

/** The overlays of the private packs active in this page's office (packs/registry.ts). */
export function PackOverlays(props: {
  transport: MessageTransport;
  officeState: OfficeState;
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: RefObject<{ x: number; y: number }>;
}) {
  // Re-render once the server says the office (activePacks depends on it)
  const { current } = useSyncExternalStore(officesStore.subscribe, officesStore.get);
  return (
    <>
      {activePacks().map(({ name, Overlay }) =>
        Overlay ? <Overlay key={name} {...props} office={current} /> : null,
      )}
    </>
  );
}
