import { getAuthToken, getSupabaseClient } from "./supabaseClient";

export async function uploadAvatar(file: File): Promise<string> {
  const isImageMime = file.type && file.type.startsWith("image/");
  const isImageExt = /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(file.name || "");
  if (!isImageMime && !isImageExt) {
    throw new Error("Please choose an image.");
  }

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
  } catch {
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new Error(
        "Couldn't read that image. HEIC photos work in Safari; otherwise try a JPEG or PNG."
      );
    }
  }

  const render = (size: number): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not process image.");
    }
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const scale = Math.min(size / bmp.width, size / bmp.height);
    const dw = Math.round(bmp.width * scale);
    const dh = Math.round(bmp.height * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);
    ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, dx, dy, dw, dh);
    return canvas;
  };

  const encode = (
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number
  ): Promise<Blob | null> => {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  };

  const probe = await encode(render(8), "image/webp", 0.8);
  const type = probe?.type === "image/webp" ? "image/webp" : "image/jpeg";

  let blob: Blob | null = null;
  outer: for (const size of [256, 192, 128]) {
    const c = render(size);
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const b = await encode(c, type, q);
      if (b && b.type === type && b.size <= 300 * 1024) {
        blob = b;
        break outer;
      }
    }
  }

  bmp.close?.();

  if (!blob) {
    throw new Error("Image too large.");
  }

  const token = await getAuthToken();
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind: "avatar", contentType: blob.type }),
  });

  if (!signRes.ok) {
    const errData = await signRes.json().catch(() => null);
    throw new Error(errData?.error || "Could not prepare upload.");
  }

  const sign = await signRes.json();

  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error("Could not connect to storage.");
  }

  const uploadResult = await supabase.storage
    .from(sign.bucket)
    .uploadToSignedUrl(sign.path, sign.token, blob, { contentType: blob.type });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || "Failed to upload image.");
  }

  const saveRes = await fetch("/api/me/avatar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path: sign.path, bucket: sign.bucket }),
  });

  if (!saveRes.ok) {
    const errData = await saveRes.json().catch(() => null);
    throw new Error(errData?.error || "Could not save profile photo.");
  }

  const data = await saveRes.json();
  return data.avatarUrl;
}
