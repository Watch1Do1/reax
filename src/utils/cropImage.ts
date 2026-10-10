/**
 * Image cropping and oriented bitmap loading utilities.
 */

/**
 * Loads an upright image from a URL or data URI with EXIF orientation applied.
 * Tries createImageBitmap with { imageOrientation: "from-image" },
 * then createImageBitmap fallback, then standard HTMLImageElement fallback.
 */
export async function loadOrientedBitmap(src: string): Promise<ImageBitmap | HTMLImageElement> {
    const res = await fetch(src);
    const blob = await res.blob();
  
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob, { imageOrientation: "from-image" } as any);
      } catch {
        try {
          return await createImageBitmap(blob);
        } catch {
          // Fall back to Image element
        }
      }
    }
  
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image. Please try a JPEG or PNG."));
      img.src = src;
    });
  }
  
  function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), type, quality);
    });
  }
  
  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("FileReader result is not a string"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to convert blob to data URL"));
      reader.readAsDataURL(blob);
    });
  }
  
  /**
   * Renders a crop rect from source pixels to a Blob and dataUrl.
   * Output size is scaled down so long side is at most 2048 (never scaled up).
   */
  export async function renderCrop(
    source: ImageBitmap | HTMLImageElement,
    rect: { x: number; y: number; w: number; h: number },
    srcMime: string
  ): Promise<{ blob: Blob; dataUrl: string; mimeType: string }> {
    try {
      const maxDim = Math.max(rect.w, rect.h);
      const scale = maxDim > 2048 ? 2048 / maxDim : 1;
      const outW = Math.max(1, Math.round(rect.w * scale));
      const outH = Math.max(1, Math.round(rect.h * scale));
  
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not initialize 2D canvas context for cropping");
      }
  
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
  
      let targetBlob: Blob | null = null;
      let targetMime = "image/jpeg";
  
      if (srcMime === "image/png") {
        // Sample alpha to see if image has transparency
        let hasAlpha = false;
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 64;
        sampleCanvas.height = 64;
        const sCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
        if (sCtx) {
          sCtx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, 64, 64);
          try {
            const imgData = sCtx.getImageData(0, 0, 64, 64);
            const data = imgData.data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] < 255) {
                hasAlpha = true;
                break;
              }
            }
          } catch {
            // If security check fails, assume no alpha
          }
        }
  
        if (hasAlpha) {
          // Draw onto clean canvas (transparent)
          ctx.clearRect(0, 0, outW, outH);
          ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
          const pngBlob = await canvasToBlob(canvas, "image/png");
          if (pngBlob && pngBlob.size <= 2 * 1024 * 1024) {
            targetBlob = pngBlob;
            targetMime = "image/png";
          }
        }
  
        // If no alpha or PNG > 2MB, try webp at 0.9
        if (!targetBlob) {
          ctx.clearRect(0, 0, outW, outH);
          ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
          const webpBlob = await canvasToBlob(canvas, "image/webp", 0.9);
          if (webpBlob && webpBlob.type === "image/webp") {
            targetBlob = webpBlob;
            targetMime = "image/webp";
          }
        }
      }
  
      // Fallback or non-PNG: fill with #0f172a first and encode JPEG at 0.9
      if (!targetBlob) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
        const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.9);
        if (!jpegBlob) {
          throw new Error("Failed to encode cropped image to JPEG");
        }
        targetBlob = jpegBlob;
        targetMime = "image/jpeg";
      }
  
      const dataUrl = await blobToDataUrl(targetBlob);
      return {
        blob: targetBlob,
        dataUrl,
        mimeType: targetMime,
      };
    } finally {
      try {
        if (source && "close" in source && typeof (source as any).close === "function") {
          (source as any).close();
        }
      } catch {
        // Ignore close error
      }
    }
  }
  