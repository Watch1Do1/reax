// The `style` stored on a clip (clips.style jsonb) and its validation.
// Used by the server to enforce ownership on create, and by the client to
// build/render styles. All values are item ids from manifest.ts.

import { PACK_IDS, PackId, PackItemKind, canUseItem, findPackItem } from "./manifest";

export interface PlacedSticker {
  id: string;
  // Center position as a fraction of the media's width/height (0..1).
  x: number;
  y: number;
  // 1 = 20% of the media's shorter side.
  scale: number;
  // Degrees.
  rot: number;
}

export interface ClipStyle {
  v: 1;
  // The pack the "made with the ___ Pack" tag links to (the pack most items come from).
  packId: PackId;
  font?: string;
  color?: string;
  frame?: string;
  caption?: string;
  effect?: string;
  stickers?: PlacedSticker[];
}

export const MAX_STICKERS = 8;
export const STICKER_SCALE_MIN = 0.3;
export const STICKER_SCALE_MAX = 3;
const MAX_STYLE_JSON_CHARS = 4000;

export type StyleResult =
  | { ok: true; style: ClipStyle | null }
  | { ok: false; status: number; error: string };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Validates and normalizes a client-supplied style. Every item must exist, be of
// the right kind, and be usable by someone owning `ownedPackIds` (free samples are
// always usable). Unknown keys are dropped. Returns style: null when nothing is set.
export function sanitizeClipStyle(raw: unknown, ownedPackIds: readonly string[]): StyleResult {
  if (raw === undefined || raw === null) return { ok: true, style: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Invalid style." };
  }
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return { ok: false, status: 400, error: "Invalid style." };
  }
  if (size > MAX_STYLE_JSON_CHARS) {
    return { ok: false, status: 400, error: "Style is too large." };
  }

  const input = raw as Record<string, unknown>;
  const usedPacks: string[] = [];
  const out: Omit<ClipStyle, "v" | "packId"> = {};

  const checkItem = (value: unknown, kind: PackItemKind, label: string): StyleResult | string | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") return { ok: false, status: 400, error: `Invalid ${label}.` };
    const ref = findPackItem(value);
    if (!ref || ref.kind !== kind) return { ok: false, status: 400, error: `Unknown ${label}.` };
    if (!canUseItem(value, ownedPackIds)) {
      return { ok: false, status: 403, error: `You don't own the ${ref.pack.name} Pack ${label} you picked.` };
    }
    usedPacks.push(ref.pack.id);
    return value;
  };

  const fields: Array<[keyof typeof out, PackItemKind, string]> = [
    ["font", "font", "font"],
    ["color", "color", "color"],
    ["frame", "frame", "frame"],
    ["caption", "caption", "caption style"],
    ["effect", "effect", "effect"],
  ];
  for (const [key, kind, label] of fields) {
    const res = checkItem(input[key], kind, label);
    if (res && typeof res === "object") return res;
    if (typeof res === "string") (out as any)[key] = res;
  }

  if (input.stickers !== undefined && input.stickers !== null) {
    if (!Array.isArray(input.stickers)) return { ok: false, status: 400, error: "Invalid stickers." };
    if (input.stickers.length > MAX_STICKERS) {
      return { ok: false, status: 400, error: `Up to ${MAX_STICKERS} stickers per reaction.` };
    }
    const stickers: PlacedSticker[] = [];
    for (const s of input.stickers) {
      if (!s || typeof s !== "object") return { ok: false, status: 400, error: "Invalid sticker." };
      const st = s as Record<string, unknown>;
      const res = checkItem(st.id, "sticker", "sticker");
      if (res && typeof res === "object") return res;
      if (typeof res !== "string") return { ok: false, status: 400, error: "Invalid sticker." };
      stickers.push({
        id: res,
        x: round3(clamp(num(st.x, 0.5), 0, 1)),
        y: round3(clamp(num(st.y, 0.5), 0, 1)),
        scale: round3(clamp(num(st.scale, 1), STICKER_SCALE_MIN, STICKER_SCALE_MAX)),
        rot: Math.round(clamp(num(st.rot, 0), -180, 180)),
      });
    }
    if (stickers.length) out.stickers = stickers;
  }

  if (usedPacks.length === 0) return { ok: true, style: null };

  // Tag the pack that contributed the most items (first one wins ties).
  const counts = new Map<string, number>();
  usedPacks.forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
  let packId = usedPacks[0];
  counts.forEach((n, p) => {
    if (n > (counts.get(packId) || 0)) packId = p;
  });

  return { ok: true, style: { v: 1, packId: packId as PackId, ...out } };
}

// Lenient read-side normalization for rendering rows from the database:
// keeps only well-formed, known items (no ownership check; that happened on create).
export function readClipStyle(raw: unknown): ClipStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const res = sanitizeClipStyle(raw, PACK_IDS);
  return res.ok ? res.style : null;
}
