import type React from "react";

type AnyDragEvent = DragEvent | React.DragEvent;

/** True only when the drag carries files (ignores text/link/selection drags). */
export function dragHasFiles(e: AnyDragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

/** Same type rules RespondModal's upload input uses (image, GIF, HEIC, video). */
export function isSupportedPostFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    /\.(heic|heif|gif|mp4|mov|webm)$/.test(name)
  );
}

export function isSupportedAvatarFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif)$/.test(file.name.toLowerCase());
}
