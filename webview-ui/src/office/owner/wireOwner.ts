import { OWNER_LEAVE_FAILSAFE_MS } from '../../constants.js';
import { setBeforeLeave } from '../../offices.js';
import type { OfficeState } from '../engine/officeState.js';

/**
 * Changing floor (or building) waits for the owner to walk out (office/owner): the elevator asks here before the
 * page goes. The page goes anyway after a moment, so a hidden tab (no frames running) never gets stuck.
 */
export function wireOwnerLeave(getOfficeState: () => OfficeState): void {
  setBeforeLeave((go) => {
    let went = false;
    const once = () => {
      if (went) return;
      went = true;
      go();
    };
    window.setTimeout(once, OWNER_LEAVE_FAILSAFE_MS);
    getOfficeState().ownerLeave(once);
  });
}
