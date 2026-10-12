import type { Clip } from "../types";

export const VOICE_IT_EVENT = "reax_voice_it";
export const VOICE_IT_MAX_MS = 5000;

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** True when a clip is a still image/GIF that can be reused for a "Voice it" reply. */
export function isVoiceItEligible(clip: Clip | null | undefined): boolean {
  if (!clip || clip.deleted) return false;
  const url = clip.mediaUrl || "";
  if (!url.startsWith("https://")) return false;
  if (clip.mediaType === "video" || clip.mediaType === "audio") return false;
  if (VIDEO_RE.test(url) || url.includes("mixkit-") || url.includes("uploads/clip-")) return false;
  return true;
}

/** Ask App to open the Voice it recorder for this clip. */
export function openVoiceIt(clip: Clip, e?: { stopPropagation: () => void; preventDefault: () => void }) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  window.dispatchEvent(new CustomEvent(VOICE_IT_EVENT, { detail: { clip } }));
}

/** Pick a recorder mime the browser supports (iOS Safari only does audio/mp4). */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/wav"];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return "";
}
