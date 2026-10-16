// Canvas versions of the Reaction Pack layers (step 3), used when exporting a
// clip as a picture or as the overlay PNG the video worker composites. Mirrors
// PackStyleLayer / packs.css so downloads look like the post. Motion (CSS
// animations) can't be baked into a still, so animated effects are drawn at rest.
import { ClipStyle } from "./style";
import { PackCaptionStyle, PackFont, findCaptionStyle, findColor, findEffect, findFont, findSticker, getPack } from "./manifest";

export interface PackExportAssets {
  style: ClipStyle;
  stickers: Map<string, HTMLImageElement>;
  font: PackFont | null;
  colorHex: string | null;
  caption: PackCaptionStyle | null;
}

function loadSameOriginImage(src: string): Promise<HTMLImageElement> {
  // Pack assets are served from this site's /packs folder, so drawing them never taints the canvas.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load the pack sticker ${src}.`));
    img.src = src;
  });
}

async function ensureFontLoaded(font: PackFont): Promise<void> {
  const spec = `400 32px "${font.family}"`;
  if (document.fonts.check(spec)) return;
  const loaded = await document.fonts.load(spec);
  if (loaded.length > 0) return;
  // packs.css declares every pack font; if the browser didn't pick it up, register it directly.
  const face = new FontFace(font.family, `url("${font.file}") format("woff2")`);
  await face.load();
  document.fonts.add(face);
}

/** Loads the stickers and caption font a clip's pack style needs. Null when the clip has no pack style. */
export async function preparePackExport(style: ClipStyle | null | undefined): Promise<PackExportAssets | null> {
  if (!style || !getPack(style.packId)) return null;
  const caption = findCaptionStyle(style.caption) || null;
  const font = findFont(style.font || caption?.fontId) || null;
  const color = findColor(style.color || caption?.colorId) || null;
  const stickers = new Map<string, HTMLImageElement>();
  const ids = Array.from(new Set((style.stickers || []).map((s) => s.id)));
  await Promise.all([
    ...ids.map(async (id) => {
      const def = findSticker(id);
      if (def) stickers.set(id, await loadSameOriginImage(def.src));
    }),
    font ? ensureFontLoaded(font) : Promise.resolve(),
  ]);
  return { style, stickers, font, colorHex: color ? color.hex : null, caption };
}

/** Static media effects (pictures only): Muted = saturate(.35), Deadpan = its grayscale hold. */
export function applyPackMediaFilter(ctx: CanvasRenderingContext2D, width: number, height: number, assets: PackExportAssets | null): void {
  const fx = findEffect(assets?.style.effect);
  if (!fx || fx.target !== "media") return;
  let sat: number;
  if (fx.id === "sarcasm-fx-muted") sat = 0.35;
  else if (fx.id === "sarcasm-fx-deadpan-freeze") sat = 0;
  else return; // glitch / jitter / slow zoom are pure motion
  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    // Same luminance weights as the CSS saturate() filter.
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    px[i] = l + (r - l) * sat;
    px[i + 1] = l + (g - l) * sat;
    px[i + 2] = l + (b - l) * sat;
  }
  ctx.putImageData(data, 0, 0);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFrame(ctx: CanvasRenderingContext2D, frameId: string, w: number, h: number, fontFamily: string | null) {
  const u = Math.min(w, h) / 100; // 1cqmin
  ctx.save();
  switch (frameId) {
    case "chaos-frame-signal-lost": {
      const b = Math.max(3, 1.6 * u);
      ctx.strokeStyle = "#FF1E3C";
      ctx.lineWidth = b;
      ctx.strokeRect(b / 2, b / 2, w - b, h - b);
      ctx.fillStyle = "#00F0FF";
      const iw = w - 2 * b, ih = h - 2 * b;
      ctx.fillRect(b + iw * 0.06, b - u, iw * 0.14, 3.5 * u);
      ctx.fillRect(w - b + u - 3.5 * u, b + ih * 0.1, 3.5 * u, ih * 0.12);
      ctx.fillRect(w - b - iw * 0.18 - iw * 0.1, h - b + u - 3.5 * u, iw * 0.1, 3.5 * u);
      break;
    }
    case "funny-frame-comic-panel": {
      const b = Math.max(3, 2 * u);
      const inner = Math.max(2, 0.8 * u);
      ctx.strokeStyle = "#1B1B1B";
      ctx.lineWidth = b;
      ctx.strokeRect(b / 2, b / 2, w - b, h - b);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = inner;
      ctx.strokeRect(b + inner / 2, b + inner / 2, w - 2 * b - inner, h - 2 * b - inner);
      // Halftone corners: dots fade out diagonally toward the middle.
      const size = 22 * u, step = 3 * u, r = step * 0.28;
      const corners: Array<[number, number, number, number]> = [
        [b + u, b + u, 1, 1], [w - b - u - size, b + u, -1, 1],
        [b + u, h - b - u - size, 1, -1], [w - b - u - size, h - b - u - size, -1, -1],
      ];
      ctx.fillStyle = "#1B1B1B";
      for (const [x0, y0, dx, dy] of corners) {
        for (let cy = step / 2; cy < size; cy += step) {
          for (let cx = step / 2; cx < size; cx += step) {
            const fx = dx > 0 ? cx / size : 1 - cx / size;
            const fy = dy > 0 ? cy / size : 1 - cy / size;
            const t = (fx + fy) / 2 / 0.7;
            if (t >= 1) continue;
            ctx.globalAlpha = 0.55 * (1 - t);
            ctx.beginPath();
            ctx.arc(x0 + cx, y0 + cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      break;
    }
    case "drama-frame-letterbox": {
      const bar = h * 0.12;
      const line = Math.max(1, 0.5 * u);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      ctx.fillStyle = "#C9A227";
      ctx.fillRect(0, bar - line, w, line);
      ctx.fillRect(0, h - bar, w, line);
      break;
    }
    case "sarcasm-frame-memo": {
      const b = Math.max(2, 0.6 * u);
      ctx.strokeStyle = "#6B7280";
      ctx.lineWidth = b;
      ctx.strokeRect(b / 2, b / 2, w - b, h - b);
      const fs = Math.max(8, 3.6 * u);
      const barH = fs * 1.5 + 2 * u;
      const line = Math.max(1, 0.4 * u);
      ctx.fillStyle = "#F3F4F6";
      ctx.fillRect(b, b, w - 2 * b, barH);
      ctx.fillStyle = "#6B7280";
      ctx.fillRect(b, b + barH, w - 2 * b, line);
      ctx.fillStyle = "#111827";
      ctx.font = `400 ${fs}px ${fontFamily ? `"${fontFamily}", ` : ""}ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("RE: your take", b + 2.5 * u, b + barH / 2);
      break;
    }
    case "chill-frame-soft-focus": {
      const b = Math.max(3, 1.6 * u);
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#BDE0FE");
      grad.addColorStop(0.5, "#CDB4DB");
      grad.addColorStop(1, "#FFC8DD");
      ctx.strokeStyle = grad;
      ctx.lineWidth = b;
      roundRectPath(ctx, b / 2, b / 2, w - b, h - b, Math.max(0, 6 * u - b / 2));
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawOverlayEffect(ctx: CanvasRenderingContext2D, effectId: string, w: number, h: number) {
  ctx.save();
  if (effectId === "drama-fx-vignette") {
    // radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.7) 100%), farthest-corner ellipse.
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 2 * Math.SQRT2, h / 2 * Math.SQRT2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0.45, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
  } else if (effectId === "chill-fx-pastel-wash") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#BDE0FE");
    g.addColorStop(0.5, "#CDB4DB");
    g.addColorStop(1, "#FFC8DD");
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Overlay effect, frame, then stickers, over the media area (0,0)-(w,h). Order matches PackStyleLayer. */
export function drawPackLayers(ctx: CanvasRenderingContext2D, w: number, h: number, assets: PackExportAssets | null): void {
  if (!assets) return;
  const { style } = assets;
  const fx = findEffect(style.effect);
  if (fx && fx.target === "overlay") drawOverlayEffect(ctx, fx.id, w, h);
  if (style.frame) drawFrame(ctx, style.frame, w, h, findFont("sarcasm-font-plex-mono")?.family || null);
  const base = Math.min(w, h) * 0.2; // .pack-sticker is 20cqmin
  for (const s of style.stickers || []) {
    const img = assets.stickers.get(s.id);
    if (!img) continue;
    const size = base * s.scale;
    ctx.save();
    ctx.translate(s.x * w, s.y * h);
    ctx.rotate((s.rot * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

/** Caption look for the canvas: font family, fill color, letter case and decoration. */
export interface PackCaptionLook {
  family: string | null;
  colorHex: string | null;
  textCase: "upper" | "lower" | null;
  decoration: "meltdown" | "punchline" | "oscar" | "oh-really" | "good-vibes" | null;
}

export function packCaptionLook(assets: PackExportAssets | null): PackCaptionLook | null {
  if (!assets || (!assets.font && !assets.colorHex && !assets.caption)) return null;
  const cap = assets.caption;
  const decoration: PackCaptionLook["decoration"] =
    cap?.id === "chaos-caption-meltdown" ? "meltdown" :
    cap?.id === "funny-caption-punchline" ? "punchline" :
    cap?.id === "drama-caption-oscar" ? "oscar" :
    cap?.id === "sarcasm-caption-oh-really" ? "oh-really" :
    cap?.id === "chill-caption-good-vibes" ? "good-vibes" : null;
  return {
    family: assets.font ? assets.font.family : null,
    colorHex: assets.colorHex,
    textCase: cap?.uppercase ? "upper" : cap?.lowercase ? "lower" : null,
    decoration,
  };
}
