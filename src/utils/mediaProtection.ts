import type React from "react";

export const blockMediaEvent = (e: React.SyntheticEvent) => {
  e.preventDefault();
};

/** Spread onto every <img>/<video> that shows clip media. */
export const protectedMediaProps = {
  draggable: false,
  onContextMenu: blockMediaEvent,
  onDragStart: blockMediaEvent,
} as const;

export const PROTECTED_MEDIA_CLASS = "reax-protected-media";
