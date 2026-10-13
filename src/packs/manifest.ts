// Reaction Packs manifest (step 1).
// Single source of truth for pack contents, shared by the client (editor,
// Packs page, rendering) and the server (ownership checks on clip create).
// Assets live in /public/packs: fonts (WOFF2 + OFL.txt), stickers (SVG), covers (PNG).

export type PackId = "chaos" | "funny" | "drama" | "sarcasm" | "chill";
export type PackTone = "chaotic" | "funny" | "dramatic" | "sarcastic" | "chill";

export type PackItemKind = "font" | "color" | "frame" | "sticker" | "effect" | "caption";

// Where an effect is applied when rendering:
// - media:    CSS class on the picture/video itself
// - overlay:  an extra layer drawn over the media
// - caption:  CSS class on the caption text
// - stickers: CSS class on every placed sticker
export type PackEffectTarget = "media" | "overlay" | "caption" | "stickers";

export interface PackFont { id: string; name: string; family: string; file: string; role: string; }
export interface PackColor { id: string; name: string; hex: string; }
export interface PackSticker { id: string; name: string; src: string; }
export interface PackFrame { id: string; name: string; }
export interface PackEffect { id: string; name: string; target: PackEffectTarget; className: string; description: string; }
export interface PackCaptionStyle { id: string; name: string; fontId: string; colorId: string; className: string; uppercase?: boolean; lowercase?: boolean; }

export interface ReactionPack {
  id: PackId;
  name: string;
  tagline: string;
  tone: PackTone;
  cover: string;
  accent: string;
  fonts: PackFont[];
  palette: PackColor[];
  stickers: PackSticker[];
  frame: PackFrame;
  effects: PackEffect[];
  captionStyle: PackCaptionStyle;
  // Item id that everyone can use for free.
  freeSampleId: string;
}

const font = (id: string, name: string, family: string, file: string, role: string): PackFont => ({ id, name, family, file: `/packs/fonts/${file}`, role });
const color = (id: string, name: string, hex: string): PackColor => ({ id, name, hex });
const sticker = (id: string, name: string): PackSticker => ({ id, name, src: `/packs/stickers/${id}.svg` });

export const REACTION_PACKS: ReactionPack[] = [
  {
    id: "chaos",
    name: "Chaos Mode",
    tagline: "Everything is fine.",
    tone: "chaotic",
    cover: "/packs/covers/chaos.png",
    accent: "#FF1E3C",
    fonts: [
      font("chaos-font-rubik-glitch", "Rubik Glitch", "Reax Rubik Glitch", "RubikGlitch-Regular.woff2", "Headline"),
      font("chaos-font-bungee", "Bungee", "Reax Bungee", "Bungee-Regular.woff2", "Bold body"),
    ],
    palette: [
      color("chaos-color-void", "Void black", "#0A0A0A"),
      color("chaos-color-alarm", "Alarm red", "#FF1E3C"),
      color("chaos-color-white", "White", "#FFFFFF"),
      color("chaos-color-cyan", "Glitch cyan", "#00F0FF"),
      color("chaos-color-dark-red", "Dark red", "#7A0012"),
    ],
    stickers: [
      sticker("chaos-bolt", "Lightning bolt"),
      sticker("chaos-interrobang", "!?"),
      sticker("chaos-tape", "Torn tape"),
      sticker("chaos-warning", "Warning"),
      sticker("chaos-crack", "Cracked screen"),
      sticker("chaos-bars", "Broken signal"),
      sticker("chaos-alarm", "Fire alarm"),
    ],
    frame: { id: "chaos-frame-signal-lost", name: "Signal Lost" },
    effects: [
      { id: "chaos-fx-glitch", name: "Glitch", target: "media", className: "pack-fx-glitch", description: "Red/cyan channel split with stepped slices." },
      { id: "chaos-fx-jitter", name: "Jitter", target: "media", className: "pack-fx-jitter", description: "Nervous little shakes." },
    ],
    captionStyle: { id: "chaos-caption-meltdown", name: "MELTDOWN", fontId: "chaos-font-rubik-glitch", colorId: "chaos-color-white", className: "pack-cap-meltdown", uppercase: true },
    freeSampleId: "chaos-bolt",
  },
  {
    id: "funny",
    name: "Funny",
    tagline: "Punchline delivered.",
    tone: "funny",
    cover: "/packs/covers/funny.png",
    accent: "#FFD60A",
    fonts: [
      font("funny-font-bangers", "Bangers", "Reax Bangers", "Bangers-Regular.woff2", "Comic caption"),
      font("funny-font-lilita", "Lilita One", "Reax Lilita One", "LilitaOne-Regular.woff2", "Rounded bold"),
    ],
    palette: [
      color("funny-color-yellow", "Punch yellow", "#FFD60A"),
      color("funny-color-tangerine", "Tangerine", "#FF6B35"),
      color("funny-color-ink", "Ink", "#1B1B1B"),
      color("funny-color-white", "White", "#FFFFFF"),
      color("funny-color-blue", "Pop blue", "#3A86FF"),
    ],
    stickers: [
      sticker("funny-ha-burst", "HA! burst"),
      sticker("funny-grin", "Grin"),
      sticker("funny-star", "Star"),
      sticker("funny-bubble", "Speech bubble"),
      sticker("funny-lol", "LOL"),
      sticker("funny-badumtss", "Ba-dum-tss"),
      sticker("funny-joy-tear", "Tear of joy"),
      sticker("funny-motion", "Motion lines"),
    ],
    frame: { id: "funny-frame-comic-panel", name: "Comic Panel" },
    effects: [
      { id: "funny-fx-punch-zoom", name: "Punch Zoom", target: "caption", className: "pack-fx-punch-zoom", description: "Caption pops in with a punch." },
      { id: "funny-fx-bounce", name: "Bounce", target: "stickers", className: "pack-fx-bounce", description: "Stickers bounce on a loop." },
    ],
    captionStyle: { id: "funny-caption-punchline", name: "PUNCHLINE", fontId: "funny-font-bangers", colorId: "funny-color-yellow", className: "pack-cap-punchline", uppercase: true },
    freeSampleId: "funny-ha-burst",
  },
  {
    id: "drama",
    name: "Drama",
    tagline: "Cue the violins.",
    tone: "dramatic",
    cover: "/packs/covers/drama.png",
    accent: "#C9A227",
    fonts: [
      font("drama-font-playfair", "Playfair Display", "Reax Playfair Display", "PlayfairDisplay-VF.woff2", "Elegant serif"),
      font("drama-font-cinzel", "Cinzel", "Reax Cinzel", "Cinzel-VF.woff2", "Title caps"),
    ],
    palette: [
      color("drama-color-midnight", "Midnight", "#0D0D12"),
      color("drama-color-gold", "Gold", "#C9A227"),
      color("drama-color-velvet", "Velvet red", "#8B0000"),
      color("drama-color-parchment", "Parchment", "#F5F0E6"),
      color("drama-color-smoke", "Smoke", "#3C3C46"),
    ],
    stickers: [
      sticker("drama-curtains", "Stage curtains"),
      sticker("drama-spotlight", "Spotlight"),
      sticker("drama-tear", "Falling tear"),
      sticker("drama-halo", "Gold halo"),
      sticker("drama-broken-heart", "Broken heart"),
      sticker("drama-the-end", "THE END"),
      sticker("drama-rose", "Rose"),
    ],
    frame: { id: "drama-frame-letterbox", name: "Letterbox" },
    effects: [
      { id: "drama-fx-slow-zoom", name: "Slow Zoom", target: "media", className: "pack-fx-slow-zoom", description: "Ken Burns push-in with a slight pan." },
      { id: "drama-fx-vignette", name: "Vignette", target: "overlay", className: "pack-fx-vignette", description: "Dark edges, slightly desaturated." },
    ],
    captionStyle: { id: "drama-caption-oscar", name: "OSCAR MOMENT", fontId: "drama-font-cinzel", colorId: "drama-color-parchment", className: "pack-cap-oscar" },
    freeSampleId: "drama-frame-letterbox",
  },
  {
    id: "sarcasm",
    name: "Sarcasm",
    tagline: "Wow. Groundbreaking.",
    tone: "sarcastic",
    cover: "/packs/covers/sarcasm.png",
    accent: "#A3B18A",
    fonts: [
      font("sarcasm-font-plex-mono", "IBM Plex Mono", "Reax IBM Plex Mono", "IBMPlexMono-Regular.woff2", "Deadpan"),
      font("sarcasm-font-courier-prime", "Courier Prime", "Reax Courier Prime", "CourierPrime-Regular.woff2", "Typewriter"),
    ],
    palette: [
      color("sarcasm-color-slate", "Slate", "#6B7280"),
      color("sarcasm-color-fog", "Fog", "#D1D5DB"),
      color("sarcasm-color-near-black", "Near-black", "#111827"),
      color("sarcasm-color-sage", "Sage", "#A3B18A"),
      color("sarcasm-color-paper", "Paper", "#F3F4F6"),
    ],
    stickers: [
      sticker("sarcasm-eye-roll", "Eye roll"),
      sticker("sarcasm-k", "k."),
      sticker("sarcasm-flat-mouth", "Flat mouth"),
      sticker("sarcasm-slow-clap", "Slow clap"),
      sticker("sarcasm-air-quotes", "Air quotes"),
      sticker("sarcasm-one-star", "×1 star"),
      sticker("sarcasm-sure-note", "sure."),
    ],
    frame: { id: "sarcasm-frame-memo", name: "Memo" },
    effects: [
      { id: "sarcasm-fx-deadpan-freeze", name: "Deadpan Freeze", target: "media", className: "pack-fx-deadpan", description: "Drops to grayscale and holds, deadpan." },
      { id: "sarcasm-fx-muted", name: "Muted", target: "media", className: "pack-fx-muted", description: "Washed-out colors." },
    ],
    captionStyle: { id: "sarcasm-caption-oh-really", name: "OH REALLY", fontId: "sarcasm-font-plex-mono", colorId: "sarcasm-color-near-black", className: "pack-cap-oh-really", lowercase: true },
    freeSampleId: "sarcasm-eye-roll",
  },
  {
    id: "chill",
    name: "Chill",
    tagline: "No rush. Ever.",
    tone: "chill",
    cover: "/packs/covers/chill.png",
    accent: "#BDE0FE",
    fonts: [
      font("chill-font-quicksand", "Quicksand", "Reax Quicksand", "Quicksand-VF.woff2", "Soft rounded"),
      font("chill-font-pacifico", "Pacifico", "Reax Pacifico", "Pacifico-Regular.woff2", "Script"),
    ],
    palette: [
      color("chill-color-sky", "Sky", "#BDE0FE"),
      color("chill-color-lavender", "Lavender", "#CDB4DB"),
      color("chill-color-blush", "Blush", "#FFC8DD"),
      color("chill-color-mint", "Mint", "#B9FBC0"),
      color("chill-color-deep-slate", "Deep slate", "#2B2D42"),
    ],
    stickers: [
      sticker("chill-moon", "Crescent moon"),
      sticker("chill-waves", "Waves"),
      sticker("chill-cloud", "Puffy cloud"),
      sticker("chill-sun", "Little sun"),
      sticker("chill-leaf", "Leaf"),
      sticker("chill-mug", "Steaming mug"),
      sticker("chill-sparkle", "Sparkle"),
    ],
    frame: { id: "chill-frame-soft-focus", name: "Soft Focus" },
    effects: [
      { id: "chill-fx-float", name: "Float", target: "stickers", className: "pack-fx-float", description: "Stickers drift gently." },
      { id: "chill-fx-pastel-wash", name: "Pastel Wash", target: "overlay", className: "pack-fx-pastel-wash", description: "Soft pastel glow that slowly shifts." },
    ],
    captionStyle: { id: "chill-caption-good-vibes", name: "GOOD VIBES", fontId: "chill-font-pacifico", colorId: "chill-color-deep-slate", className: "pack-cap-good-vibes" },
    freeSampleId: "chill-cloud",
  },
];

export const PACK_IDS: PackId[] = REACTION_PACKS.map((p) => p.id);

export function isPackId(value: unknown): value is PackId {
  return typeof value === "string" && (PACK_IDS as string[]).includes(value);
}

export function getPack(id: string | null | undefined): ReactionPack | undefined {
  return REACTION_PACKS.find((p) => p.id === id);
}

export function packForTone(tone: string | null | undefined): ReactionPack | undefined {
  return REACTION_PACKS.find((p) => p.tone === tone);
}

// Packs ordered so the one matching the current mood comes first.
export function packsForTone(tone: string | null | undefined): ReactionPack[] {
  const match = packForTone(tone);
  return match ? [match, ...REACTION_PACKS.filter((p) => p.id !== match.id)] : REACTION_PACKS;
}

export interface PackItemRef { pack: ReactionPack; kind: PackItemKind; }

const ITEM_INDEX: Map<string, PackItemRef> = (() => {
  const index = new Map<string, PackItemRef>();
  for (const pack of REACTION_PACKS) {
    pack.fonts.forEach((f) => index.set(f.id, { pack, kind: "font" }));
    pack.palette.forEach((c) => index.set(c.id, { pack, kind: "color" }));
    pack.stickers.forEach((s) => index.set(s.id, { pack, kind: "sticker" }));
    index.set(pack.frame.id, { pack, kind: "frame" });
    pack.effects.forEach((e) => index.set(e.id, { pack, kind: "effect" }));
    index.set(pack.captionStyle.id, { pack, kind: "caption" });
  }
  return index;
})();

export function findPackItem(itemId: string | null | undefined): PackItemRef | undefined {
  return itemId ? ITEM_INDEX.get(itemId) : undefined;
}

export const findFont = (id?: string | null) => REACTION_PACKS.flatMap((p) => p.fonts).find((f) => f.id === id);
export const findColor = (id?: string | null) => REACTION_PACKS.flatMap((p) => p.palette).find((c) => c.id === id);
export const findSticker = (id?: string | null) => REACTION_PACKS.flatMap((p) => p.stickers).find((s) => s.id === id);
export const findEffect = (id?: string | null) => REACTION_PACKS.flatMap((p) => p.effects).find((e) => e.id === id);
export const findCaptionStyle = (id?: string | null) => REACTION_PACKS.map((p) => p.captionStyle).find((c) => c.id === id);

// An item is usable if its pack is owned, or it is that pack's free sample.
export function canUseItem(itemId: string, ownedPackIds: readonly string[]): boolean {
  const ref = findPackItem(itemId);
  if (!ref) return false;
  return ownedPackIds.includes(ref.pack.id) || ref.pack.freeSampleId === itemId;
}
