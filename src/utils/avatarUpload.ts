import { getAuthToken, getSupabaseClient } from "./supabaseClient";

export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Please choose an image.");
  }

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG.");
  }

  const s = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - s) / 2;
  const sy = (bmp.height - s) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process image.");
  }
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, 256, 256);

  let blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85)
  );
  if (!blob || blob.type !== "image/webp") {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
  }
  if (!blob) {
    throw new Error("Could not process image.");
  }

  if (blob.size > 300 * 1024) {
    const fallbackType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, fallbackType, 0.7)
    );
    if (!blob || blob.size > 300 * 1024) {
      throw new Error("Image too large.");
    }
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
