import { Clip } from "../types";

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
export async function generateWatermarkedCanvas(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D canvas context");

  const isVideo = clip.mediaType === "video";
  let naturalW = 1280;
  let naturalH = 720;

  if (isVideo && mediaEl instanceof HTMLVideoElement && mediaEl.videoWidth > 0) {
    naturalW = mediaEl.videoWidth;
    naturalH = mediaEl.videoHeight;
    canvas.width = naturalW;
    canvas.height = naturalH;
    ctx.drawImage(mediaEl, 0, 0, naturalW, naturalH);
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
    canvas.height = exportH;
    ctx.drawImage(imgObj, 0, 0, exportW, exportH);
  }

  const width = canvas.width;
  const height = canvas.height;

  // Parse effect and style parameters: "effect|preset|color|position"
  const [, textStylePreset = "classic", textStyleColor = "white", textStylePosition = "bottom"] = (clip.effect || "zoom").split("|");

  // Draw Cinema black letterbox bars if cinema preset is active
  if (textStylePreset === "cinema" && textStylePosition !== "none") {
    const barHeight = Math.round(height * 0.08);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillRect(0, height - barHeight, width, barHeight);
  }

  // 1. Overlay Caption Text (Intelligent Auto-Fitting: NEVER CUTS OFF OR USES "...")
  if (clip.overlayText && clip.overlayText.trim() && textStylePosition !== "none") {
    const rawText = clip.overlayText.trim();
    const text = textStylePreset === "comic" ? rawText.toLowerCase() : rawText.toUpperCase();

    const maxTextWidth = width * 0.88;
    const maxTextHeight = textStylePosition.startsWith("top") || textStylePosition.startsWith("bottom")
      ? height * 0.36
      : height * 0.65;

    const getFontSpec = (sz: number) => {
      if (textStylePreset === "comic") return `italic 900 ${sz}px serif`;
      if (textStylePreset === "glitch") return `900 ${sz}px monospace`;
      if (textStylePreset === "cinema") return `400 ${sz}px serif`;
      if (textStylePreset === "bold") return `800 ${sz}px sans-serif`;
      return `900 ${sz}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    };

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
    };
    const textFillColor = colorMap[textStyleColor] || "#ffffff";
    const strokeWidth = Math.max(3, Math.round(fontSize * 0.16));

    ctx.save();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
    ctx.fillStyle = textFillColor;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;
      ctx.strokeText(line, baseX, lineY);
      ctx.fillText(line, baseX, lineY);
    });
    ctx.restore();
  }

  // 2. Burn Distinctive, High-Contrast "getREAX.com" Watermark Badge
  const hasCaption = Boolean(clip.overlayText && clip.overlayText.trim() && textStylePosition !== "none");
  const pos = hasCaption ? textStylePosition : "bottom";

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

  let pillX = width - marginX - pillWidth;
  let pillY = marginY;

  // Determine safe opposite position for the watermark badge
  if (pos.startsWith("top") || pos === "top-right" || pos === "top-left") {
    // Caption is at top -> place watermark at bottom-right
    pillX = width - marginX - pillWidth;
    pillY = height - marginY - pillHeight;
  } else if (pos.includes("right") && !pos.startsWith("bottom")) {
    // Caption is right -> place watermark at top-left
    pillX = marginX;
    pillY = marginY;
  } else {
    // Caption is bottom or center -> place watermark at top-right
    pillX = width - marginX - pillWidth;
    pillY = marginY;
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

  return canvas;
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
 * Copy watermarked image directly into system clipboard (ready for Ctrl+V in email, 9gag, Slack, etc.).
 * Automatically falls back to file download if browser clipboard image write is blocked or unsupported.
 */
export async function copyWatermarkedImageToClipboard(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null
): Promise<{ success: boolean; fallbackDownloaded?: boolean; error?: string }> {
  try {
    const canvas = await generateWatermarkedCanvas(clip, mediaEl);

    return await new Promise<{ success: boolean; fallbackDownloaded?: boolean; error?: string }>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          return resolve({ success: false, error: "Failed to render image canvas" });
        }

        const fileName = `reax-${clip.id.slice(0, 8)}.png`;

        // Modern Clipboard API: write image/png
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.write === "function" &&
          typeof ClipboardItem !== "undefined"
        ) {
          try {
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            return resolve({ success: true });
          } catch (writeErr: any) {
            console.warn("Direct clipboard image write failed (e.g. permission or iframe limit), falling back to download:", writeErr);
          }
        }

        // Automatic fallback: download image file
        triggerFileDownload(blob, fileName);
        return resolve({ success: false, fallbackDownloaded: true });
      }, "image/png");
    });
  } catch (err: any) {
    console.error("Error copying watermarked image:", err);
    return { success: false, error: err.message || "Failed to process image" };
  }
}

/**
 * Download high-res watermarked reaction image or trigger native share sheet.
 */
export async function downloadWatermarkedImage(
  clip: Clip,
  mediaEl?: HTMLImageElement | HTMLVideoElement | null
): Promise<void> {
  const canvas = await generateWatermarkedCanvas(clip, mediaEl);

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve();
        return;
      }

      const fileName = `reax-${clip.id.slice(0, 8)}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (
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
