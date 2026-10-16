import { Clip } from "../types";
import { getAuthToken } from "./supabaseClient";
import { PackExportAssets, applyPackMediaFilter, drawPackLayers, packCaptionLook, preparePackExport } from "../packs/exportRender";

/**
 * Safely draw a rounded rectangle on a 2D canvas context across all browser engines.
 */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Load image with CORS resilience (using blob URL fallback if direct crossOrigin fails).
 */
async function loadCORSImage(src: string, existingImg?: HTMLImageElement | null): Promise<HTMLImageElement> {
  // Check if existing element is already rendered and test-drawable
  if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
    try {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 1;
      testCanvas.height = 1;
      const testCtx = testCanvas.getContext("2d");
      testCtx?.drawImage(existingImg, 0, 0, 1, 1);
      testCanvas.toDataURL();
      return existingImg;
    } catch {
      // Element is tainted, fetch freshly via blob below
    }
  }

  // Fetch as blob to bypass CORS canvas tainting
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load blob image"));
      img.src = blobUrl;
    });
  } catch {
    // Fallback standard crossOrigin anonymous load
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load crossOrigin image"));
      img.src = src;
    });
  }
}

/**
 * Generates a high-resolution, pixel-perfect watermarked canvas for a Clip.
 * - Auto-scales font so 100% of caption words fit without EVER cutting off or using ellipses (...).
 * - Burns a bold, high-contrast, beautiful 'getREAX.com' watermark pill badge that is never lost or washed out.
 */
export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "strip";
export const WATERMARK_POSITIONS: WatermarkPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right", "strip"];
export const DEFAULT_WATERMARK_POSITION: WatermarkPosition = "bottom-right";
const WATERMARK_POS_KEY = "reax_watermark_pos";

export function isWatermarkPosition(v: unknown): v is WatermarkPosition {
  return typeof v === "string" && (WATERMARK_POSITIONS as string[]).includes(v);
}

/** The user's saved watermark spot (localStorage "reax_watermark_pos"), default bottom-right. */
export function loadWatermarkPosition(): WatermarkPosition {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_WATERMARK_POSITION;
  const v = window.localStorage.getItem(WATERMARK_POS_KEY);
  return isWatermarkPosition(v) ? v : DEFAULT_WATERMARK_POSITION;
}

export function saveWatermarkPosition(pos: WatermarkPosition): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(WATERMARK_POS_KEY, pos);
}

/** Height of the dark bar added below the image when the watermark spot is "strip". */
export function getWatermarkStripHeight(width: number): number {
  const wmFontSize = Math.max(14, Math.round(width * 0.024));
  return Math.round(wmFontSize * 1.9) + Math.round(wmFontSize * 1.4);
}

export async function generateWatermarkedCanvas(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null,
  watermarkPosition: WatermarkPosition = DEFAULT_WATERMARK_POSITION
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D canvas context");

  const isVideo = clip.mediaType === "video";
  // Pack stickers + caption font (null for clips without a pack style: renders exactly as before).
  const pack = await preparePackExport(clip.style);
  let naturalW = 1280;
  let naturalH = 720;

  if (isVideo && mediaEl instanceof HTMLVideoElement && mediaEl.videoWidth > 0) {
    naturalW = mediaEl.videoWidth;
    naturalH = mediaEl.videoHeight;
    canvas.width = naturalW;
    canvas.height = naturalH + (watermarkPosition === "strip" ? getWatermarkStripHeight(naturalW) : 0);
    ctx.drawImage(mediaEl, 0, 0, naturalW, naturalH);
    applyPackMediaFilter(ctx, naturalW, naturalH, pack);
  } else {
    const imgObj = await loadCORSImage(clip.mediaUrl, mediaEl instanceof HTMLImageElement ? mediaEl : null);
    naturalW = imgObj.naturalWidth || 1280;
    naturalH = imgObj.naturalHeight || 720;

    // Ensure minimum crisp dimension for high DPI export (so small images have sharp text)
    const minWidth = 960;
    let exportW = naturalW;
    let exportH = naturalH;
    if (exportW < minWidth && exportW > 0) {
      const scale = minWidth / exportW;
      exportW = minWidth;
      exportH = Math.round(exportH * scale);
    }

    canvas.width = exportW;
    canvas.height = exportH + (watermarkPosition === "strip" ? getWatermarkStripHeight(exportW) : 0);
    ctx.drawImage(imgObj, 0, 0, exportW, exportH);
    applyPackMediaFilter(ctx, exportW, exportH, pack);
  }

  // Captions/letterboxing cover only the image area; a "strip" bar sits below it.
  const imageH = watermarkPosition === "strip" ? canvas.height - getWatermarkStripHeight(canvas.width) : canvas.height;
  renderWatermarkAndCaptions(ctx, canvas.width, imageH, clip, watermarkPosition, pack);
  return canvas;
}

/**
 * Renders the overlays, caption text, letterboxing, and the getREAX.com watermark badge.
 * Reused across both image and video frame rendering for 100% pixel-perfect consistency.
 * With `pack` (from preparePackExport), the Reaction Pack layers are drawn in post order:
 * overlay effect, frame, stickers, then the caption in the pack font, and the watermark last
 * so it is never covered. `height` is the image area; stickers are fractions of it.
 */
export function renderWatermarkAndCaptions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
  watermarkPosition: WatermarkPosition = DEFAULT_WATERMARK_POSITION,
  pack: PackExportAssets | null = null
): void {
  // Parse effect and style parameters: "effect|preset|color|position"
  const [, textStylePreset = "classic", textStyleColor = "white", textStylePosition = "bottom"] = (clip.effect || "zoom").split("|");

  // Draw Cinema black letterbox bars if cinema preset is active
  if (textStylePreset === "cinema" && textStylePosition !== "none") {
    const barHeight = Math.round(height * 0.08);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillRect(0, height - barHeight, width, barHeight);
  }

  drawPackLayers(ctx, width, height, pack);
  const look = packCaptionLook(pack);

  // 1. Overlay Caption Text (Intelligent Auto-Fitting: NEVER CUTS OFF OR USES "...")
  if (clip.overlayText && clip.overlayText.trim() && textStylePosition !== "none") {
    const rawText = clip.overlayText.trim();
    const lower = look?.textCase ? look.textCase === "lower" : textStylePreset === "comic";
    const text = lower ? rawText.toLowerCase() : rawText.toUpperCase();

    const maxTextWidth = width * 0.88;
    const maxTextHeight = textStylePosition.startsWith("top") || textStylePosition.startsWith("bottom")
      ? height * 0.36
      : height * 0.65;

    const getFontSpec = (sz: number) => {
      if (look?.family) {
        const weight =
          textStylePreset === "comic" ? "italic 900" :
          textStylePreset === "cinema" ? "400" :
          textStylePreset === "bold" ? "800" : "900";
        return `${weight} ${sz}px "${look.family}", ui-sans-serif, system-ui, sans-serif`;
      }
      if (textStylePreset === "comic") return `italic 900 ${sz}px serif`;
      if (textStylePreset === "glitch") return `900 ${sz}px monospace`;
      if (textStylePreset === "cinema") return `400 ${sz}px serif`;
      if (textStylePreset === "bold") return `800 ${sz}px sans-serif`;
      return `900 ${sz}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    };

    ctx.save();
    // Drama "Oscar" caption is letter-spaced; measureText includes the spacing where supported.
    if (look?.decoration === "oscar" && "letterSpacing" in ctx) ctx.letterSpacing = "0.2em";
    const words = text.split(/\s+/);
    let idealFontSize = Math.min(Math.round(height * 0.082), Math.round(width * 0.078));
    const minFontSize = Math.max(14, Math.round(height * 0.034));

    let fontSize = idealFontSize;
    let lineHeight = Math.round(fontSize * 1.24);
    let lines: string[] = [];

    // Iteratively step down font size until all words fit completely within width & height
    while (fontSize >= minFontSize) {
      ctx.font = getFontSpec(fontSize);
      lineHeight = Math.round(fontSize * 1.24);
      lines = [];
      let curLine = "";
      let wordExceedsWidth = false;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (ctx.measureText(w).width > maxTextWidth) {
          wordExceedsWidth = true;
          break;
        }
        const candidate = curLine ? `${curLine} ${w}` : w;
        if (ctx.measureText(candidate).width > maxTextWidth) {
          if (curLine) lines.push(curLine);
          curLine = w;
        } else {
          curLine = candidate;
        }
      }
      if (curLine) lines.push(curLine);

      const totalH = lines.length * lineHeight;
      if (!wordExceedsWidth && totalH <= maxTextHeight) {
        // Fits cleanly!
        break;
      }
      fontSize -= 2;
    }

    // Safety fallback if extremely long: format with min font size and natural wrapping
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
      ctx.font = getFontSpec(fontSize);
      lineHeight = Math.round(fontSize * 1.24);
      lines = [];
      let curLine = "";
      for (const w of words) {
        const candidate = curLine ? `${curLine} ${w}` : w;
        if (ctx.measureText(candidate).width > maxTextWidth && curLine) {
          lines.push(curLine);
          curLine = w;
        } else {
          curLine = candidate;
        }
      }
      if (curLine) lines.push(curLine);
    }

    // Determine horizontal alignment
    let baseX = width / 2;
    if (textStylePosition.includes("left")) {
      ctx.textAlign = "left";
      baseX = width * 0.06;
    } else if (textStylePosition.includes("right")) {
      ctx.textAlign = "right";
      baseX = width * 0.94;
    } else {
      ctx.textAlign = "center";
      baseX = width / 2;
    }

    // Determine vertical start
    const totalTextH = lines.length * lineHeight;
    let startY = 0;

    if (textStylePosition.startsWith("top")) {
      ctx.textBaseline = "top";
      startY = Math.max(height * 0.08, 28 * (width / 640));
    } else if (textStylePosition.startsWith("bottom")) {
      ctx.textBaseline = "top";
      const endY = height * 0.94;
      startY = endY - totalTextH;
    } else {
      ctx.textBaseline = "top";
      startY = (height - totalTextH) / 2;
    }

    // Colors & Stroke
    const colorMap: Record<string, string> = {
      white: "#ffffff",
      yellow: "#facc15",
      red: "#f43f5e",
      cyan: "#22d3ee",
      navy: "#1e3a8a",
      "navy-blue": "#1e3a8a",
    };
    const textFillColor = look?.colorHex || colorMap[textStyleColor] || "#ffffff";
    const strokeWidth = Math.max(3, Math.round(fontSize * 0.16));

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = look?.decoration === "punchline" ? "#1B1B1B" : "rgba(0, 0, 0, 0.92)";
    ctx.fillStyle = textFillColor;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const boxed = look?.decoration === "oh-really" || look?.decoration === "good-vibes";
    const split = Math.max(2, Math.round(fontSize * 0.08));

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;
      if (boxed) {
        // Sarcasm "oh really" paper tag / Chill "good vibes" frosted pill behind each line.
        const lw = ctx.measureText(line).width;
        const padX = fontSize * (look?.decoration === "good-vibes" ? 0.8 : 0.45);
        const padY = fontSize * 0.15;
        const left = ctx.textAlign === "left" ? baseX : ctx.textAlign === "right" ? baseX - lw : baseX - lw / 2;
        const boxH = lineHeight - (lineHeight - fontSize) / 2 + padY;
        drawRoundRect(ctx, left - padX, lineY - padY, lw + padX * 2, boxH, look?.decoration === "good-vibes" ? boxH / 2 : Math.max(2, fontSize * 0.12));
        ctx.fillStyle = look?.decoration === "good-vibes" ? "rgba(255, 255, 255, 0.6)" : "#F3F4F6";
        ctx.fill();
        ctx.fillStyle = textFillColor;
        ctx.fillText(line, baseX, lineY);
        return;
      }
      ctx.strokeText(line, baseX, lineY);
      if (look?.decoration === "meltdown") {
        // Red/cyan channel split, like the post's text-shadow.
        ctx.fillStyle = "#FF1E3C";
        ctx.fillText(line, baseX - split, lineY);
        ctx.fillStyle = "#00F0FF";
        ctx.fillText(line, baseX + split, lineY);
        ctx.fillStyle = textFillColor;
      }
      ctx.fillText(line, baseX, lineY);
    });
    ctx.restore();
  }

  // 2. Burn Distinctive, High-Contrast "getREAX.com" Watermark Badge
  const wmFontSize = Math.max(14, Math.round(width * 0.024));
  ctx.save();
  ctx.font = `bold ${wmFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const wmText = "getREAX.com";
  const textMetrics = ctx.measureText(wmText);

  const dotRadius = Math.max(3, Math.round(wmFontSize * 0.22));
  const padX = Math.round(wmFontSize * 0.85);
  const padY = Math.round(wmFontSize * 0.45);
  const pillHeight = Math.round(wmFontSize * 1.9);
  const pillWidth = Math.round(textMetrics.width + dotRadius * 2 + padX * 2 + wmFontSize * 0.45);
  const pillRadius = Math.round(pillHeight / 2);

  const marginX = Math.round(width * 0.035);
  const marginY = Math.round(height * 0.035);

  // Badge goes where the user chose. "strip" = dark bar below the image (canvas must
  // already be getWatermarkStripHeight(width) taller than `height`).
  let pillX: number;
  let pillY: number;
  if (watermarkPosition === "strip") {
    const stripH = getWatermarkStripHeight(width);
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, height, width, stripH);
    pillX = Math.round((width - pillWidth) / 2);
    pillY = Math.round(height + (stripH - pillHeight) / 2);
  } else {
    pillX = watermarkPosition.endsWith("left") ? marginX : width - marginX - pillWidth;
    pillY = watermarkPosition.startsWith("top") ? marginY : height - marginY - pillHeight;
  }

  // Render Pill Background with soft shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = Math.round(wmFontSize * 0.6);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(wmFontSize * 0.2);

  ctx.fillStyle = "rgba(10, 15, 26, 0.88)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = Math.max(1.5, Math.round(width * 0.0018));

  drawRoundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillRadius);
  ctx.fill();
  ctx.stroke();

  // Reset shadow for crisp text & indicator dot
  ctx.shadowColor = "transparent";

  // Glowing Cyan Accent Dot
  const dotX = pillX + padX + dotRadius;
  const dotY = pillY + pillHeight / 2;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#22d3ee";
  ctx.fill();

  // Crisp White Watermark Text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(wmText, dotX + dotRadius + Math.round(wmFontSize * 0.45), dotY);
  ctx.restore();
}

/**
 * Triggers a standard browser file download from a Blob.
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Copy watermarked image directly into system clipboard (ready for Ctrl+V in email, Slack, etc.).
 * Automatically falls back to file download if browser clipboard image write is blocked or unsupported.
 */
export function copyWatermarkedImageToClipboard(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null,
  watermarkPosition: WatermarkPosition = DEFAULT_WATERMARK_POSITION
): Promise<{ success: boolean; fallbackDownloaded?: boolean; error?: string }> {
  const fileName = `reax-${clip.id.slice(0, 8)}.png`;

  // Start rendering now, but DO NOT await before clipboard.write().
  const pngBlobPromise: Promise<Blob> = generateWatermarkedCanvas(clip, mediaEl, watermarkPosition).then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to render image canvas"))), "image/png")
      )
  );

  const downloadFallback = () =>
    pngBlobPromise
      .then((blob) => { triggerFileDownload(blob, fileName); return { success: false, fallbackDownloaded: true }; })
      .catch((err: any) => ({ success: false, error: err?.message || "Failed to process image" }));

  const canWriteImage =
    typeof navigator !== "undefined" && !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined";

  if (!canWriteImage) return downloadFallback();

  let writePromise: Promise<void>;
  try {
    // Synchronous call inside the click: Safari + Chrome accept a Promise<Blob> here.
    writePromise = navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlobPromise })]);
  } catch (e) {
    writePromise = Promise.reject(e);
  }
  return writePromise
    .then(() => ({ success: true }))
    .catch((err) => {
      console.warn("Clipboard image write failed, falling back to download:", err);
      return downloadFallback();
    });
}

/**
 * Download high-res watermarked reaction image or trigger native share sheet on touch devices.
 */
export async function downloadWatermarkedImage(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null,
  watermarkPosition: WatermarkPosition = DEFAULT_WATERMARK_POSITION
): Promise<void> {
  const canvas = await generateWatermarkedCanvas(clip, mediaEl, watermarkPosition);

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve();
        return;
      }

      const fileName = `reax-${clip.id.slice(0, 8)}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (
        isTouch &&
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "Reax Clip",
            text: clip.overlayText ? `"${clip.overlayText}" on getREAX.com` : "getREAX.com",
          });
          resolve();
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") {
            resolve();
            return;
          }
        }
      }

      triggerFileDownload(blob, fileName);
      resolve();
    }, "image/png");
  });
}

/** Natural size of the clip's video; uses the on-screen element if it is loaded, otherwise loads metadata. */
export async function getVideoDimensions(clip: Clip, videoEl?: HTMLVideoElement | null): Promise<{ width: number; height: number }> {
  if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) return { width: videoEl.videoWidth, height: videoEl.videoHeight };
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.crossOrigin = "anonymous";
    const timer = setTimeout(() => reject(new Error("Couldn't read the video size.")), 10000);
    v.onloadedmetadata = () => { clearTimeout(timer); resolve({ width: v.videoWidth || 1080, height: v.videoHeight || 1920 }); };
    v.onerror = () => { clearTimeout(timer); reject(new Error("Couldn't load the video.")); };
    v.src = clip.mediaUrl;
  });
}

/** Transparent PNG with the static pack layers, caption + getREAX.com pill, exactly as rendered for pictures. */
export async function renderOverlayPngDataUrl(
  clip: Clip,
  width: number,
  height: number,
  watermarkPosition: Exclude<WatermarkPosition, "strip"> = "bottom-right"
): Promise<string> {
  const pack = await preparePackExport(clip.style);
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D canvas context");
  ctx.clearRect(0, 0, canvas.width, canvas.height);   // keep it transparent
  renderWatermarkAndCaptions(ctx, canvas.width, canvas.height, clip, watermarkPosition, pack);
  return canvas.toDataURL("image/png");
}

function isVideoClip(clip: Clip): boolean {
  const u = clip.mediaUrl || "";
  return clip.mediaType === "video" || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u) || u.includes("mixkit-") || u.includes("uploads/clip-");
}

/** True when "Create Video" should be offered: a video, or a picture/GIF with a voice note.
 *  imageUrl overrides the picture (old audio-only replies that reuse the parent's picture). */
export function canExportAsVideo(clip: Clip | null | undefined, imageUrl?: string | null): boolean {
  if (!clip || clip.deleted) return false;
  if (isVideoClip(clip)) return true;
  if (!clip.voiceAudioUrl) return false;
  const u = imageUrl || (clip.mediaType === "audio" ? "" : clip.mediaUrl || "");
  return u.startsWith("https://") && !/\.(mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(u);
}

/** Asks the server to render the watermarked MP4, then downloads it as a File (does NOT save/share). */
export async function exportWatermarkedVideo(
  clip: Clip,
  videoEl?: HTMLVideoElement | null,
  onProgress?: (pct: number) => void,
  watermarkPosition: WatermarkPosition = DEFAULT_WATERMARK_POSITION
): Promise<{ file: File; downloadUrl: string; fileName: string }> {
  onProgress?.(5);
  const still = !isVideoClip(clip);
  let width: number, height: number;
  if (still) {
    // Picture/GIF + voice note: the server makes a still-image MP4; size the overlay to the picture.
    const img = await loadCORSImage(clip.mediaUrl);
    width = img.naturalWidth || 1080; height = img.naturalHeight || 1080;
  } else {
    ({ width, height } = await getVideoDimensions(clip, videoEl));
  }
  // The server overlays this PNG at the video's own size, so it can't add a bar below the
  // frame; "strip" falls back to the default bottom-right corner for videos.
  const videoPos: Exclude<WatermarkPosition, "strip"> = watermarkPosition === "strip" ? "bottom-right" : watermarkPosition;
  const overlayPng = await renderOverlayPngDataUrl(clip, width, height, videoPos);
  onProgress?.(15);

  let pct = 15;
  const tick = setInterval(() => { pct = Math.min(85, pct + 3); onProgress?.(pct); }, 700);
  try {
    const token = await getAuthToken();
    const res = await fetch(`/api/clips/${encodeURIComponent(clip.id)}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ overlayPng })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Couldn't create the video. Please try again.");
    onProgress?.(90);
    const vidRes = await fetch(data.url);
    if (!vidRes.ok) throw new Error("Couldn't download the finished video. Please try again.");
    const blob = await vidRes.blob();
    const fileName = data.fileName || `reax-${clip.id.slice(0, 8)}.mp4`;
    onProgress?.(100);
    return { file: new File([blob], fileName, { type: "video/mp4" }), downloadUrl: data.downloadUrl || data.url, fileName };
  } finally {
    clearInterval(tick);
  }
}

/** MUST be called directly from a click/tap handler (fresh user gesture). Phones: share sheet (Save Video to Photos). Desktop: file download. */
export async function deliverVideoFile(file: File, clip: Clip): Promise<void> {
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (isTouch && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Reax Video", text: clip.overlayText ? `"${clip.overlayText}" on getREAX.com` : "getREAX.com" });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
  }
  triggerFileDownload(file, file.name);   // same-origin blob URL, so the download attribute works
}

