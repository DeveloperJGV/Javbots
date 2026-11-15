import { useEffect } from 'react';

import type { FreelanceStatus, SearchRoomStatus } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { SearchRoomStore, useSearchRoom } from '../../busquedas/webview/searchRoomStore.js';
import { FREELANCE_FURNITURE_TYPES, FREELANCE_ROOM } from './constants.js';

/** The freelance room's search part (features/busquedas), outside React: the panel and the map read it. */
export const freelanceStore = new SearchRoomStore(FREELANCE_ROOM);

/** The owner's offer and the agent's model (freelanceStatus), outside React. */
class FreelanceOfferStore {
  private status: FreelanceStatus | undefined;
  private listeners = new Set<() => void>();

  get = (): FreelanceStatus | undefined => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(status: FreelanceStatus): void {
    this.status = status;
    for (const l of this.listeners) l();
  }
}

export const freelanceOfferStore = new FreelanceOfferStore();

/** The piece that opens the panel (rotations and states share the base type). */
export const isFreelanceFurniture = (type: string | undefined): boolean =>
  FREELANCE_FURNITURE_TYPES.includes((type ?? '').split(':')[0]);

/** Recommended results nobody marked yet, over every request (the world map lights one pin each). */
export function openLeads(status: SearchRoomStatus | undefined): number {
  if (!status) return 0;
  let n = 0;
  for (const req of status.requests)
    for (const r of req.results) if (r.verdict === 'recomendado' && !r.mark) n++;
  return n;
}

/** Feeds both stores from the server (call it from App from the start: the status comes once on open). */
export function useFreelance(transport: MessageTransport): void {
  useSearchRoom(transport, freelanceStore);
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'freelanceStatus') freelanceOfferStore.set(msg);
      }),
    [transport],
  );
}
