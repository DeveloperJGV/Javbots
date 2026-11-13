import { useEffect, useRef, useState } from 'react';

import {
  ELEVATOR_PLATE_SELECTOR,
  OWNER_LABEL_FONT_PX,
  OWNER_LABEL_RAISE_PX,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import { renderDpr } from '../../viewScale.js';
import type { OfficeState } from '../engine/officeState.js';
import { sittingDropPx } from '../engine/posture.js';
import { overlayProjection } from '../projection.js';
import { setOwnerCover } from './ownerCover.js';
import { ownerLabel } from './ownerStore.js';

interface OwnerLabelProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

/**
 * The owner's name over its head while the cursor is on it (office/owner). Same panel as an agent's label
 * (ToolOverlay), without status: the owner is not an agent.
 */
export function OwnerLabel({ officeState, containerRef, zoom, panRef }: OwnerLabelProps) {
  const [, setTick] = useState(0);
  const shown = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Tells the owner which tiles are hidden (off the view, or behind the elevator plate) with the camera as it is
  // now (ownerCover.ts)
  useEffect(() => {
    setOwnerCover((box) => {
      const el = containerRef.current;
      const plate = document.querySelector(ELEVATOR_PLATE_SELECTOR);
      if (!el) return false;
      const area = el.getBoundingClientRect();
      const project = overlayProjection(
        officeState.getLayout(),
        area,
        zoomRef.current,
        panRef.current,
        renderDpr(),
      );
      const left = area.left + project.toScreenX(box.left);
      const right = area.left + project.toScreenX(box.right);
      const top = area.top + project.toScreenY(box.top);
      const bottom = area.top + project.toScreenY(box.bottom);
      // Hidden when any part of him falls outside the office view or under the plate
      const outside =
        left < area.left || right > area.right || top < area.top || bottom > area.bottom;
      if (outside || !plate) return outside;
      const p = plate.getBoundingClientRect();
      return left < p.right && right > p.left && top < p.bottom && bottom > p.top;
    });
    return () => setOwnerCover(null);
  }, [officeState, containerRef, panRef]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      // Re-render only while the label is up (it follows him), and once more to take it down
      const hovered = officeState.ownerHovered && officeState.owner !== null;
      if (hovered || shown.current) setTick((n) => n + 1);
      shown.current = hovered;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [officeState]);

  const el = containerRef.current;
  const ch = officeState.owner;
  if (!el || !ch || !officeState.ownerHovered) return null;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    renderDpr(),
  );
  const screenX = project.toScreenX(ch.x);
  const screenY = project.toScreenY(ch.y + sittingDropPx(ch) - TOOL_OVERLAY_VERTICAL_OFFSET);

  return (
    <div
      className="absolute -translate-x-1/2 flex items-center border-border px-8 pt-2 pb-4 pixel-panel whitespace-nowrap max-w-2xs"
      style={{
        left: screenX,
        top: screenY - OWNER_LABEL_RAISE_PX,
        pointerEvents: 'none',
        zIndex: 41,
      }}
      data-testid="owner-label"
    >
      <span
        className="overflow-hidden text-ellipsis block leading-none"
        style={{ fontSize: OWNER_LABEL_FONT_PX }}
      >
        {ownerLabel()}
      </span>
    </div>
  );
}
