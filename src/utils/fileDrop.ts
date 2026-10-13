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

/**
 * Pull the dropped file out of a drop event's DataTransfer.
 * Must be called synchronously inside the drop handler (the browser wipes
 * DataTransfer contents once the handler returns); the returned promise may
 * resolve later.
 *
 * Order:
 *  1. dataTransfer.files (normal Finder / Explorer drag)
 *  2. dataTransfer.items[].getAsFile() (some Safari/Chrome drags fill items but not files)
 *  3. An image URL from text/uri-list (image dragged out of another browser tab)
 * macOS "file promise" drags (the floating screenshot thumbnail, Photos, Mail
 * attachments) report type "Files" but deliver no bytes to web pages; those
 * resolve to null so the caller can tell the user instead of doing nothing.
 */
export function readDroppedFile(dt: DataTransfer | null | undefined): Promise<File | null> {
  if (!dt) return Promise.resolve(null);
  const direct = dt.files && dt.files.length > 0 ? dt.files[0] : null;
  if (direct) return Promise.resolve(direct);

  if (dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) return Promise.resolve(f);
      }
    }
  }

  const uriList = dt.getData("text/uri-list") || "";
  const url = uriList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && /^(https?:|data:image\/|blob:)/i.test(l));
  if (!url) return Promise.resolve(null);

  return (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") && !blob.type.startsWith("video/")) return null;
      const ext = (blob.type.split("/")[1] || "bin").replace("jpeg", "jpg").replace("quicktime", "mov");
      const base = (url.startsWith("data:") ? "dropped" : url.split("/").pop()?.split(/[?#]/)[0]) || "dropped";
      const name = /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
      return new File([blob], name, { type: blob.type });
    } catch (err) {
      // Usually CORS on images dragged from other sites; caller shows a message
      console.warn("Could not fetch dragged image URL:", err);
      return null;
    }
  })();
}

export const UNREADABLE_DROP_MESSAGE =
  "Couldn't read that file. Save it to your computer first (e.g. Desktop), then drag it from Finder, or use Choose File.";
