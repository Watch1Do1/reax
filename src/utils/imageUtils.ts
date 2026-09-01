/**
 * Utility functions for handling and converting image files in the browser.
 */

export function isHeicFile(file: File): boolean {
    const fileName = (file.name || "").toLowerCase();
    const fileType = (file.type || "").toLowerCase();
    return (
      fileType === "image/heic" ||
      fileType === "image/heif" ||
      fileName.endsWith(".heic") ||
      fileName.endsWith(".heif")
    );
  }
  
  /**
   * Converts a HEIC/HEIF photo to JPEG using the browser canvas.
   * Scales down to max width 1600 preserving aspect ratio, quality 0.85.
   */
  export async function convertHeicToJpeg(file: File): Promise<{ data: string; mimeType: "image/jpeg" }> {
    const url = URL.createObjectURL(file);
    let bitmapToClose: ImageBitmap | null = null;
  
    try {
      let imgSource: CanvasImageSource;
      let width = 0;
      let height = 0;
  
      // 1 & 2. Load into new Image() or createImageBitmap
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(file);
          bitmapToClose = bitmap;
          imgSource = bitmap;
          width = bitmap.width;
          height = bitmap.height;
        } catch {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = (err) => reject(err);
            image.src = url;
          });
          imgSource = img;
          width = img.naturalWidth || img.width;
          height = img.naturalHeight || img.height;
        }
      } else {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = (err) => reject(err);
          image.src = url;
        });
        imgSource = img;
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
      }
  
      if (!width || !height) {
        throw new Error("Invalid image dimensions");
      }
  
      // 3. Draw to canvas at max width 1600 (keep aspect ratio)
      const maxWidth = 1600;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
  
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to create canvas 2D context");
      }
      ctx.drawImage(imgSource, 0, 0, width, height);
  
      // 4. canvas.toBlob(blob => ..., "image/jpeg", 0.85)
      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas conversion to JPEG failed"));
          },
          "image/jpeg",
          0.85
        );
      });
  
      // 5. FileReader readAsDataURL the jpeg blob
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("FileReader result is not a string"));
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(jpegBlob);
      });
  
      // 6. Proceed with kind: "image", mimeType: "image/jpeg"
      return {
        data: dataUrl,
        mimeType: "image/jpeg"
      };
    } finally {
      // Release bitmap memory if created
      if (bitmapToClose && typeof bitmapToClose.close === "function") {
        try {
          bitmapToClose.close();
        } catch {}
      }
      // 7. RevokeObjectURL
      URL.revokeObjectURL(url);
    }
  }
  